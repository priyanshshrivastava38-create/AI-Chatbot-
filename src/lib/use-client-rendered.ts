"use client";

import { useSyncExternalStore } from "react";

function subscribe(): () => void {
  return () => {};
}

/**
 * False while rendering on the server and during hydration, true afterwards.
 * Use it for text that only the browser can compute — local clock times and day
 * boundaries — so the server HTML and the first client render stay identical.
 */
export function useClientRendered(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
