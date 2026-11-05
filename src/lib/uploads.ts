import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getAiConfig } from "./env";
import { AppError } from "./errors";
import { logger } from "./log";

const ALLOWED_EXTENSIONS = new Set([
  "txt", "md", "markdown", "mdx", "csv", "tsv", "json", "jsonl", "ndjson", "yaml", "yml", "toml",
  "ini", "cfg", "conf", "log", "html", "htm", "css", "scss", "xml", "sql", "js", "jsx", "ts",
  "tsx", "mjs", "cjs", "py", "rb", "go", "rs", "java", "kt", "scala", "c", "h", "cpp", "hpp",
  "cs", "php", "swift", "sh", "bash", "zsh", "vue", "svelte", "graphql", "proto",
]);

const MAX_EXTRACTED_CHARS = 200_000;

/** Client-supplied names are display-only; they never contribute to a filesystem path. */
export function sanitizeFileName(name: string): string {
  const base = path
    .basename(name || "upload")
    .replace(/[^A-Za-z0-9._\- ()[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return (base || "upload").slice(0, 120);
}

export function extensionOf(fileName: string): string {
  return path.extname(fileName).replace(/^\./, "").toLowerCase();
}

function looksBinary(buffer: Buffer): boolean {
  if (buffer.length === 0) return true;
  const sample = buffer.subarray(0, 1024);
  for (const byte of sample) {
    if (byte === 0) return true;
  }
  return false;
}

export type PreparedUpload = {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  buffer: Buffer;
  extractedText: string;
  textTruncated: boolean;
};

/**
 * Size, extension, MIME and content checks. Only plain-text formats are accepted; binary
 * documents would need an extractor, and unvalidated extractors are a known attack surface.
 */
export async function prepareUpload(file: File): Promise<PreparedUpload> {
  const config = getAiConfig();
  const fileName = sanitizeFileName(file.name);
  const extension = extensionOf(fileName);

  if (file.size === 0) throw new AppError("The uploaded file is empty", 400, "empty_file");
  if (file.size > config.maxUploadBytes) {
    throw new AppError(
      `Files must be smaller than ${Math.round(config.maxUploadBytes / (1024 * 1024))} MB`,
      413,
      "file_too_large",
    );
  }
  if (!extension || !ALLOWED_EXTENSIONS.has(extension)) {
    throw new AppError(
      `Unsupported file type "${extension || "unknown"}". Upload plain text, Markdown, CSV, JSON or source code.`,
      415,
      "unsupported_media_type",
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (looksBinary(buffer)) {
    throw new AppError("That file looks binary. Only text-based files are supported.", 415, "binary_file");
  }

  const declaredType = (file.type || "").toLowerCase();
  if (declaredType && !declaredType.startsWith("text/") && !["application/json", "application/xml", ""].includes(declaredType)) {
    throw new AppError("Only text-based files are supported.", 415, "unsupported_media_type");
  }

  const decoded = buffer.toString("utf8");
  const truncated = decoded.length > MAX_EXTRACTED_CHARS;
  return {
    fileName,
    mimeType: declaredType || `text/${extension}`,
    sizeBytes: file.size,
    buffer,
    extractedText: truncated ? decoded.slice(0, MAX_EXTRACTED_CHARS) : decoded,
    textTruncated: truncated,
  };
}

export function uploadsRoot(): string {
  // Runtime-only path: without the ignore hint the bundler traces the whole project into the
  // serverless output because the directory comes from configuration.
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), getAiConfig().uploadDir);
}

/** Writes bytes under uploads/<userId>/<uuid>.<ext> and returns the DB-relative key. */
export async function storeUpload(userId: string, upload: PreparedUpload): Promise<string> {
  const extension = extensionOf(upload.fileName);
  const storageKey = `${userId}/${randomUUID()}${extension ? `.${extension}` : ""}`;
  const absolutePath = path.join(uploadsRoot(), storageKey);

  // Defence in depth: the key is built by us, but never allow a write outside uploads/.
  const root = uploadsRoot();
  if (!absolutePath.startsWith(root + path.sep)) {
    throw new AppError("Unsafe upload path", 400, "invalid_upload_path");
  }

  try {
    await mkdir(path.dirname(absolutePath), { recursive: true, mode: 0o700 });
    await writeFile(absolutePath, upload.buffer, { mode: 0o600 });
  } catch (error) {
    // Serverless filesystems are read-only. The model reads extractedText from the Attachment
    // row, so an upload still works where the original bytes cannot be kept.
    logger.warn("upload.disk_write_failed", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
  return storageKey;
}

export function resolveUploadPath(storageKey: string): string {
  const root = uploadsRoot();
  const absolutePath = path.join(root, storageKey);
  if (!absolutePath.startsWith(root + path.sep)) {
    throw new AppError("Unsafe upload path", 400, "invalid_upload_path");
  }
  return absolutePath;
}
