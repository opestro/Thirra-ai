import { SystemMessage } from "@langchain/core/messages";

const vectorStores = new Map(); // conversationId -> { docs: [{ text, embedding }], indexedCount: number, seenTexts: Set<string>, indexedTurnIds?: Set<string> }

import config from "../config/config.js";

export const RAG_TOP_K = config.prompt.ragTopK;
export const CHUNK_SIZE = config.prompt.chunkSize;
export const CHUNK_OVERLAP = config.prompt.chunkOverlap;
export const RETRIEVAL_CHUNK_MAX_CHARS = config.prompt.retrievalChunkMaxChars;

export function chunkText(str, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  const text = String(str || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return [];
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(text.length, start + size);
    chunks.push(text.slice(start, end));
    if (end >= text.length) break;
    start = end - overlap;
    if (start < 0) start = 0;
  }
  return chunks;
}


export function isTextLikeFile(file) {
  const type = String(file?.mimetype || "").toLowerCase();
  const name = String(file?.originalname || "");
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  return type.startsWith('text/')
    || /(json|xml|yaml|yml|csv|markdown|md|html)/i.test(type)
    || /(txt|md|json|csv|html|xml|yaml|yml)$/i.test(ext);
}

function isTextLikeFilename(filename) {
  const name = String(filename || "");
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  return /(txt|md|markdown|json|csv|html|xml|yaml|yml)$/i.test(ext);
}

async function fetchTurnAttachmentText(turnId, filename) {
  try {
    if (!isTextLikeFilename(filename)) return '';
    const base = config.pocketbase.url;
    const url = `${base}/api/files/turns/${turnId}/${encodeURIComponent(filename)}`;
    const res = await fetch(url);
    if (!res.ok) return '';
    const text = await res.text();
    return String(text || '').trim();
  } catch (_) {
    return '';
  }
}

export async function ensureIndexedForConversation({ pb, conversationId, embeddings, files = [] }) {
  let store = vectorStores.get(conversationId);
  if (!store) {
    store = { docs: [], indexedCount: 0, seenTexts: new Set(), indexedTurnIds: new Set() };
    vectorStores.set(conversationId, store);
  }

  // Load turns
  const turns = await pb.collection("turns").getFullList(500, {
    filter: `conversation = "${conversationId}"`,
    sort: "created",
  });
  const allTexts = [];
  for (const t of turns) {
    if (t.user_text) allTexts.push(String(t.user_text));
    if (t.assistant_text) allTexts.push(String(t.assistant_text));
  }

  // Index only new texts beyond indexedCount
  const newTexts = allTexts.slice(store.indexedCount);
  const textsToIndex = [];
  for (const txt of newTexts) {
    for (const ch of chunkText(txt)) {
      if (!store.seenTexts.has(ch)) {
        textsToIndex.push(ch);
        store.seenTexts.add(ch);
      }
    }
  }

  // Index persisted attachments from previous turns (text-like by filename)
  for (const t of turns) {
    const already = store.indexedTurnIds?.has(t.id);
    const userFiles = Array.isArray(t.user_attachments) ? t.user_attachments : [];
    const assistantFiles = Array.isArray(t.assistant_attachments) ? t.assistant_attachments : [];
    if (!already && (userFiles.length || assistantFiles.length)) {
      const filenames = [...userFiles, ...assistantFiles].slice(0, 10);
      for (const fn of filenames) {
        const fname = typeof fn === 'string' ? fn : String(fn);
        if (!isTextLikeFilename(fname)) continue;
        const contentStr = await fetchTurnAttachmentText(t.id, fname);
        if (contentStr) {
          for (const ch of chunkText(contentStr)) {
            if (!store.seenTexts.has(ch)) {
              textsToIndex.push(ch);
              store.seenTexts.add(ch);
            }
          }
        }
      }
      store.indexedTurnIds?.add(t.id);
    }
  }

  // Ephemeral indexing of current request files (text-like only)
  if (Array.isArray(files) && files.length > 0) {
    for (const f of files) {
      const type = f.mimetype || "application/octet-stream";
      if (isTextLikeFile(f)) {
        let contentStr = "";
        try { contentStr = Buffer.from(f.buffer).toString("utf-8"); } catch (_) {}
        if (contentStr) {
          for (const ch of chunkText(contentStr)) {
            if (!store.seenTexts.has(ch)) {
              textsToIndex.push(ch);
              store.seenTexts.add(ch);
            }
          }
        }
      }
    }
  }

  if (textsToIndex.length > 0) {
    const cleanTexts = textsToIndex
      .map((t) => String(t ?? "").replace(/\s+/g, " ").trim())
      .filter(Boolean);
    if (cleanTexts.length > 0) {
      try {
        const vectors = await embeddings.embedDocuments(cleanTexts);
        for (let i = 0; i < cleanTexts.length; i++) {
          if (vectors[i]) {
            store.docs.push({ text: cleanTexts[i], embedding: vectors[i] });
          }
        }
      } catch (err) {
        
      }
    }
  }

  store.indexedCount = allTexts.length; // mark turns indexed
}

export async function retrieveRelevantContexts({ conversationId, query, embeddings, topK = RAG_TOP_K, maxCharsPerChunk = RETRIEVAL_CHUNK_MAX_CHARS }) {
  const store = vectorStores.get(conversationId);
  if (!store || store.docs.length === 0) return [];

  const q = String(query || "").replace(/\s+/g, " ").trim();
  if (!q) return [];

  let qVec;
  try {
    qVec = await embeddings.embedQuery(q);
  } catch (err) {
    
    return [];
  }

  const sims = store.docs.map((d, idx) => ({ idx, sim: cosineSim(qVec, d.embedding) }));
  sims.sort((a, b) => b.sim - a.sim);
  const top = sims.slice(0, Math.max(1, topK));
  const chunks = [];
  for (const { idx } of top) {
    const t = String(store.docs[idx].text || "").slice(0, maxCharsPerChunk);
    if (t) chunks.push(t);
  }
  return chunks;
}

export function cosineSim(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
  let dot = 0, aNorm = 0, bNorm = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    aNorm += a[i] * a[i];
    bNorm += b[i] * b[i];
  }
  const denom = Math.sqrt(aNorm) * Math.sqrt(bNorm);
  return denom ? (dot / denom) : 0;
}