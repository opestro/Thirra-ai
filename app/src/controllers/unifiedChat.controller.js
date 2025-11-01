import { createConversation, createTurn, getConversationMeta } from '../services/chat.service.js';
import { isValidPrompt, formatChatResponse } from '../utils/chat.utils.js';
import { extractAssistantAttachments } from '../services/attachments.service.js';
import { streamAIResponse, generateTitle } from '../services/ai.service.js';

// streamUnifiedChat() - Simplified streaming with title generation
export async function streamUnifiedChat(req, res, next) {
  try {
    const { conversationId, prompt } = req.body || {};
    if (!isValidPrompt(prompt)) {
      res.status(400).json({ error: 'prompt required' });
      return;
    }

    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const userFiles = (req.files && req.files.user_attachments) || [];
    const isNew = !conversationId;

    let conversation;
    if (conversationId) {
      conversation = await getConversationMeta(req, conversationId);
    } else {
      // Generate title for new conversation
      const title = await generateTitle(prompt);
      const c = await createConversation(req, title);
      conversation = { id: c.id, title: c.title, created: c.created, updated: c.updated };
    }

    res.write(JSON.stringify({ type: 'init', conversation }) + '\n');

    // Stream response
    const chunkGen = await streamAIResponse({
      pb: req.pb,
      conversationId: conversation.id,
      prompt,
      files: userFiles,
      userInstruction: req.user?.instruction,
    });

    let assistantText = '';
    for await (const chunk of chunkGen) {
      // Handle reasoning phase markers
      if (chunk === '___REASONING_START___') {
        res.write(JSON.stringify({ type: 'reasoning', status: 'start', message: '🧠 Thinking...' }) + '\n');
        continue;
      }
      if (chunk === '___REASONING_END___') {
        res.write(JSON.stringify({ type: 'reasoning', status: 'complete', message: '✅ Analysis complete' }) + '\n');
        continue;
      }
      
      // Regular content
      assistantText += chunk;
      res.write(JSON.stringify({ type: 'chunk', text: chunk }) + '\n');
    }

    const usage = chunkGen.getUsage?.() || {};
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
    next(err);
  }
}

// streamChat() - Backward compatible endpoint (same as streamUnifiedChat)
export async function streamChat(req, res, next) {
  return streamUnifiedChat(req, res, next);
}