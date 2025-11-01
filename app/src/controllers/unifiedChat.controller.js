import { createConversation, createTurn, getConversationMeta } from '../services/chat.service.js';
import { isValidPrompt, formatChatResponse } from '../utils/chat.utils.js';
import { extractAssistantAttachments } from '../services/attachments.service.js';
import { streamAIResponse, generateTitle, executeToolCalls } from '../services/ai.service.js';
import { createToolCall } from '../services/toolCalls.service.js';

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
      
      // Handle reasoning content (what model is thinking)
      if (chunk.startsWith('___REASONING_CONTENT___')) {
        const reasoningText = chunk.replace('___REASONING_CONTENT___', '').replace('___END_REASONING_CONTENT___', '');
        res.write(JSON.stringify({ type: 'reasoning', status: 'thinking', content: reasoningText }) + '\n');
        continue;
      }
      
      // Regular content
      assistantText += chunk;
      res.write(JSON.stringify({ type: 'chunk', text: chunk }) + '\n');
    }

    const usage = chunkGen.getUsage?.() || {};
    const toolCalls = chunkGen.getToolCalls?.() || [];
    const originalPrompt = chunkGen.getOriginalPrompt?.() || prompt;
    const assistantAttachments = extractAssistantAttachments(assistantText);

    const turn = await createTurn(req, {
      conversationId: conversation.id,
      prompt,
      assistantText,
      files: userFiles,
      assistantAttachments,
      usage,
    });

    // Handle tool calls if any
    if (toolCalls && toolCalls.length > 0) {
      console.log(`[UnifiedChat] Processing ${toolCalls.length} tool call(s)`);
      console.log(`[UnifiedChat] Tool calls:`, toolCalls.map(tc => ({ 
        id: tc.id, 
        name: tc.name, 
        hasArgs: !!tc.args 
      })));
      
      // Filter out invalid tool calls (missing name or id)
      const validToolCalls = toolCalls.filter(tc => tc.name && tc.id);
      
      if (validToolCalls.length === 0) {
        console.error(`[UnifiedChat] No valid tool calls found! Original count: ${toolCalls.length}`);
      }
      
      // Send tool call notification to client (only valid ones)
      if (validToolCalls.length > 0) {
        res.write(JSON.stringify({ 
          type: 'tool_calls', 
          count: validToolCalls.length,
          tools: validToolCalls.map(tc => ({ name: tc.name, args: tc.args }))
        }) + '\n');
      }
      
      // Execute tools with original user prompt as fallback (only valid ones)
      const toolsToExecute = validToolCalls.length > 0 ? validToolCalls : toolCalls;
      const toolResults = await executeToolCalls(toolsToExecute, originalPrompt);
      
      // Store tool call records in PocketBase (only for valid tool calls)
      for (let i = 0; i < toolsToExecute.length; i++) {
        const toolCall = toolsToExecute[i];
        const resultMsg = toolResults[i];
        let parsedResult;
        
        try {
          parsedResult = JSON.parse(resultMsg.content);
        } catch (e) {
          parsedResult = { content: resultMsg.content };
        }
        
        // Extract external ID if present (e.g., taskId for image generation)
        const externalId = parsedResult.taskId || null;
        
        await createToolCall(req.pb, {
          turnId: turn.id,
          toolCall,
          result: parsedResult,
          externalId,
        });
      }
      
      // Update turn to mark it has tool calls (only if we have valid ones)
      if (validToolCalls.length > 0) {
        try {
          await req.pb.collection('turns').update(turn.id, {
            has_tool_calls: true,
            tool_count: validToolCalls.length,
          });
          console.log(`[UnifiedChat] Updated turn ${turn.id} with tool call metadata`);
        } catch (error) {
          console.error('[UnifiedChat] Failed to update turn metadata:', error);
        }
      }
      
      // Send tool execution results to client
      res.write(JSON.stringify({ 
        type: 'tool_results',
        results: toolResults.map((tr, i) => ({
          tool: toolsToExecute[i]?.name || 'unknown',
          success: !JSON.parse(tr.content).error,
          data: JSON.parse(tr.content),
        }))
      }) + '\n');
    }

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