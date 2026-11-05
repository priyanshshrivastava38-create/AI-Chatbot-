import { NextResponse } from "next/server";
import { requireRateLimitedUser } from "@/lib/api";
import { findOwnedConversation } from "@/lib/conversations";
import { prisma } from "@/lib/db";
import { AppError, route } from "@/lib/errors";
import { logger } from "@/lib/log";
import { prepareUpload, storeUpload } from "@/lib/uploads";

export const POST = route(async (request: Request) => {
  const user = await requireRateLimitedUser("upload", 20);

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    throw new AppError("Uploads must be sent as multipart/form-data", 415, "invalid_encoding");
  }

  const form = await request.formData();
  const conversationId = String(form.get("conversationId") ?? "");
  const file = form.get("file");

  if (!conversationId) throw new AppError("conversationId is required", 400, "missing_conversation");
  if (!(file instanceof File)) throw new AppError("A file part named \"file\" is required", 400, "missing_file");

  const conversation = await findOwnedConversation(user.id, conversationId);
  const upload = await prepareUpload(file);
  const storageKey = await storeUpload(user.id, upload);

  const attachment = await prisma.attachment.create({
    data: {
      userId: user.id,
      conversationId: conversation.id,
      fileName: upload.fileName,
      mimeType: upload.mimeType,
      sizeBytes: upload.sizeBytes,
      storageKey,
      extractedText: upload.extractedText,
      textTruncated: upload.textTruncated,
    },
    select: { id: true, fileName: true, mimeType: true, sizeBytes: true },
  });

  logger.info("upload.stored", { userId: user.id, attachmentId: attachment.id });
  return NextResponse.json({ attachment }, { status: 201 });
});
