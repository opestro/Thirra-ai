/**
 * Webhooks Controller
 * 
 * Handles incoming webhooks from external services
 */

import { queryImageTask } from "../tools/imageGeneration.tool.js";
import { findToolCallByExternalId, updateToolCallResult } from "../services/toolCalls.service.js";
import { createAdminPbClient } from "../config/pocketbase.js";

/**
 * Handle Nanobanana image generation callback
 * 
 * Receives notification when image generation completes
 */
export async function handleNanobananaWebhook(req, res, next) {
  try {
    const payload = req.body;
    
    console.log(`[Webhook] Nanobanana callback received:`, JSON.stringify({
      code: payload.code,
      taskId: payload.data?.taskId,
      state: payload.data?.state,
    }));
    
    // Validate payload
    if (!payload.data || !payload.data.taskId) {
      console.error('[Webhook] Invalid payload - missing data or taskId');
      res.status(400).json({ error: 'Invalid webhook payload' });
      return;
    }
    
    const { code, data, msg } = payload;
    const { taskId, state, resultJson, failCode, failMsg } = data;
    
    // Create admin PocketBase client for webhook operations
    const pb = createAdminPbClient();
    
    // Success callback
    if (code === 200 && state === 'success') {
      let resultUrls = [];
      
      try {
        const result = JSON.parse(resultJson || '{}');
        resultUrls = result.resultUrls || [];
      } catch (e) {
        console.error('[Webhook] Failed to parse resultJson:', e);
      }
      
      console.log(`[Webhook] Image generation successful:`, {
        taskId,
        imageCount: resultUrls.length,
        costTime: data.costTime,
        consumeCredits: data.consumeCredits,
      });
      
      // Update tool call record in PocketBase
      try {
        console.log(`[Webhook] Looking for tool_call with external_id: ${taskId}`);
        const toolCall = await findToolCallByExternalId(pb, taskId);
        
        if (toolCall) {
          console.log(`[Webhook] Found tool_call record: ${toolCall.id}, updating...`);
          await updateToolCallResult(pb, toolCall.id, {
            result: {
              resultUrls,
              costTime: data.costTime,
              consumeCredits: data.consumeCredits,
              completeTime: data.completeTime,
            },
            status: 'completed',
          });
          console.log(`[Webhook] Updated tool call record: ${toolCall.id}`);
        } else {
          console.warn(`[Webhook] No tool call record found for taskId: ${taskId}`);
        }
      } catch (error) {
        console.error('[Webhook] Failed to update tool call record:', error);
        console.error('[Webhook] Error details:', error.response || error.message);
      }
      
      res.status(200).json({ 
        success: true, 
        message: 'Webhook processed successfully',
        taskId,
        imageCount: resultUrls.length,
      });
      return;
    }
    
    // Failure callback
    if (code === 501 || state === 'fail') {
      console.error(`[Webhook] Image generation failed:`, {
        taskId,
        failCode,
        failMsg,
      });
      
      // Update tool call record with failure
      try {
        console.log(`[Webhook] Looking for tool_call with external_id: ${taskId}`);
        const toolCall = await findToolCallByExternalId(pb, taskId);
        
        if (toolCall) {
          console.log(`[Webhook] Found tool_call record: ${toolCall.id}, updating with failure...`);
          await updateToolCallResult(pb, toolCall.id, {
            status: 'failed',
            error: `${failCode}: ${failMsg}`,
          });
          console.log(`[Webhook] Updated tool call record with failure: ${toolCall.id}`);
        } else {
          console.warn(`[Webhook] No tool call record found for taskId: ${taskId}`);
        }
      } catch (error) {
        console.error('[Webhook] Failed to update tool call record:', error);
      }
      
      res.status(200).json({ 
        success: true, 
        message: 'Failure webhook processed',
        taskId,
      });
      return;
    }
    
    // Unknown state
    console.warn(`[Webhook] Unknown webhook state:`, { code, state });
    res.status(200).json({ success: true, message: 'Webhook received' });
    
  } catch (error) {
    console.error('[Webhook] Error processing nanobanana callback:', error);
    next(error);
  }
}

/**
 * Query image task status manually
 * GET /api/webhooks/nanobanana/status/:taskId
 */
export async function queryImageStatus(req, res, next) {
  try {
    const { taskId } = req.params;
    
    if (!taskId) {
      res.status(400).json({ error: 'Task ID is required' });
      return;
    }
    
    const taskData = await queryImageTask(taskId);
    
    res.status(200).json({
      success: true,
      data: taskData,
    });
  } catch (error) {
    console.error('[Webhook] Error querying task status:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

