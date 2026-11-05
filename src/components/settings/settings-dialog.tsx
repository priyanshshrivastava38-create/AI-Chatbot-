"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/default-system-prompt";
import type { ModelsDto, PreferencesDto, UsageDto } from "@/types/chat";

type SettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPreferences: PreferencesDto;
  models: ModelsDto;
  onSaved: () => void;
};

type Draft = {
  model: string;
  temperature: number;
  maxOutputTokens: number;
  systemPrompt: string;
  sendOnEnter: boolean;
};

const SHORTCUTS = [
  { keys: "⌘ K", label: "Start a new chat" },
  { keys: "⌘ B", label: "Show or hide the sidebar" },
  { keys: "⌘ ,", label: "Open settings" },
  { keys: "/", label: "Focus the composer (when not typing)" },
  { keys: "Enter", label: "Send the message" },
  { keys: "⇧ Enter", label: "Insert a newline" },
  { keys: "Esc", label: "Stop generation or close a dialog" },
];

function toDraft(preferences: PreferencesDto): Draft {
  return {
    model: preferences.model,
    temperature: preferences.temperature,
    maxOutputTokens: preferences.maxOutputTokens,
    systemPrompt: preferences.systemPrompt,
    sendOnEnter: preferences.sendOnEnter,
  };
}

function NumberField({
  id,
  label,
  value,
  min,
  max,
  step,
  hint,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  hint: string;
  onChange: (value: number) => void;
}) {
  const [text, setText] = useState(String(value));

  // Keep the editable text in sync when the value comes back from the server.
  const [syncedValue, setSyncedValue] = useState(value);
  if (syncedValue !== value) {
    setSyncedValue(value);
    setText(String(value));
  }

  const parsed = Number(text);
  const sliderValue = Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : min;

  function commit(raw: string) {
    setText(raw);
    const next = Number(raw);
    if (Number.isFinite(next)) onChange(next);
  }

  function commitClamped() {
    const next = Number(text);
    const clamped = Math.min(max, Math.max(min, Number.isFinite(next) ? next : min));
    setText(String(clamped));
    onChange(clamped);
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <Label htmlFor={id}>{label}</Label>
        <span className="text-[11px] text-muted-foreground">
          {min}-{max}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={sliderValue}
          onChange={(event) => commit(event.target.value)}
          className="h-1.5 flex-1 cursor-pointer accent-primary"
        />
        <Input
          aria-label={`${label} value`}
          value={text}
          inputMode="numeric"
          onChange={(event) => commit(event.target.value)}
          onBlur={commitClamped}
          className="w-20 text-center"
        />
      </div>
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function UsagePanel() {
  const [usage, setUsage] = useState<UsageDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/usage?days=14", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as UsageDto;
      })
      .then((payload) => {
        if (!cancelled) setUsage(payload);
      })
      .catch(() => {
        if (!cancelled) setError("Usage statistics are unavailable right now.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <p className="py-8 text-center text-sm text-destructive">{error}</p>;
  if (!usage) return <p className="py-8 text-center text-sm text-muted-foreground">Loading usage…</p>;

  const peak = Math.max(1, ...usage.perDay.map((day) => day.tokens));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "Messages", value: usage.totals.messages },
          { label: "Conversations", value: usage.totals.conversations },
          { label: "Tokens (14d)", value: usage.totals.totalTokens },
          { label: "Errors", value: usage.totals.failed },
        ].map((card) => (
          <div key={card.label} className="rounded-lg border bg-card p-3">
            <p className="text-[11px] tracking-wide text-muted-foreground uppercase">{card.label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{card.value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Daily token usage</p>
        <div className="flex h-24 items-end gap-1" aria-hidden>
          {usage.perDay.map((day) => (
            <div
              key={day.date}
              title={`${day.date}: ${day.tokens.toLocaleString()} tokens, ${day.messages} messages`}
              className="flex-1 rounded-t bg-primary/70 transition-colors hover:bg-primary"
              style={{ height: `${Math.max(2, (day.tokens / peak) * 100)}%` }}
            />
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {usage.totals.promptTokens.toLocaleString()} prompt + {usage.totals.completionTokens.toLocaleString()}{" "}
          completion tokens · {usage.totals.cancelled} cancelled generations
        </p>
      </div>

      <Separator />

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">By model</p>
        {usage.perModel.length === 0 ? (
          <p className="text-sm text-muted-foreground">No generations yet.</p>
        ) : (
          <div className="space-y-1.5">
            {usage.perModel.map((row) => (
              <div key={row.model} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate font-mono text-xs">{row.model}</span>
                <Badge variant="secondary">{row.messages} msgs</Badge>
                <span className="w-24 text-right text-xs tabular-nums text-muted-foreground">
                  {(row.promptTokens + row.completionTokens).toLocaleString()} tok
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Remounted every time the dialog opens, so the draft always starts from the saved values. */
function SettingsForm({
  initialPreferences,
  models,
  onClose,
  onSaved,
}: {
  initialPreferences: PreferencesDto;
  models: ModelsDto;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(initialPreferences));
  const [saving, setSaving] = useState(false);
  const limits = models.limits;
  const original = useMemo(() => JSON.stringify(toDraft(initialPreferences)), [initialPreferences]);
  const isDirty = useMemo(() => JSON.stringify(draft) !== original, [draft, original]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaultModel: draft.model,
          temperature: draft.temperature,
          maxOutputTokens: Math.round(draft.maxOutputTokens),
          systemPrompt: draft.systemPrompt.trim() === DEFAULT_SYSTEM_PROMPT ? null : draft.systemPrompt,
          sendOnEnter: draft.sendOnEnter,
        }),
      });
      if (!response.ok) {
        const detail = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(detail?.error?.message ?? `Could not save settings (HTTP ${response.status}).`);
      }
      toast.success("Settings saved.");
      onSaved();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  }, [draft, onClose, onSaved]);

  return (
    <>
      <Tabs defaultValue="chat" className="min-h-0 flex-1">
        <TabsList className="mx-5 mt-3">
          <TabsTrigger value="chat">Chat</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
          <TabsTrigger value="shortcuts">Shortcuts</TabsTrigger>
        </TabsList>

        <TabsContent value="chat" className="min-h-0">
          <ScrollArea className="max-h-[52dvh] px-5">
            <div className="space-y-5 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="settings-model">Default model</Label>
                <select
                  id="settings-model"
                  value={draft.model}
                  onChange={(event) => setDraft((d) => ({ ...d, model: event.target.value }))}
                  className="h-8 w-full rounded-lg border border-input bg-input/30 px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {models.models.length === 0 && <option value={draft.model}>{draft.model}</option>}
                  {models.models.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-muted-foreground">
                  Applied to new chats. Each conversation can override it from the header.
                </p>
              </div>

              <NumberField
                id="settings-temperature"
                label="Temperature"
                value={draft.temperature}
                min={limits.temperature.min}
                max={limits.temperature.max}
                step={0.05}
                hint="Lower is focused and deterministic, higher is more creative."
                onChange={(value) => setDraft((d) => ({ ...d, temperature: value }))}
              />

              <NumberField
                id="settings-max-tokens"
                label="Max output tokens"
                value={draft.maxOutputTokens}
                min={limits.maxOutputTokens.min}
                max={limits.maxOutputTokens.max}
                step={64}
                hint="Hard cap on the length of a single assistant reply."
                onChange={(value) => setDraft((d) => ({ ...d, maxOutputTokens: value }))}
              />

              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label htmlFor="settings-send">Send on Enter</Label>
                  <p className="text-[11px] text-muted-foreground">
                    When off, use ⌘/Ctrl+Enter to send.
                  </p>
                </div>
                <Switch
                  id="settings-send"
                  checked={draft.sendOnEnter}
                  onCheckedChange={(value) => setDraft((d) => ({ ...d, sendOnEnter: value }))}
                />
              </div>

              <Separator />

              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between">
                  <Label htmlFor="settings-system">System prompt</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => setDraft((d) => ({ ...d, systemPrompt: DEFAULT_SYSTEM_PROMPT }))}
                  >
                    <RotateCcw className="size-3" />
                    Reset
                  </Button>
                </div>
                <Textarea
                  id="settings-system"
                  value={draft.systemPrompt}
                  onChange={(event) => setDraft((d) => ({ ...d, systemPrompt: event.target.value }))}
                  rows={5}
                  maxLength={4000}
                  className="resize-y text-sm"
                />
                <p className="text-[11px] text-muted-foreground">
                  {draft.systemPrompt.length}/4000 · guides every reply in every conversation.
                </p>
              </div>

              <div className="rounded-lg border bg-muted/40 p-3 text-[11px] text-muted-foreground">
                Context window: {initialPreferences.contextWindow.toLocaleString()} tokens · input limit{" "}
                {limits.maxInputChars.toLocaleString()} characters · upload limit{" "}
                {Math.round(limits.maxUploadBytes / 1024 / 1024)} MB per file.
              </div>
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="usage" className="max-h-[52dvh] min-h-0 overflow-y-auto px-5 py-4">
          <UsagePanel />
        </TabsContent>

        <TabsContent
          value="shortcuts"
          className="max-h-[52dvh] min-h-0 overflow-y-auto px-5 py-4"
        >
          <div className="space-y-2">
            {SHORTCUTS.map((shortcut) => (
              <div key={shortcut.keys} className="flex items-center justify-between gap-4 text-sm">
                <span className="text-muted-foreground">{shortcut.label}</span>
                <kbd>{shortcut.keys}</kbd>
              </div>
            ))}
            <p className="pt-2 text-[11px] text-muted-foreground">
              On Windows and Linux use Ctrl instead of ⌘.
            </p>
          </div>
        </TabsContent>
      </Tabs>

      <DialogFooter className="border-t px-5 py-3">
        {isDirty && <span className="mr-auto text-[11px] text-muted-foreground">Unsaved changes</span>}
        <Button variant="ghost" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={() => void save()} disabled={saving || !isDirty}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save changes
        </Button>
      </DialogFooter>
    </>
  );
}

export function SettingsDialog({
  open,
  onOpenChange,
  initialPreferences,
  models,
  onSaved,
}: SettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Generation defaults for new chats · provider: {models.provider}
          </DialogDescription>
        </DialogHeader>

        {open && (
          <SettingsForm
            initialPreferences={initialPreferences}
            models={models}
            onClose={() => onOpenChange(false)}
            onSaved={onSaved}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
