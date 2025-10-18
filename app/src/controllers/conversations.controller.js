export async function listConversations(req, res, next) {
  try {
    const page = parseInt(req.query.page || '1', 10);
    const perPage = parseInt(req.query.perPage || '20', 10);
    const result = await req.pb.collection('conversations').getList(page, perPage, {
      sort: '-updated',
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function listConversationTitles(req, res, next) {
  try {
    const limit = parseInt(req.query.limit || '200', 10);
    const items = await req.pb.collection('conversations').getFullList(limit, {
      sort: '-updated',
    });
    const titles = items.map((r) => ({ id: r.id, title: r.title, updated: r.updated }));
    res.json({ items: titles });
  } catch (err) {
    next(err);
  }
}

export async function createConversation(req, res, next) {
  try {
    const { title } = req.body || {};
    if (!title) {
      return res.status(400).json({ error: 'title required' });
    }
    const record = await req.pb.collection('conversations').create({
      title,
      owner: req.user.id,
    });
    res.status(201).json(record);
  } catch (err) {
    next(err);
  }
}

export async function getConversation(req, res, next) {
  try {
    const { id } = req.params;
    const record = await req.pb.collection('conversations').getOne(id);
    res.json(record);
  } catch (err) {
    next(err);
  }
}

export async function getConversationFull(req, res, next) {
  try {
    const { id } = req.params;
    const conversation = await req.pb.collection('conversations').getOne(id);

    const turns = await req.pb.collection('turns').getFullList(500, {
      filter: `conversation = "${id}"`,
      sort: 'index',
    });

    const normalizedTurns = turns.map((t) => ({
      id: t.id,
      index: t.index,
      user_text: t.user_text,
      assistant_text: t.assistant_text,
      user_attachments: t.user_attachments || [],
      assistant_attachments: t.assistant_attachments || [],
      created: t.created,
      updated: t.updated,
    }));

    res.json({
      conversation: {
        id: conversation.id,
        title: conversation.title,
        created: conversation.created,
        updated: conversation.updated,
      },
      turns: normalizedTurns,
    });
  } catch (err) {
    next(err);
  }
}

export async function updateConversation(req, res, next) {
  try {
    const { id } = req.params;
    const { title } = req.body || {};
    if (!title) {
      return res.status(400).json({ error: 'title required' });
    }
    const record = await req.pb.collection('conversations').update(id, { title });
    res.json(record);
  } catch (err) {
    next(err);
  }
}

export async function deleteConversation(req, res, next) {
  try {
    const { id } = req.params;
    await req.pb.collection('conversations').delete(id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}