import { streamAIResponse, generateTitle } from '../services/ai.service.js';
import { createConversation, createTurn, getConversationMeta } from '../services/chat.service.js';
import { isValidPrompt, formatChatResponse } from '../utils/chat.utils.js';
import { extractAssistantAttachments } from '../services/attachments.service.js';


// streamChat() - NDJSON chunked streaming
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
      // New conversation - generate title
      const title = await generateTitle(prompt);
      console.log(`[Conversation] Created new conversation with title: ${title}`);
      const c = await createConversation(req, title);
      conversation = { id: c.id, title: c.title, created: c.created, updated: c.updated };
    }

    // Send init event
    res.write(JSON.stringify({ type: 'init', conversation }) + '\n');

    // Stream AI response
    const chunkGen = await streamAIResponse({
      pb: req.pb,
      conversationId: conversation.id,
      prompt,
      files: userFiles,
      userInstruction: req.user?.instruction,
    });

    let assistantText = '';
    for await (const chunk of chunkGen) {
      assistantText += chunk;
      res.write(JSON.stringify({ type: 'chunk', text: chunk }) + '\n');
    }

    const usage = (typeof chunkGen.getUsage === 'function') ? chunkGen.getUsage() : {};

    const assistantAttachments = extractAssistantAttachments(assistantText);
    const turn = await createTurn(req, {
      conversationId: conversation.id,
      prompt,
      assistantText,
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
    // Also pass to error middleware for logging
    next(err);
  }
}