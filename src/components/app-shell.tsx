"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ModelsDto, PreferencesDto } from "@/types/chat";
import { ShellContext, type ShellActions } from "./shell-context";
import { useConversationStore } from "./sidebar/conversation-store";
import { SettingsDialog } from "./settings/settings-dialog";

type AppShellProps = {
  sidebar: ReactNode;
  children: ReactNode;
  preferences: PreferencesDto;
  models: ModelsDto;
};

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export function AppShell({ sidebar, children, preferences, models }: AppShellProps) {
  const router = useRouter();
  const store = useConversationStore();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const toggleSidebar = useCallback(() => {
    if (window.matchMedia("(min-width: 768px)").matches) {
      setCollapsed((value) => !value);
    } else {
      setMobileOpen((value) => !value);
    }
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const meta = event.metaKey || event.ctrlKey;

      if (meta && event.key.toLowerCase() === "k") {
        event.preventDefault();
        void store.create();
        return;
      }
      if (meta && event.key.toLowerCase() === "b") {
        event.preventDefault();
        toggleSidebar();
        return;
      }
      if (meta && event.key === ",") {
        event.preventDefault();
        setSettingsOpen(true);
        return;
      }
      if (event.key === "/" && !meta && !isTypingTarget(event.target)) {
        event.preventDefault();
        document.querySelector<HTMLTextAreaElement>("[data-composer]")?.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [store, toggleSidebar]);

  const actions = useMemo<ShellActions>(
    () => ({
      toggleSidebar,
      openMobileSidebar: () => setMobileOpen(true),
      closeMobileSidebar: () => setMobileOpen(false),
      openSettings: () => setSettingsOpen(true),
      newChat: () => store.create(),
      sidebarCollapsed: collapsed,
    }),
    [collapsed, store, toggleSidebar],
  );

  return (
    <ShellContext.Provider value={actions}>
      <TooltipProvider delayDuration={350}>
        <div className="flex h-dvh w-full overflow-hidden bg-background">
          <aside
            className={cn(
              "hidden h-full shrink-0 overflow-hidden border-r transition-[width] duration-200 ease-out md:block",
              collapsed ? "w-0 border-r-0" : "w-[280px]",
            )}
          >
            <div className="h-full w-[280px]">{sidebar}</div>
          </aside>

          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetContent side="left" className="w-[85vw] max-w-[320px] p-0 sm:w-[320px]">
              {sidebar}
            </SheetContent>
          </Sheet>

          <main className="flex min-w-0 flex-1 flex-col">{children}</main>
        </div>

        <SettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          initialPreferences={preferences}
          models={models}
          onSaved={() => router.refresh()}
        />
      </TooltipProvider>
    </ShellContext.Provider>
  );
}
