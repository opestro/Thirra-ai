export async function startChat(req, res, next) {
  try {
    const { prompt } = req.body || {};
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'prompt required' });
    }
    const title = suggestTitleFromPrompt(prompt, { index: 1 });
    const conversation = await req.pb.collection('conversations').create({ title, owner: req.user.id });

    const userFiles = (req.files?.user_attachments || []).map((f) => new Blob([f.buffer], { type: f.mimetype }));
    const assistantText = `Simulated response #1: I read your prompt.`;

    const turn = await req.pb.collection('turns').create({
      conversation: conversation.id,
      index: 1,
      user_text: prompt,
      assistant_text: assistantText,
      user_attachments: userFiles,
    });

    res.status(201).json({
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
        created: turn.created,
        updated: turn.updated,
      },
    });
  } catch (err) {
    next(err);
  }
}
export async function appendChat(req, res, next) {
  try {
    const { conversationId, prompt } = req.body || {};
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'prompt required' });
    }
    if (!conversationId) {
      return res.status(400).json({ error: 'conversationId required' });
    }

    const conversation = await req.pb.collection('conversations').getOne(conversationId);

    const latest = await req.pb.collection('turns').getList(1, 1, {
      filter: `conversation="${conversationId}"`,
      sort: '-index',
    });
    const nextIndex = latest.items.length ? latest.items[0].index + 1 : 1;

    const assistantText = `Simulated response #${nextIndex}: I read your prompt.`;

    const userFiles = (req.files?.user_attachments || []).map((f) => new Blob([f.buffer], { type: f.mimetype }));

    const turn = await req.pb.collection('turns').create({
      conversation: conversationId,
      index: nextIndex,
      user_text: prompt,
      assistant_text: assistantText,
      user_attachments: userFiles,
    });

    res.status(201).json({
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
        created: turn.created,
        updated: turn.updated,
      },
    });
  } catch (err) {
    next(err);
  }
}
export async function simulateChat(req, res, next) {
  try {
    const { conversationId, prompt } = req.body || {};
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'prompt required' });
    }

    if (!conversationId) {
      return startChat(req, res, next);
    }
    return appendChat(req, res, next);
  } catch (err) {
    next(err);
  }
}

function suggestTitleFromPrompt(prompt, opts = {}) {
  const words = prompt.trim().split(/\s+/).slice(0, 6);
  const base = words.join(' ');
  const raw = base.length ? base : 'New Conversation';
  const suffix = typeof opts.index === 'number' ? opts.index : Math.floor(100 + Math.random() * 900);
  const title = `${raw} #${suffix}`;
  return title.length > 60 ? title.slice(0, 57) + '…' : title;
}