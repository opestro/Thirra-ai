import config from '../config/config.js';

export async function generateTitleFromPrompt(prompt) {
  const { apiKey, model, baseUrl } = config.openrouter;

  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
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