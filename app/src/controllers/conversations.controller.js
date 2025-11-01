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
      filter: `conversation = \"${id}\"`,
      sort: 'created',
    });

    // Get tool calls for all turns
    const turnIds = turns.map(t => t.id);
    let toolCallsByTurn = {};
    
    if (turnIds.length > 0) {
      const toolCalls = await req.pb.collection('tool_calls').getFullList({
        filter: turnIds.map(turnId => `turn="${turnId}"`).join(' || '),
        sort: 'created',
      });
      
      // Group by turn
      toolCalls.forEach(tc => {
        if (!toolCallsByTurn[tc.turn]) {
          toolCallsByTurn[tc.turn] = [];
        }
        
        // PocketBase JSON fields are already parsed objects
        const parseIfNeeded = (value, fallback = null) => {
          if (!value) return fallback;
          if (typeof value === 'string') {
            try {
              return JSON.parse(value);
            } catch {
              return fallback;
            }
          }
          return value; // Already an object
        };
        
        toolCallsByTurn[tc.turn].push({
          id: tc.id,
          tool_name: tc.tool_name,
          tool_call_id: tc.tool_call_id,
          arguments: parseIfNeeded(tc.arguments, {}),
          result: parseIfNeeded(tc.result, null),
          status: tc.status,
          error: tc.error,
          external_id: tc.external_id,
          created: tc.created,
          updated: tc.updated,
        });
      });
    }

    const normalizedTurns = turns.map((t) => ({
      id: t.id,
      user_text: t.user_text,
      assistant_text: t.assistant_text,
      user_attachments: t.user_attachments || [],
      assistant_attachments: t.assistant_attachments || [],
      has_tool_calls: t.has_tool_calls || false,
      tool_count: t.tool_count || 0,
      created: t.created,
      updated: t.updated,
      tool_calls: toolCallsByTurn[t.id] || [], // Include tool calls
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
