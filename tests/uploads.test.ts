// prepareUpload()/resolveUploadPath()/storeUpload() read getAiConfig() at call time. Seed the
// minimum env (and a small MAX_UPLOAD_BYTES so the size limit is cheap to exercise) up front.
Object.assign(process.env, { NODE_ENV: "test" });
process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/prism_test";
process.env.AUTH_SECRET = "unit-test-secret-that-is-long-enough";
process.env.AI_PROVIDER = "ollama";
process.env.MAX_UPLOAD_BYTES = "4096";

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { AppError } from "../src/lib/errors";
import {
  extensionOf,
  prepareUpload,
  resolveUploadPath,
  sanitizeFileName,
  storeUpload,
  uploadsRoot,
  type PreparedUpload,
} from "../src/lib/uploads";

async function expectAppError(thunk: () => Promise<unknown>, code: string, status: number) {
  await assert.rejects(thunk, (thrown: unknown) => {
    assert.ok(thrown instanceof AppError, "should be an AppError");
    assert.equal((thrown as AppError).code, code);
    assert.equal((thrown as AppError).status, status);
    return true;
  });
}

test("sanitizeFileName strips directories so names never carry path traversal", () => {
  assert.equal(sanitizeFileName("../../etc/passwd"), "passwd");
  assert.equal(sanitizeFileName("weird/../name.txt"), "name.txt");
  assert.ok(!sanitizeFileName("../../etc/passwd").includes("/"));
});

test("sanitizeFileName collapses whitespace, trims and drops disallowed characters", () => {
  assert.equal(sanitizeFileName("  my file.txt "), "my file.txt");
  assert.equal(sanitizeFileName("!!!bad chars###.txt"), "bad chars.txt");
  assert.equal(sanitizeFileName("💩emoji.txt"), "emoji.txt");
});

test("sanitizeFileName falls back to `upload` and caps length at 120", () => {
  assert.equal(sanitizeFileName(""), "upload");
  assert.equal(sanitizeFileName("a".repeat(200)).length, 120);
});

test("extensionOf lower-cases the trailing extension and handles edge cases", () => {
  assert.equal(extensionOf("file.TXT"), "txt");
  assert.equal(extensionOf("noext"), "");
  assert.equal(extensionOf("archive.tar.gz"), "gz");
  assert.equal(extensionOf(".hidden"), "");
});

test("prepareUpload rejects empty, oversized, unsupported and binary uploads", async () => {
  await expectAppError(() => prepareUpload(new File([""], "a.txt")), "empty_file", 400);
  await expectAppError(
    () => prepareUpload(new File(["x".repeat(5000)], "big.txt", { type: "text/plain" })),
    "file_too_large",
    413,
  );
  await expectAppError(
    () => prepareUpload(new File(["data"], "img.png", { type: "image/png" })),
    "unsupported_media_type",
    415,
  );
  await expectAppError(() => prepareUpload(new File(["hi"], "README")), "unsupported_media_type", 415);
  await expectAppError(
    () => prepareUpload(new File([new Uint8Array([0, 1, 2, 3])], "notes.txt")),
    "binary_file",
    415,
  );
});

test("prepareUpload rejects a text extension that declares a non-text MIME type", async () => {
  await expectAppError(
    () => prepareUpload(new File(["hello world"], "doc.txt", { type: "application/pdf" })),
    "unsupported_media_type",
    415,
  );
});

test("prepareUpload accepts a plain text file and derives the MIME type", async () => {
  const upload = await prepareUpload(new File(["# Title\ncontent"], "notes.txt", { type: "text/plain" }));
  assert.equal(upload.fileName, "notes.txt");
  assert.equal(upload.mimeType, "text/plain");
  assert.equal(upload.sizeBytes, 15);
  assert.equal(upload.extractedText, "# Title\ncontent");
  assert.equal(upload.textTruncated, false);
  assert.ok(Buffer.isBuffer(upload.buffer));
});

test("prepareUpload infers text/<ext> when the client sends no MIME type", async () => {
  const upload = await prepareUpload(new File(["hello"], "data.csv", { type: "" }));
  assert.equal(upload.mimeType, "text/csv");
  assert.equal(upload.extractedText, "hello");
});

test("resolveUploadPath stays inside the uploads root and blocks traversal", () => {
  const safe = resolveUploadPath("alice/abc.txt");
  assert.equal(safe, path.join(uploadsRoot(), "alice/abc.txt"));
  assert.ok(safe.startsWith(uploadsRoot() + path.sep));

  assert.throws(() => resolveUploadPath("../../secret.txt"), (thrown: unknown) => {
    assert.ok(thrown instanceof AppError);
    assert.equal((thrown as AppError).code, "invalid_upload_path");
    return true;
  });
});

test("storeUpload refuses to write outside the uploads root", async () => {
  const upload: PreparedUpload = {
    fileName: "notes.txt",
    mimeType: "text/plain",
    sizeBytes: 1,
    buffer: Buffer.from("x"),
    extractedText: "x",
    textTruncated: false,
  };
  await expectAppError(() => storeUpload("../../evil", upload), "invalid_upload_path", 400);
});
