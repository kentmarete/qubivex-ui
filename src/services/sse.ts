// A server-sent events reader over a fetch body (EventSource cannot send a POST body or an
// Authorization header). Follows the SSE parsing rules: CRLF or LF lines, multi-line data,
// comments, named events and ids. The chat stream only uses `data:` lines.

export interface SseMessage {
  event: string;
  data: string;
  id?: string;
}

export async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseMessage> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let data: string[] = [];
  let event = '';
  let id: string | undefined;

  const dispatch = (): SseMessage | null => {
    const out = data.length ? { event: event || 'message', data: data.join('\n'), ...(id !== undefined ? { id } : {}) } : null;
    data = [];
    event = '';
    return out;
  };

  const line = (l: string): SseMessage | null => {
    if (l === '') return dispatch();
    if (l.startsWith(':')) return null;
    const colon = l.indexOf(':');
    const field = colon < 0 ? l : l.slice(0, colon);
    let value = colon < 0 ? '' : l.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'data') data.push(value);
    else if (field === 'event') event = value;
    else if (field === 'id') id = value;
    return null;
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      buf += done ? decoder.decode() : decoder.decode(value, { stream: true });
      for (;;) {
        const nl = buf.search(/\r\n|\r|\n/);
        // A lone \r at the end may be the first half of \r\n: wait for more.
        if (nl < 0 || (nl === buf.length - 1 && buf[nl] === '\r' && !done)) break;
        const width = buf.startsWith('\r\n', nl) ? 2 : 1;
        const msg = line(buf.slice(0, nl));
        buf = buf.slice(nl + width);
        if (msg) yield msg;
      }
      if (done) break;
    }
    if (buf) {
      const msg = line(buf);
      if (msg) yield msg;
    }
    const last = dispatch();
    if (last) yield last;
  } finally {
    reader.releaseLock();
  }
}
