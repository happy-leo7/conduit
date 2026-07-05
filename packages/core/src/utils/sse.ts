export interface SseMessage {
  event: string;
  data: string;
}

/**
 * ReadableStream<Uint8Array> → SSE 메시지 async 이터러블.
 * `event:`/`data:` 필드와 멀티라인 data, 주석(`:`) 라인을 처리한다.
 */
export async function* parseSseStream(
  stream: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncIterable<SseMessage> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let event = '';
  let dataLines: string[] = [];

  function flush(): SseMessage | null {
    if (dataLines.length === 0) return null;
    const message = { event, data: dataLines.join('\n') };
    event = '';
    dataLines = [];
    return message;
  }

  try {
    for (;;) {
      if (signal?.aborted) return;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIndex).replace(/\r$/, '');
        buffer = buffer.slice(newlineIndex + 1);
        if (line === '') {
          const message = flush();
          if (message) yield message;
        } else if (line.startsWith(':')) {
          // 주석 — 무시
        } else if (line.startsWith('event:')) {
          event = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trimStart());
        }
      }
    }
    const message = flush();
    if (message) yield message;
  } finally {
    reader.releaseLock();
  }
}
