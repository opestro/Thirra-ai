import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";

export function applyPromptBudgetGuard({ baseHistory, inputMessages, prompt, PROMPT_CHAR_BUDGET = 4500, MAX_HISTORY_CHARS = 1600, COMPRESSED_RECENT_CHARS = 240, SUMMARY_CAP_CHARS = 600 }) {
  let historyMsgs = baseHistory;

  function normalize(s) {
    return String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
  }

  const lastUserMsg = [...baseHistory].reverse().find(m => m instanceof HumanMessage);
  const isRepeatQuestion = lastUserMsg ? normalize(lastUserMsg.content) === normalize(prompt) : false;
  const summaryIndex = baseHistory.findIndex(m => m instanceof SystemMessage && String(m.content || "").startsWith("Earlier conversation summary (compact):"));
  if (summaryIndex >= 0 && isRepeatQuestion) {
    historyMsgs = [...baseHistory.slice(0, summaryIndex), ...baseHistory.slice(summaryIndex + 1)];
    console.log("[Prompt Budget] Skipped summary due to repeated question heuristic");
  }

  // Proactive compression if history alone exceeds cap
  const historyCharsNow = historyMsgs.reduce((acc, m) => acc + String(m.content || "").length, 0);
  if (historyCharsNow > MAX_HISTORY_CHARS) {
    const n = historyMsgs.length;
    if (n > 2) {
      const keepTail = historyMsgs.slice(Math.max(0, n - 2));
      const priorTwo = historyMsgs.slice(Math.max(0, n - 4), Math.max(0, n - 2));
      const compressedPrior = priorTwo.map(m => {
        const role = m instanceof HumanMessage ? "user" : (m instanceof AIMessage ? "assistant" : "system");
        const text = String(m.content || "").replace(/\s+/g, " ").trim().slice(0, COMPRESSED_RECENT_CHARS);
        return new SystemMessage(`Compressed recent (${role}): ${text}`);
      });
      const prefix = historyMsgs.slice(0, Math.max(0, n - 4));
      historyMsgs = [...prefix, ...compressedPrior, ...keepTail];
      console.log("[Prompt Budget] Compressed prior recent messages due to history cap");
    }
  }

  // Tighten summary when total exceeds budget
  const inputChars = inputMessages.reduce((acc, m) => acc + String(m.content || "").length, 0);
  let totalChars = historyMsgs.reduce((acc, m) => acc + String(m.content || "").length, 0) + inputChars;
  if (totalChars > PROMPT_CHAR_BUDGET) {
    const sIdx = historyMsgs.findIndex(m => m instanceof SystemMessage && String(m.content || "").startsWith("Earlier conversation summary (compact):"));
    if (sIdx >= 0) {
      const sContent = String(historyMsgs[sIdx].content || "");
      const trimmed = sContent.slice(0, Math.min(SUMMARY_CAP_CHARS, sContent.length));
      historyMsgs[sIdx] = new SystemMessage(trimmed);
      totalChars = historyMsgs.reduce((acc, m) => acc + String(m.content || "").length, 0) + inputChars;
    }
  }

  console.log(`[Prompt Budget] history_chars=${historyMsgs.reduce((a,m)=>a+String(m.content||'').length,0)} input_chars=${inputChars} total_chars=${totalChars}`);
  return { historyMsgs, totalChars };
}