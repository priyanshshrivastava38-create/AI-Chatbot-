import { AppError } from "../errors";
import { logger } from "../log";
import { abortRun, beginRun, releaseRun, runKey } from "./active-runs";
import { runChatTurn, type RunTurnInput } from "./run-turn";
import { sseEncode, sseResponse } from "./sse";
import type { ChatStreamEvent } from "./types";

export type StartChatStreamInput = Omit<RunTurnInput, "signal"> & {
  requestSignal: AbortSignal;
};

/**
 * Wraps a turn as an SSE Response. Cancellation is bidirectional: a disconnected client aborts
 * the provider call, and an explicit stop request (see abortRun) tears down the same controller.
 */
export function startChatStream(input: StartChatStreamInput): Response {
  const { requestSignal, ...turnInput } = input;
  const key = runKey(turnInput.userId, turnInput.conversationId);
  const controller = beginRun(key);
  if (!controller) {
    throw new AppError(
      "A response is already being generated for this conversation",
      409,
      "generation_in_progress",
    );
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(sink) {
      const encoder = new TextEncoder();
      let writable = true;

      const safeSend = (event: ChatStreamEvent) => {
        if (!writable) return;
        try {
          sink.enqueue(encoder.encode(sseEncode(event)));
        } catch {
          writable = false;
        }
      };

      const onRequestAbort = () => controller.abort(new Error("client_disconnected"));
      if (requestSignal.aborted) onRequestAbort();
      else requestSignal.addEventListener("abort", onRequestAbort, { once: true });

      try {
        for await (const event of runChatTurn({ ...turnInput, signal: controller.signal })) {
          safeSend(event);
        }
      } catch (error) {
        logger.error("chat.stream_crashed", {
          conversationId: turnInput.conversationId,
          message: error instanceof Error ? error.message : String(error),
        });
        safeSend({
          type: "error",
          code: "stream_failed",
          message: "The response stream failed. Please try again.",
        });
      } finally {
        requestSignal.removeEventListener("abort", onRequestAbort);
        releaseRun(key, controller);
        if (writable) {
          try {
            sink.close();
          } catch {
            // Already closed by a client disconnect.
          }
        }
      }
    },
    cancel(reason) {
      controller.abort(reason instanceof Error ? reason : new Error("client_cancelled"));
    },
  });

  return sseResponse(stream);
}

export { abortRun, runKey };
