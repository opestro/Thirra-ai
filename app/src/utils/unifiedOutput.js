/**
 * Unified LLM Output Parser
 * Extracts title, summary, and response from structured model output
 */

/**
 * Parse structured LLM output with embedded blocks
 * @param {string} rawOutput - Raw model output containing structured blocks
 * @returns {Object} - { title, summary, response, hasTitle, hasSummary, errors }
 */
export function parseUnifiedOutput(rawOutput) {
  const result = {
    title: null,
    summary: null,
    response: null,
    hasTitle: false,
    hasSummary: false,
    errors: []
  };

  if (!rawOutput || typeof rawOutput !== 'string') {
    result.errors.push('Invalid input: expected non-empty string');
    return result;
  }

  try {
    // Extract title block
    const titleMatch = rawOutput.match(/\{\{\{\{title\}\}\}\}([\s\S]*?)\{\{\{\{\/title\}\}\}\}/i);
    if (titleMatch) {
      result.title = titleMatch[1].trim();
      result.hasTitle = true;
      if (!result.title) {
        result.errors.push('Title block found but empty');
      }
    }

    // Extract summary block
    const summaryMatch = rawOutput.match(/\{\{\{\{summary\}\}\}\}([\s\S]*?)\{\{\{\{\/summary\}\}\}\}/i);
    if (summaryMatch) {
      result.summary = summaryMatch[1].trim();
      result.hasSummary = true;
      if (!result.summary) {
        result.errors.push('Summary block found but empty');
      }
    }

    // Extract response block
    const responseMatch = rawOutput.match(/\{\{\{\{response\}\}\}\}([\s\S]*?)\{\{\{\{\/response\}\}\}\}/i);
    if (responseMatch) {
      result.response = responseMatch[1].trim();
      if (!result.response) {
        result.errors.push('Response block found but empty');
      }
    } else {
      // Fallback: if no response block, treat everything outside title/summary as response
      let fallbackResponse = rawOutput;
      
      // Remove title block if present
      if (titleMatch) {
        fallbackResponse = fallbackResponse.replace(/\{\{\{\{title\}\}\}\}[\s\S]*?\{\{\{\{\/title\}\}\}\}/i, '');
      }
      
      // Remove summary block if present
      if (summaryMatch) {
        fallbackResponse = fallbackResponse.replace(/\{\{\{\{summary\}\}\}\}[\s\S]*?\{\{\{\{\/summary\}\}\}\}/i, '');
      }
      
      result.response = fallbackResponse.trim();
      if (!result.response) {
        result.errors.push('No response content found');
      }
    }

    // Validate title length (reasonable bounds)
    if (result.title && result.title.length > 120) {
      result.title = result.title.slice(0, 120).trim();
      result.errors.push('Title truncated to 120 characters');
    }

    // Validate summary length
    if (result.summary && result.summary.length > 500) {
      result.summary = result.summary.slice(0, 500).trim();
      result.errors.push('Summary truncated to 500 characters');
    }

  } catch (error) {
    result.errors.push(`Parsing error: ${error.message}`);
  }

  return result;
}

/**
 * Build system prompt for unified output generation
 * @param {Object} options - { needsTitle, userInstruction, contextText }
 * @returns {string} - System prompt for unified output
 */
export function buildUnifiedSystemPrompt({ needsTitle = false, userInstruction = null, contextText = null, factsText = null }) {
  let prompt = "You are an assistant that provides structured responses. ";
  
  if (contextText) {
    prompt += "Use the following context only if relevant:\nCONTEXT:\n" + contextText + "\n\n";
  }
  
  if (factsText) {
    prompt += "Always respect these known facts across this conversation:\nFACTS:\n" + factsText + "\n\n";
  }
  
  prompt += "You MUST format your response using these exact blocks:\n\n";
  
  if (needsTitle) {
    prompt += "{{{{title}}}}\n[Generate a concise 4-6 word conversation title]\n{{{{/title}}}}\n\n";
  }
  
  prompt += "{{{{summary}}}}\n[Create a brief 1-2 sentence summary of your response]\n{{{{/summary}}}}\n\n";
  prompt += "{{{{response}}}}\n[Your main response here - be helpful and concise]\n{{{{/response}}}}\n\n";
  
  prompt += "IMPORTANT RULES:\n";
  prompt += "- Use the EXACT block syntax shown above\n";
  prompt += "- Do not include the square bracket instructions in your output\n";
  prompt += "- Keep title under 6 words if generating one\n";
  prompt += "- Keep summary under 2 sentences\n";
  prompt += "- Be concise and avoid repeating context text\n";
  
  if (userInstruction) {
    prompt += `\nUser instruction: ${String(userInstruction).trim()}`;
  }
  
  return prompt;
}

/**
 * Validate parsed output for completeness
 * @param {Object} parsed - Result from parseUnifiedOutput
 * @param {boolean} expectTitle - Whether title was expected
 * @returns {Object} - { isValid, missingFields, criticalErrors }
 */
export function validateParsedOutput(parsed, expectTitle = false) {
  const validation = {
    isValid: true,
    missingFields: [],
    criticalErrors: []
  };

  // Check for critical parsing errors
  if (parsed.errors.length > 0) {
    validation.criticalErrors = parsed.errors.filter(err => 
      err.includes('Parsing error') || err.includes('No response content found')
    );
  }

  // Check required fields
  if (expectTitle && !parsed.hasTitle) {
    validation.missingFields.push('title');
    validation.isValid = false;
  }

  if (!parsed.hasSummary) {
    validation.missingFields.push('summary');
    validation.isValid = false;
  }

  if (!parsed.response) {
    validation.missingFields.push('response');
    validation.isValid = false;
  }

  if (validation.criticalErrors.length > 0) {
    validation.isValid = false;
  }

  return validation;
}

/**
 * Fallback parser for malformed output
 * Attempts to extract content even if blocks are missing or malformed
 * @param {string} rawOutput - Raw model output
 * @param {boolean} expectTitle - Whether to attempt title extraction
 * @returns {Object} - Best-effort parsed content
 */
export function fallbackParse(rawOutput, expectTitle = false) {
  const result = {
    title: null,
    summary: null,
    response: rawOutput.trim(),
    hasTitle: false,
    hasSummary: false,
    errors: ['Used fallback parsing']
  };

  if (!rawOutput || typeof rawOutput !== 'string') {
    return result;
  }

  // Try to extract title from first line if expected
  if (expectTitle) {
    const lines = rawOutput.split('\n');
    const firstLine = lines[0]?.trim();
    if (firstLine && firstLine.length <= 50 && !firstLine.includes('.') && !firstLine.includes('?')) {
      result.title = firstLine;
      result.hasTitle = true;
      result.response = lines.slice(1).join('\n').trim();
    }
  }

  // Try to extract summary from last paragraph or sentence
  const sentences = result.response.split(/[.!?]+/).filter(s => s.trim().length > 10);
  if (sentences.length > 1) {
    const lastSentence = sentences[sentences.length - 1]?.trim();
    if (lastSentence && lastSentence.length < 200) {
      result.summary = lastSentence + '.';
      result.hasSummary = true;
    }
  }

  return result;
}