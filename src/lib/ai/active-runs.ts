const runs = new Map<string, AbortController>();

export function runKey(userId: string, conversationId: string): string {
  return `${userId}:${conversationId}`;
}

export function hasActiveRun(key: string): boolean {
  return runs.has(key);
}

/** Registers a cancellable run. Returns null when one is already in flight for the same key. */
export function beginRun(key: string): AbortController | null {
  if (runs.has(key)) return null;
  const controller = new AbortController();
  runs.set(key, controller);
  return controller;
}

export function releaseRun(key: string, controller: AbortController): void {
  if (runs.get(key) === controller) runs.delete(key);
}

/** Explicit stop requested by the client. Returns whether a run was actually cancelled. */
export function abortRun(key: string): boolean {
  const controller = runs.get(key);
  if (!controller) return false;
  controller.abort(new Error("client_stop"));
  return true;
}
