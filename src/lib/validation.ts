import { z } from "zod";
import { getAiConfig } from "./env";
import { ValidationError } from "./errors";

const idSchema = z.string().min(1).max(64);

function generationParams() {
  return {
    model: z.string().min(1).max(120).optional(),
    temperature: z.number().min(0).max(2).optional(),
    maxOutputTokens: z.number().int().min(64).max(8192).optional(),
  };
}

export function chatSendSchema() {
  const { maxInputChars } = getAiConfig();
  return z
    .object({
      conversationId: idSchema,
      content: z
        .string({ error: "Message content is required" })
        .trim()
        .min(1, "Message cannot be empty")
        .max(maxInputChars, `Message is longer than ${maxInputChars} characters`),
      attachmentIds: z.array(idSchema).max(5).optional(),
      ...generationParams(),
    })
    .strict();
}

export const chatRegenerateSchema = z
  .object({
    conversationId: idSchema,
    ...generationParams(),
  })
  .strict();

export const conversationCreateSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

export const conversationUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    model: z.string().min(1).max(120).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update",
  });

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  name: z.string().trim().min(1).max(60).optional(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password must be at most 72 characters")
    .regex(/[a-zA-Z]/, "Password must contain a letter")
    .regex(/[0-9]/, "Password must contain a number"),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1, "Password is required"),
});

export const preferencesUpdateSchema = z
  .object({
    defaultModel: z.string().min(1).max(120).nullish(),
    temperature: z.number().min(0).max(2).optional(),
    maxOutputTokens: z.number().int().min(64).max(8192).optional(),
    systemPrompt: z.string().trim().max(4000).nullish(),
    sendOnEnter: z.boolean().optional(),
  })
  .strict();

export const conversationIdParams = z.object({ id: idSchema });

export async function readJsonBody<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ValidationError([{ path: "(body)", message: "Request body must be valid JSON" }]);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({
        path: issue.path.join(".") || "(body)",
        message: issue.message,
      })),
    );
  }
  return parsed.data as z.infer<S>;
}

export function parseSearchParams<S extends z.ZodType>(
  searchParams: URLSearchParams,
  schema: S,
): z.infer<S> {
  const parsed = schema.safeParse(Object.fromEntries(searchParams.entries()));
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({
        path: issue.path.join(".") || "(query)",
        message: issue.message,
      })),
    );
  }
  return parsed.data as z.infer<S>;
}

/** Validate an already-shaped value (route params, decoded objects) against a schema. */
export function parseInput<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({
        path: issue.path.join(".") || "(input)",
        message: issue.message,
      })),
    );
  }
  return parsed.data as z.infer<S>;
}
