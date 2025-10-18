export async function listTurns(req, res, next) {
  try {
    const { conversationId } = req.params;
    const page = parseInt(req.query.page || '1', 10);
    const perPage = parseInt(req.query.perPage || '50', 10);
    const result = await req.pb.collection('turns').getList(page, perPage, {
      filter: `conversation="${conversationId}"`,
      sort: 'index',
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getTurn(req, res, next) {
  try {
    const { id } = req.params;
    const record = await req.pb.collection('turns').getOne(id);
    res.json(record);
  } catch (err) {
    next(err);
  }
}

export async function createTurn(req, res, next) {
  try {
    const { conversationId } = req.params;
    const { user_text, assistant_text } = req.body || {};

    const latest = await req.pb.collection('turns').getList(1, 1, {
      filter: `conversation="${conversationId}"`,
      sort: '-index',
    });
    const nextIndex = latest.items.length ? latest.items[0].index + 1 : 1;

    const userFiles = (req.files?.user_attachments || []).map(f => new Blob([f.buffer], { type: f.mimetype }));
    const assistantFiles = (req.files?.assistant_attachments || []).map(f => new Blob([f.buffer], { type: f.mimetype }));

    const record = await req.pb.collection('turns').create({
      conversation: conversationId,
      index: nextIndex,
      user_text: user_text || null,
      assistant_text: assistant_text || null,
      user_attachments: userFiles,
      assistant_attachments: assistantFiles,
    });

    res.status(201).json(record);
  } catch (err) {
    next(err);
  }
}

export async function updateTurn(req, res, next) {
  try {
    const { id } = req.params;
    const { user_text, assistant_text } = req.body || {};

    const payload = {
      ...(typeof user_text !== 'undefined' ? { user_text } : {}),
      ...(typeof assistant_text !== 'undefined' ? { assistant_text } : {}),
    };

    // If new attachments provided, replace existing
    const userFiles = (req.files?.user_attachments || []).map(f => new Blob([f.buffer], { type: f.mimetype }));
    const assistantFiles = (req.files?.assistant_attachments || []).map(f => new Blob([f.buffer], { type: f.mimetype }));

    if (userFiles.length) payload.user_attachments = userFiles;
    if (assistantFiles.length) payload.assistant_attachments = assistantFiles;

    const updated = await req.pb.collection('turns').update(id, payload);
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

export async function deleteTurn(req, res, next) {
  try {
    const { id } = req.params;
    await req.pb.collection('turns').delete(id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}