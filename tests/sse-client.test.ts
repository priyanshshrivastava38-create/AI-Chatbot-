import { test } from "node:test";
import assert from "node:assert/strict";

import { readSseStream } from "../src/lib/sse-client";

function streamFrom(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect(chunks: string[]) {
  const frames: { event: string; data: string }[] = [];
  for await (const frame of readSseStream(streamFrom(chunks))) {
    frames.push(frame);
  }
  return frames;
}

test("parses a single event/data frame", async () => {
  const frames = await collect(["event: delta\ndata: hello\n\n"]);
  assert.deepEqual(frames, [{ event: "delta", data: "hello" }]);
});

test("defaults the event name to `message` when no event field is present", async () => {
  const frames = await collect(["data: only-data\n\n"]);
  assert.deepEqual(frames, [{ event: "message", data: "only-data" }]);
});

test("joins multiple data lines with newlines", async () => {
  const frames = await collect(["event: x\ndata: a\ndata: b\n\n"]);
  assert.deepEqual(frames, [{ event: "x", data: "a\nb" }]);
});

test("reassembles a frame that is split across chunks", async () => {
  const frames = await collect(["event: delta\ndata: hel", "lo\n\n"]);
  assert.deepEqual(frames, [{ event: "delta", data: "hello" }]);
});

test("emits every frame contained in a single chunk", async () => {
  const frames = await collect(["data: a\n\ndata: b\n\n"]);
  assert.deepEqual(frames, [
    { event: "message", data: "a" },
    { event: "message", data: "b" },
  ]);
});

test("skips frames that carry no data field", async () => {
  const frames = await collect(["event: ping\n\ndata: kept\n\n"]);
  assert.deepEqual(frames, [{ event: "message", data: "kept" }]);
});

test("trims leading whitespace after the data colon but preserves inner spaces", async () => {
  const frames = await collect(["data:    spaced out\n\n"]);
  assert.equal(frames[0].data, "spaced out");
});
