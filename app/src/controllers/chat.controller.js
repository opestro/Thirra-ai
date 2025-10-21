import { generateTitleFromPrompt } from '../services/llm.service.js';
import { createConversation, getNextTurnIndex, createTurn } from '../services/chat.service.js';
import { isValidPrompt, formatChatResponse } from '../utils/chat.utils.js';
import { extractAssistantAttachments } from '../services/attachments.service.js';
import { generateAssistantTextWithMemory, streamAssistantTextWithMemory } from '../services/langchain.service.js';

// startChat()
export async function startChat(req, res, next) {
  try {
    const { prompt } = req.body || {};
    if (!isValidPrompt(prompt)) return res.status(400).json({ error: 'prompt required' });

    // Generate title via LLM
    const title = await generateTitleFromPrompt(prompt);
    const conversation = await createConversation(req, title);

    const userFiles = (req.files && req.files.user_attachments) || [];
    const assistantText = await generateAssistantTextWithMemory({
      pb: req.pb,
      conversationId: conversation.id,
      prompt,
      files: userFiles,
      userInstruction: req.user?.instruction,
    });
    const assistantAttachments = extractAssistantAttachments(assistantText);

    const turn = await createTurn(req, {
      conversationId: conversation.id,
      index: 1,
      prompt,
      assistantText,
      files: userFiles,
      assistantAttachments,
    });

    return res.status(201).json(formatChatResponse(conversation, turn));
  } catch (err) {
    next(err);
  }
}

// appendChat()
export async function appendChat(req, res, next) {
  try {
    const { conversationId, prompt } = req.body || {};
    if (!isValidPrompt(prompt)) return res.status(400).json({ error: 'prompt required' });
    if (!conversationId) return res.status(400).json({ error: 'conversationId required' });

    const index = await getNextTurnIndex(req, conversationId);
    const userFiles = (req.files && req.files.user_attachments) || [];
    const assistantText = await generateAssistantTextWithMemory({
      pb: req.pb,
      conversationId,
      prompt,
      files: userFiles,
      userInstruction: req.user?.instruction,
    });
    const assistantAttachments = extractAssistantAttachments(assistantText);

    const turn = await createTurn(req, {
      conversationId,
      index,
      prompt,
      assistantText,
      files: userFiles,
      assistantAttachments,
    });

    const conversation = { id: conversationId };
    return res.status(201).json(formatChatResponse(conversation, turn));
  } catch (err) {
    next(err);
  }
}

export async function Chat(req, res, next) {
  try {
    const { conversationId } = req.body || {};
    if (conversationId) {
      return await appendChat(req, res, next);
    }
    return await startChat(req, res, next);
  } catch (err) {
    next(err);
  }
}

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
    let index;
    if (conversationId) {
      index = await getNextTurnIndex(req, conversationId);
      // Fetch conversation to provide title for UI init
      try {
        const c = await req.pb.collection('conversations').getOne(conversationId);
        conversation = { id: c.id, title: c.title, created: c.created, updated: c.updated };
      } catch {
        conversation = { id: conversationId, title: 'Conversation', created: '', updated: '' };
      }
    } else {
      // New conversation flow
      const title = await generateTitleFromPrompt(prompt);
      const c = await createConversation(req, title);
      conversation = { id: c.id, title: c.title, created: c.created, updated: c.updated };
      index = 1;
    }

    // Send init event so frontend can prepare UI
    res.write(JSON.stringify({ type: 'init', conversation, index }) + '\n');

    const chunkGen = await streamAssistantTextWithMemory({
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

    const assistantAttachments = extractAssistantAttachments(assistantText);
    const turn = await createTurn(req, {
      conversationId: conversation.id,
      index,
      prompt,
      assistantText,
      files: userFiles,
      assistantAttachments,
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