import { createConversation, createTurn, getConversationMeta } from '../services/chat.service.js';
import { isValidPrompt, formatChatResponse } from '../utils/chat.utils.js';
import { extractAssistantAttachments } from '../services/attachments.service.js';
import { streamUnifiedAssistantResponse, generateTitleFromPrompt } from '../services/unifiedLangchain.service.js';

// streamUnifiedChat() - NDJSON chunked streaming with unified title/summary/response
export async function streamUnifiedChat(req, res, next) {
  try {
    const { conversationId, prompt } = req.body || {};
    if (!isValidPrompt(prompt)) {
      res.status(400).set('Content-Type', 'application/json').end(JSON.stringify({ error: 'prompt required' }));
      return;
    }

    // Prepare streaming headers
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const userFiles = (req.files && req.files.user_attachments) || [];
    const isNewConversation = !conversationId;

    let conversation;
    if (conversationId) {
      conversation = await getConversationMeta(req, conversationId);
    } else {
      // For new conversations, we'll extract title from unified output
      // Create placeholder conversation first
      const c = await createConversation(req, 'New Conversation');
      conversation = { id: c.id, title: c.title, created: c.created, updated: c.updated };
    }

    // Send init event so frontend can prepare UI
    res.write(JSON.stringify({ type: 'init', conversation }) + '\n');

    const chunkGen = await streamUnifiedAssistantResponse({
      pb: req.pb,
      conversationId: conversation.id,
      prompt,
      files: userFiles,
      userInstruction: req.user?.instruction,
      needsTitle: isNewConversation, // Only generate title for new conversations
    });

    let assistantText = '';
    let chunkCount = 0;
    
    // Stream chunks to client
    for await (const chunk of chunkGen) {
      assistantText += chunk;
      chunkCount++;
      res.write(JSON.stringify({ type: 'chunk', text: chunk, chunkIndex: chunkCount }) + '\n');
    }

    const usage = (typeof chunkGen.getUsage === 'function') ? chunkGen.getUsage() : {};

    // Parse unified output
    let parsedOutput;
    try {
      parsedOutput = chunkGen.parseOutput();
      console.log(`[Unified] Parsed output - Title: ${parsedOutput.hasTitle}, Summary: ${parsedOutput.hasSummary}, Fallback: ${parsedOutput.usedFallback}`);
    } catch (parseError) {
      console.error('[Unified] Failed to parse output:', parseError.message);
      // Fallback to raw output
      parsedOutput = {
        title: null,
        summary: null,
        response: assistantText,
        hasTitle: false,
        hasSummary: false,
        errors: [`Parse error: ${parseError.message}`],
        usedFallback: true
      };
    }

    // Update conversation title if this is a new conversation and we got a title
    if (isNewConversation && parsedOutput.hasTitle && parsedOutput.title) {
      try {
        await req.pb.collection('conversations').update(conversation.id, { 
          title: parsedOutput.title.slice(0, 120) 
        });
        conversation.title = parsedOutput.title.slice(0, 120);
        console.log(`[Unified] Updated conversation title: "${conversation.title}"`);
      } catch (titleUpdateError) {
        console.warn('[Unified] Failed to update conversation title:', titleUpdateError.message);
      }
    }

    // Extract assistant attachments from the response content
    const responseText = parsedOutput.response || assistantText;
    const assistantAttachments = extractAssistantAttachments(responseText);

    // Create turn with enhanced metadata
    const turn = await createTurn(req, {
      conversationId: conversation.id,
      prompt,
      assistantText: responseText,
      files: userFiles,
      assistantAttachments,
      usage,
    });

    // Add unified output metadata to turn if available
    if (parsedOutput.hasSummary) {
      try {
        // Store summary as metadata (you might want to add a summary field to your turns table)
        console.log(`[Unified] Generated summary: "${parsedOutput.summary}"`);
        // For now, we'll just log it. You could extend the turn creation to store this.
      } catch (summaryError) {
        console.warn('[Unified] Failed to store summary:', summaryError.message);
      }
    }

    const finalPayload = formatChatResponse(conversation, turn);
    
    // Enhanced final payload with unified output metadata
    const enhancedPayload = {
      ...finalPayload,
      unified: {
        hasTitle: parsedOutput.hasTitle,
        hasSummary: parsedOutput.hasSummary,
        usedFallback: parsedOutput.usedFallback,
        errors: parsedOutput.errors || [],
        summary: parsedOutput.summary || null,
        rawChunks: chunkCount
      }
    };

    res.write(JSON.stringify({ type: 'final', data: enhancedPayload }) + '\n');
    res.end();
    
  } catch (err) {
    try {
      res.write(JSON.stringify({ type: 'error', message: err?.message || 'unified stream failed' }) + '\n');
    } catch {}
    res.end();
    // Also pass to error middleware for logging
    next(err);
  }
}

// Fallback to original chat for backward compatibility
export async function streamChat(req, res, next) {
  try {
    const { conversationId, prompt } = req.body || {};
    if (!isValidPrompt(prompt)) {
      res.status(400).set('Content-Type', 'application/json').end(JSON.stringify({ error: 'prompt required' }));
      return;
    }

    // Prepare streaming headers
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const userFiles = (req.files && req.files.user_attachments) || [];

    let conversation;
    if (conversationId) {
      conversation = await getConversationMeta(req, conversationId);
    } else {
      // New conversation flow - separate title generation
      const title = await generateTitleFromPrompt(prompt);
      const c = await createConversation(req, title);
      conversation = { id: c.id, title: c.title, created: c.created, updated: c.updated };
    }

    // Send init event so frontend can prepare UI
    res.write(JSON.stringify({ type: 'init', conversation }) + '\n');

    const chunkGen = await streamUnifiedAssistantResponse({
      pb: req.pb,
      conversationId: conversation.id,
      prompt,
      files: userFiles,
      userInstruction: req.user?.instruction,
      needsTitle: false, // Don't generate title since we already have one
    });

    let assistantText = '';
    for await (const chunk of chunkGen) {
      assistantText += chunk;
      res.write(JSON.stringify({ type: 'chunk', text: chunk }) + '\n');
    }

    const usage = (typeof chunkGen.getUsage === 'function') ? chunkGen.getUsage() : {};

    // Parse output but only use response part
    let responseText = assistantText;
    try {
      const parsedOutput = chunkGen.parseOutput();
      if (parsedOutput.response) {
        responseText = parsedOutput.response;
      }
    } catch (parseError) {
      console.warn('[Unified] Parse failed in compatibility mode, using raw output:', parseError.message);
    }

    const assistantAttachments = extractAssistantAttachments(responseText);
    const turn = await createTurn(req, {
      conversationId: conversation.id,
      prompt,
      assistantText: responseText,
      files: userFiles,
      assistantAttachments,
      usage,
    });

    const finalPayload = formatChatResponse(conversation, turn);
    res.write(JSON.stringify({ type: 'final', data: finalPayload }) + '\n');
    res.end();
    
  } catch (err) {
    try {
      res.write(JSON.stringify({ type: 'error', message: err?.message || 'stream failed' }) + '\n');
    } catch {}
    res.end();
    next(err);
  }
}