import { test } from "node:test";
import assert from "node:assert/strict";

import { SSE_HEADERS, sseEncode, sseResponse } from "../src/lib/ai/sse";
import { readSseStream } from "../src/lib/sse-client";

test("sseEncode frames an event as `event:` then `data:` then a blank line", () => {
  const encoded = sseEncode({ type: "delta", text: "hi" });
  assert.equal(encoded, 'event: delta\ndata: {"type":"delta","text":"hi"}\n\n');
});

test("sseEncode data payload round-trips back to the original event", () => {
  const event = {
    type: "done" as const,
    status: "COMPLETED" as const,
    usage: { promptTokens: 3, completionTokens: 5, estimated: true, latencyMs: 12 },
  };
  const encoded = sseEncode(event);
  assert.ok(encoded.startsWith("event: done\n"), "event name line present");
  assert.ok(encoded.endsWith("\n\n"), "terminated by a blank line");

  const dataLine = encoded.split("\n").find((line) => line.startsWith("data: "));
  assert.ok(dataLine, "has a data line");
  assert.deepEqual(JSON.parse(dataLine.slice("data: ".length)), event);
});

test("SSE_HEADERS disable buffering for streaming responses", () => {
  const headers = SSE_HEADERS as Record<string, string>;
  assert.equal(headers["Content-Type"], "text/event-stream; charset=utf-8");
  assert.match(headers["Cache-Control"], /no-transform/);
  assert.equal(headers["X-Accel-Buffering"], "no");
});

test("sseResponse streams encoded frames back through readSseStream", async () => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(sseEncode({ type: "delta", text: "a" })));
      controller.enqueue(encoder.encode(sseEncode({ type: "title", title: "T" })));
      controller.close();
    },
  });

  const response = sseResponse(stream);
  assert.equal(response.headers.get("Content-Type"), "text/event-stream; charset=utf-8");
  assert.ok(response.body, "response has a body stream");

  const frames = [];
  for await (const frame of readSseStream(response.body as ReadableStream<Uint8Array>)) {
    frames.push(frame);
  }

  assert.equal(frames.length, 2);
  assert.equal(frames[0].event, "delta");
  assert.deepEqual(JSON.parse(frames[0].data), { type: "delta", text: "a" });
  assert.equal(frames[1].event, "title");
  assert.deepEqual(JSON.parse(frames[1].data), { type: "title", title: "T" });
});
