export function isValidPrompt(prompt) {
  return typeof prompt === 'string' && prompt.trim().length > 0;
}

export function formatChatResponse(conversation, turn) {
  return {
    conversation: {
      id: conversation.id,
      title: conversation.title,
      created: conversation.created,
      updated: conversation.updated,
    },
    turn: {
      id: turn.id,
      index: turn.index,
      user_text: turn.user_text,
      assistant_text: turn.assistant_text,
      user_attachments: turn.user_attachments || [],
      assistant_attachments: turn.assistant_attachments || [],
      created: turn.created,
      updated: turn.updated,
    },
  };
}