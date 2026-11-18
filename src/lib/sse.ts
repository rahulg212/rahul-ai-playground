/**
 * Minimal Server-Sent Events (SSE) reader for streaming HTTP responses.
 *
 * SSE format basics (what all four providers send when streaming):
 *   event: content_block_delta        <- optional event name (Anthropic)
 *   data: {"type": ...}               <- the JSON payload, may span several lines
 *   <blank line>                      <- dispatches the event
 *   : ping / : OPENROUTER PROCESSING  <- comment lines, must be ignored
 *   data: [DONE]                      <- OpenAI-style end marker
 *
 * This generator yields each `data:` payload as a single string. Multi-line
 * data fields are joined with "\n" per the SSE spec. Comment lines, `event:`,
 * `id:` and `retry:` fields are ignored — every provider encodes all needed
 * information (e.g. Anthropic's event type) inside the JSON payload itself.
 */
export async function* iterateSSE(response: Response): AsyncGenerator<string> {
  if (!response.body) {
    throw new Error('Response body is empty — streaming is not supported here.');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let dataLines: string[] = [];

  const flush = (): string | null => {
    if (dataLines.length === 0) return null;
    const payload = dataLines.join('\n');
    dataLines = [];
    return payload;
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      // stream: true handles multi-byte characters split across chunks.
      buffer += decoder.decode(value, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIndex).replace(/\r$/, '');
        buffer = buffer.slice(newlineIndex + 1);

        if (line === '') {
          // Blank line = end of event; yield the accumulated data payload.
          const payload = flush();
          if (payload !== null) yield payload;
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trimStart());
        }
        // Everything else (comments, event:, id:, retry:) is ignored.
      }
    }
    // Flush a trailing event if the stream ended without a final blank line.
    const last = flush();
    if (last !== null) yield last;
  } finally {
    reader.releaseLock();
  }
}
