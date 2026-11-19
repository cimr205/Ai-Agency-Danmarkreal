// JSON extraction for free-model output (ported from ~/seo-autopilot/src/json.ts):
// strips fences and prose, and repairs output cut off at max_tokens.
/** Pulls a JSON value out of an LLM response: strips ```-fences and any prose around it. */
export function extractJson(text: string): unknown {
  const candidates = collectCandidates(text);
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try the next candidate
    }
  }
  for (const candidate of candidates) {
    const repaired = repairTruncatedJson(candidate);
    if (repaired !== null) {
      try {
        return JSON.parse(repaired);
      } catch {
        // give up on this candidate
      }
    }
  }
  throw new Error('no valid JSON in the model response');
}

function collectCandidates(text: string): string[] {
  const out: string[] = [];

  const fence = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;
  while ((match = fence.exec(text))) out.push(match[1].trim());

  const trimmed = text.trim();
  out.push(trimmed);

  const firstBrace = trimmed.indexOf('{');
  const firstBracket = trimmed.indexOf('[');
  const starts = [firstBrace, firstBracket].filter((i) => i >= 0).sort((a, b) => a - b);
  for (const start of starts) {
    const tail = trimmed.slice(start);
    out.push(tail);
    const balanced = extractBalancedSpan(trimmed, start);
    if (balanced) out.push(balanced);
  }

  return out.filter(Boolean);
}

/** Returns the substring from `start` to its matching closing bracket, ignoring any trailing prose. */
function extractBalancedSpan(text: string, start: number): string | null {
  const open = text[start];
  const close = open === '{' ? '}' : open === '[' ? ']' : null;
  if (!close) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null; // never balanced: truncated, let repairTruncatedJson handle it
}

/**
 * Rescues a response that was cut off at max_tokens. Trims trailing
 * incomplete tokens (an open string, a dangling key, a trailing comma) and
 * closes any still-open arrays/objects. Returns null if `input` is already
 * valid JSON or doesn't look like JSON at all.
 */
export function repairTruncatedJson(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  const first = text[0];
  if (first !== '{' && first !== '[') return null;

  try {
    JSON.parse(text);
    return null; // already valid, nothing to repair
  } catch {
    // fall through to repair
  }

  for (let end = text.length; end > 0; end--) {
    const candidate = closeOpenStructures(text.slice(0, end));
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      // trim one more character and retry
    }
  }
  return null;
}

function closeOpenStructures(slice: string): string {
  let inString = false;
  let escaped = false;
  const stack: string[] = [];
  for (const ch of slice) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}' || ch === ']') stack.pop();
  }

  let out = slice;
  if (inString) {
    out += '"';
  } else {
    out = out.replace(/,\s*$/, '').replace(/:\s*$/, '');
  }
  for (let j = stack.length - 1; j >= 0; j--) out += stack[j] === '{' ? '}' : ']';
  return out;
}
