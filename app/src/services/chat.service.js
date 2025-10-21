export async function createConversation(req, title) {
  try {
    return await req.pb.collection('conversations').create({ title, owner: req.user.id });
  } catch (e) {
    const msg = e?.response?.message || e.message || 'Failed to create conversation';
    const err = new Error(msg);
    err.status = 400;
    throw err;
  }
}

export async function getNextTurnIndex(req, conversationId) {
  const latest = await req.pb.collection('turns').getList(1, 1, {
    filter: `conversation="${conversationId}"`,
    sort: '-index',
  });
  return latest.items.length ? latest.items[0].index + 1 : 1;
}

export async function createTurn(req, { conversationId, index, prompt, assistantText, files = [], assistantAttachments = [] }) {
  const hasUserFiles = Array.isArray(files) && files.length > 0;
  const hasAssistantFiles = Array.isArray(assistantAttachments) && assistantAttachments.length > 0;

  if (hasUserFiles || hasAssistantFiles) {
    const form = new FormData();
    form.append('conversation', conversationId);
    form.append('index', index);
    form.append('user_text', prompt);
    form.append('assistant_text', assistantText);

    // user attachments
    if (hasUserFiles) {
      for (const f of files) {
        const blob = new Blob([f.buffer], { type: f.mimetype || 'application/octet-stream' });
        form.append('user_attachments', blob, f.originalname || 'upload.bin');
      }
    }

    // assistant attachments
    if (hasAssistantFiles) {
      for (const a of assistantAttachments) {
        const blob = new Blob([a.buffer], { type: a.mimeType || 'application/octet-stream' });
        form.append('assistant_attachments', blob, a.filename || 'assistant.bin');
      }
    }

    return await req.pb.collection('turns').create(form);
  }

  const payload = {
    conversation: conversationId,
    index,
    user_text: prompt,
    assistant_text: assistantText,
  };

  return await req.pb.collection('turns').create(payload);
}