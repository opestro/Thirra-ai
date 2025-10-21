import { generateTitleFromPrompt } from '../services/llm.service.js';
import { createConversation, getNextTurnIndex, createTurn } from '../services/chat.service.js';
import { isValidPrompt, formatChatResponse } from '../utils/chat.utils.js';
import { extractAssistantAttachments } from '../services/attachments.service.js';
import { generateAssistantTextWithMemory } from '../services/langchain.service.js';

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