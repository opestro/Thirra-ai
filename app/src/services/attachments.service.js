const EXT_MIME = {
  txt: 'text/plain',
  text: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',
  json: 'application/json',
  csv: 'text/csv',
  html: 'text/html',
  xml: 'application/xml',
};

function guessMimeFromLang(lang) {
  const key = String(lang || '').toLowerCase();
  return EXT_MIME[key] || 'text/plain';
}
function guessExtFromLang(lang) {
  const key = String(lang || '').toLowerCase();
  return EXT_MIME[key] ? key : 'txt';
}

// Extracts files from fenced code blocks: ```<lang>\n<content>\n```, with optional
// "Filename: <name.ext>" on the line immediately before the block.
export function extractAssistantAttachments(text) {
  const attachments = [];
  if (typeof text !== 'string' || !text.trim()) return attachments;

  const blockRegex = /(?:^|\n)(?:Filename:\s*([^\n]+))?\n?```([\w.+-]*)\n([\s\S]*?)```/g;
  let match;
  let idx = 1;

  while ((match = blockRegex.exec(text)) && attachments.length < 3) {
    const filenameRaw = (match[1] || '').trim();
    const lang = (match[2] || '').trim();
    let contentStr = match[3] || '';

    const ext = guessExtFromLang(lang);
    const mime = guessMimeFromLang(lang);
    const filename = filenameRaw || `assistant-${idx}.${ext}`;

    const MAX_CHARS = 100000;
    if (contentStr.length > MAX_CHARS) {
      contentStr = contentStr.slice(0, MAX_CHARS);
    }

    attachments.push({
      filename,
      mimeType: mime,
      buffer: Buffer.from(contentStr, 'utf-8'),
    });
    idx += 1;
  }
  return attachments;
}