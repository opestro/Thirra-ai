export async function listConverstations(req, res, next) {
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



export async function Conversationdetails(req, res, next) {
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

export async function deleteConversation(req, res, next) {
  try {
    const { id } = req.params;
    await req.pb.collection('conversations').delete(id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
