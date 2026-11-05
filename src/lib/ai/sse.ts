import type { ChatStreamEvent } from "./types";

export function sseEncode(event: ChatStreamEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export const SSE_HEADERS: HeadersInit = {
  "Content-Type": "text/event-stream; charset=utf-8",
  // `no-transform` stops intermediaries from buffering; `X-Accel-Buffering` does the same for nginx.
  "Cache-Control": "no-cache, no-store, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

export function sseResponse(events: ReadableStream<Uint8Array>): Response {
  return new Response(events, { headers: SSE_HEADERS });
}
