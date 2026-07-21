import { base44 } from '@/api/base44Client';

// Tolerantly extract a JSON object from an LLM text response:
// strips markdown fences and, if needed, extracts the first balanced {...}.
export function extractJson(text) {
  if (text == null) return null;
  let t = String(text).trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  try { return JSON.parse(t); } catch {}
  const start = t.indexOf('{');
  if (start === -1) return null;
  let depth = 0, end = -1, inStr = false, esc = false;
  for (let i = start; i < t.length; i++) {
    const ch = t[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
    } else {
      if (ch === '"') inStr = true;
      else if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
  }
  if (end === -1) return null;
  try { return JSON.parse(t.slice(start, end + 1)); } catch {}
  return null;
}

// Calls InvokeLLM and returns a parsed JSON object (or null).
// useWeb = true -> gemini_3_flash with internet context; false -> automatic model.
export async function callJson(prompt, { useWeb = true } = {}) {
  const cfg = useWeb
    ? { model: 'gemini_3_flash', add_context_from_internet: true }
    : { model: 'automatic' };
  const raw = await base44.integrations.Core.InvokeLLM({ prompt, ...cfg });
  return extractJson(typeof raw === 'string' ? raw : JSON.stringify(raw));
}