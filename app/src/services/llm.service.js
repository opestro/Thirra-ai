export async function generateAssistantText(prompt, files = []) {
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL;
  const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL;

  const messages = [
    { role: 'system', content: 'You are a helpful assistant. When files are attached, read their content and use it to answer. If content is truncated, state that clearly.' },
  ];

  const hasFiles = Array.isArray(files) && files.length > 0;
  if (hasFiles) {
    const MAX_CHARS = 20000;
    for (const f of files) {
      const name = f.originalname || 'attachment';
      const type = f.mimetype || 'application/octet-stream';
      const isTextLike = (type || '').startsWith('text/') || /(json|xml|yaml|yml|csv|markdown|md|html)/i.test(type || '');
      let contentStr = '';
      if (isTextLike) {
        try {
          contentStr = Buffer.from(f.buffer).toString('utf-8');
        } catch (_) {
          contentStr = '';
        }
      }
      if (contentStr) {
        if (contentStr.length > MAX_CHARS) {
          contentStr = contentStr.slice(0, MAX_CHARS) + '\n[...truncated...]';
        }
        messages.push({
          role: 'user',
          content: `Attached file: ${name}\nType: ${type}\n---\n${contentStr}`,
        });
      } else {
        messages.push({
          role: 'user',
          content: `Attached file: ${name}\nType: ${type}\nContent: [binary or unsupported format; content omitted]`,
        });
      }
    }
  }

  messages.push({ role: 'user', content: prompt });

  const resp = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages,
    }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    const err = new Error(text || resp.statusText || 'OpenRouter request failed');
    err.status = resp.status || 502;
    throw err;
  }
  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content || '';
  return typeof content === 'string' ? content : JSON.stringify(content);
}

export async function generateTitleFromPrompt(prompt) {
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
  const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
  const NODE_ENV = process.env.NODE_ENV || 'development';
  if (!OPENROUTER_API_KEY) {
    if (NODE_ENV !== 'production') {
      const words = String(prompt || '').trim().split(/\s+/).slice(0, 6);
      const title = words.join(' ');
      return title || 'New Conversation';
    }
    const err = new Error('OpenRouter API key missing');
    err.status = 500;
    throw err;
  }

  const resp = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [
        { role: 'system', content: 'Generate a concise conversation title (4–6 words). Respond ONLY with the title, no quotes.' },
        { role: 'user', content: prompt },
      ],
    }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    const err = new Error(text || resp.statusText || 'OpenRouter request failed');
    err.status = resp.status || 502;
    throw err;
  }
  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content || '';
  const title = typeof content === 'string' ? content : JSON.stringify(content);
  return String(title).trim().slice(0, 120) || 'New Conversation';
}