/**
 * History Controller
 * 
 * Handles conversation history retrieval with tool call data
 */

import { getConversationTurns } from '../services/chat.service.js';

/**
 * Get conversation turns with tool calls
 * GET /api/conversations/:id/turns
 */
export async function getTurns(req, res, next) {
  try {
    const { id } = req.params;
    
    if (!id) {
      res.status(400).json({ error: 'Conversation ID is required' });
      return;
    }
    
    const turns = await getConversationTurns(req, id);
    
    res.status(200).json({
      success: true,
      conversationId: id,
      turns,
      count: turns.length,
    });
  } catch (error) {
    console.error('[History] Error fetching turns:', error);
    next(error);
  }
}

