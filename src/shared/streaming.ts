// 共享：流式翻译相关的最小工具与类型

export interface TranslatorInstance {
  ready?: Promise<void>;
  translate: (text: string) => Promise<string>;
  // 可选的流式翻译 API（不同实现形态不一致）
  translateStreaming?: (text: string) => unknown;
}

export const STREAMING_LENGTH_THRESHOLD = 500; // 文本较长时启用流式

export function isReadableStreamLike(x: unknown): x is ReadableStream<unknown> {
  return typeof x === 'object' && x !== null && typeof (x as any).getReader === 'function';
}

export function toStringChunk(chunk: unknown, decoder: TextDecoder): string {
  if (typeof chunk === 'string') return chunk;
  if (chunk instanceof Uint8Array) return decoder.decode(chunk, { stream: true });
  if (chunk && typeof (chunk as any).text === 'string') return (chunk as any).text;
  try {
    return String(chunk ?? '');
  } catch {
    return '';
  }
}

export async function* normalizeToAsyncStringIterable(
  source: unknown,
  registerReader?: (reader: ReadableStreamDefaultReader<unknown>) => void,
): AsyncGenerator<string, void, unknown> {
  const resolved = await Promise.resolve(source as any);

  if (resolved && typeof resolved[Symbol.asyncIterator] === 'function') {
    const decoder = new TextDecoder();
    for await (const chunk of resolved as AsyncIterable<unknown>) {
      const text = toStringChunk(chunk, decoder);
      if (text) yield text;
    }
    const tail = new TextDecoder().decode();
    if (tail) yield tail;
    return;
  }

  const maybeReadable = isReadableStreamLike(resolved)
    ? (resolved as ReadableStream<unknown>)
    : (resolved && typeof resolved === 'object' && isReadableStreamLike((resolved as any).readable))
      ? ((resolved as any).readable as ReadableStream<unknown>)
      : null;

  if (maybeReadable) {
    const reader = maybeReadable.getReader();
    registerReader?.(reader as ReadableStreamDefaultReader<unknown>);
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = toStringChunk(value, decoder);
        if (text) yield text;
      }
      const tail = decoder.decode();
      if (tail) yield tail;
    } finally {
      try { await reader.cancel(); } catch { /* noop */ }
    }
    return;
  }

  if (Array.isArray(resolved)) {
    const decoder = new TextDecoder();
    for (const item of resolved) {
      const text = toStringChunk(item, decoder);
      if (text) yield text;
    }
    const tail = new TextDecoder().decode();
    if (tail) yield tail;
    return;
  }

  if (typeof resolved === 'string') {
    yield resolved;
    return;
  }
}


