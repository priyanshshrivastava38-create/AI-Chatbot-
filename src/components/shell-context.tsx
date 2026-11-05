"use client";

import { createContext, useContext } from "react";

export type ShellActions = {
  toggleSidebar: () => void;
  openMobileSidebar: () => void;
  closeMobileSidebar: () => void;
  openSettings: () => void;
  newChat: () => Promise<string | null>;
  sidebarCollapsed: boolean;
};

export const ShellContext = createContext<ShellActions | null>(null);

export function useShell(): ShellActions {
  const context = useContext(ShellContext);
  if (!context) throw new Error("useShell must be used inside AppShell");
  return context;
}
