import { test } from "node:test";
import assert from "node:assert/strict";

import { toConversationDto, toMessageDto } from "../src/lib/dto";

// The raw argument mirrors a Prisma `Message` row with nested attachments; casting keeps the
// fixtures decoupled from the full generated payload type while still exercising the mapping.
type MessageArg = Parameters<typeof toMessageDto>[0];

function rawMessage(overrides: Partial<Record<string, unknown>> = {}): MessageArg {
  return {
    id: "msg-1",
    role: "USER",
    content: "Hello",
    status: "COMPLETED",
    model: "gpt-4o-mini",
    error: null,
    suggestedFollowUps: ["a", "b"],
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    promptTokens: 10,
    completionTokens: 20,
    latencyMs: 300,
    attachments: [
      {
        id: "att-1",
        fileName: "notes.txt",
        mimeType: "text/plain",
        sizeBytes: 128,
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
      },
    ],
    ...overrides,
  } as unknown as MessageArg;
}

test("toMessageDto maps enum roles to lower-case and normalises timestamps", () => {
  const dto = toMessageDto(rawMessage());
  assert.equal(dto.id, "msg-1");
  assert.equal(dto.role, "user");
  assert.equal(dto.content, "Hello");
  assert.equal(dto.status, "COMPLETED");
  assert.equal(dto.model, "gpt-4o-mini");
  assert.equal(dto.error, null);
  assert.deepEqual(dto.suggestedFollowUps, ["a", "b"]);
  assert.equal(dto.createdAt, "2024-01-01T00:00:00.000Z");
  assert.deepEqual(dto.usage, { promptTokens: 10, completionTokens: 20, latencyMs: 300 });
});

test("toMessageDto projects attachments without leaking internal fields", () => {
  const dto = toMessageDto(rawMessage());
  assert.equal(dto.attachments.length, 1);
  assert.deepEqual(dto.attachments[0], {
    id: "att-1",
    fileName: "notes.txt",
    mimeType: "text/plain",
    sizeBytes: 128,
  });
  assert.equal("createdAt" in dto.attachments[0], false);
});

test("toMessageDto maps ASSISTANT and SYSTEM roles", () => {
  assert.equal(toMessageDto(rawMessage({ role: "ASSISTANT" })).role, "assistant");
  assert.equal(toMessageDto(rawMessage({ role: "SYSTEM" })).role, "system");
});

test("toConversationDto reads the counted message total", () => {
  const dto = toConversationDto({
    id: "c-1",
    title: "Kickoff",
    model: "gpt-4o-mini",
    createdAt: new Date("2024-01-02T00:00:00.000Z"),
    updatedAt: new Date("2024-01-03T00:00:00.000Z"),
    _count: { messages: 5 },
  });
  assert.deepEqual(dto, {
    id: "c-1",
    title: "Kickoff",
    model: "gpt-4o-mini",
    createdAt: "2024-01-02T00:00:00.000Z",
    updatedAt: "2024-01-03T00:00:00.000Z",
    messageCount: 5,
  });
});

test("toConversationDto defaults the count to zero when omitted", () => {
  const dto = toConversationDto({
    id: "c-2",
    title: "Empty",
    model: null,
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-01T00:00:00.000Z"),
  });
  assert.equal(dto.messageCount, 0);
  assert.equal(dto.model, null);
});
