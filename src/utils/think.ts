/** A reply split into a leading `<think>` block and the answer. The server sends the
 * model's raw text (docs/01 §5); the UI shows reasoning collapsed, never drops it. */
export interface SplitReply {
  reasoning: string | null;
  /** The think block has not closed yet (still streaming). */
  thinking: boolean;
  answer: string;
}

export function splitThink(text: string): SplitReply {
  const start = text.match(/^\s*<think>/);
  if (!start) return { reasoning: null, thinking: false, answer: text };
  const rest = text.slice(start[0].length);
  const end = rest.indexOf('</think>');
  if (end < 0) return { reasoning: rest.trim(), thinking: true, answer: '' };
  return {
    reasoning: rest.slice(0, end).trim(),
    thinking: false,
    answer: rest.slice(end + '</think>'.length).replace(/^\s+/, ''),
  };
}
