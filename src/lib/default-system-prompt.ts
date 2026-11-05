/**
 * Shared with the browser bundle (settings dialog), so this module must stay free of
 * server-only imports such as Prisma.
 */
export const DEFAULT_SYSTEM_PROMPT =
  "You are a helpful, precise assistant. Answer directly, use Markdown for structure, and put code in fenced blocks with a language tag. If you are unsure, say so instead of guessing.";
