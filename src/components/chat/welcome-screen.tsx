"use client";

import { useSession } from "next-auth/react";
import { BookOpen, Calculator, Code2, Lightbulb, Paperclip } from "lucide-react";

const SUGGESTIONS = [
  {
    icon: BookOpen,
    label: "Explain a concept",
    prompt: "Explain how HTTPS keeps a request secure, in plain language with a short diagram.",
  },
  {
    icon: Code2,
    label: "Write production code",
    prompt:
      "Write a TypeScript function that debounces an async call, with unit tests and a note on edge cases.",
  },
  {
    icon: Calculator,
    label: "Compare options",
    prompt:
      "Compare SQL and NoSQL databases for a usage-analytics pipeline. Give a table and a recommendation.",
  },
  {
    icon: Lightbulb,
    label: "Draft something",
    prompt: "Draft a concise release note for a chat product that added streaming and file uploads.",
  },
];

export function WelcomeScreen({
  onPick,
  modelName,
}: {
  onPick: (prompt: string) => void;
  modelName: string;
}) {
  const { data } = useSession();
  const firstName = (data?.user?.name ?? "").trim().split(" ")[0];
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-xl">
        <h1 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">
          {firstName ? `What can I do for you, ${firstName}?` : "How can I help today?"}
        </h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Answers stream live from <span className="font-mono text-foreground/80">{modelName}</span>.
          Everything you send stays in your account.
        </p>

        <div className="mt-8 space-y-2">
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Try one of these
          </p>
          {SUGGESTIONS.map(({ icon: Icon, label, prompt }) => (
            <button
              key={label}
              type="button"
              onClick={() => onPick(prompt)}
              className="group flex w-full items-start gap-3 rounded-xl border bg-card p-3.5 text-left transition-all hover:-translate-y-px hover:border-foreground/20 hover:shadow-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground group-hover:bg-background group-hover:text-foreground">
                <Icon className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{label}</span>
                <span className="mt-0.5 block line-clamp-2 text-xs text-muted-foreground">
                  {prompt}
                </span>
              </span>
            </button>
          ))}
        </div>

        <p className="mt-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Paperclip className="size-3" /> Drop a file in and I’ll read it
          </span>
          <span className="hidden sm:inline">
            <kbd className="rounded border px-1 py-0.5 font-sans">⌘K</kbd> new chat
          </span>
          <span>
            <kbd className="rounded border px-1 py-0.5 font-sans">/</kbd> focus the composer
          </span>
          <span>
            <kbd className="rounded border px-1 py-0.5 font-sans">Esc</kbd> stop a response
          </span>
        </p>
      </div>
    </div>
  );
}
