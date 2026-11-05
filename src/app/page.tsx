import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Code2, FileUp, Search, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

const FEATURES = [
  { icon: Zap, title: "Token-by-token streaming", text: "Replies arrive live and stop the instant you hit stop." },
  { icon: Search, title: "Searchable history", text: "Every conversation is stored and matched by title or message content." },
  { icon: Code2, title: "Markdown, code and LaTeX", text: "Syntax-highlighted blocks with one-click copy, tables and math." },
  { icon: FileUp, title: "File context", text: "Attach text files and the model reads them alongside your question." },
  { icon: ShieldCheck, title: "Private by design", text: "Keys stay on the server; conversations are scoped to their owner." },
  { icon: Sparkles, title: "Follow-up suggestions", text: "Each answer offers the next questions worth asking." },
];

export default async function LandingPage() {
  const session = await auth();
  if (session?.user) redirect("/chat");

  return (
    <div className="h-full overflow-y-auto">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles className="size-4" />
          </div>
          <span className="text-sm font-semibold tracking-tight">Prism</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/login">Sign in</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/register">
              Get started
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-5 pb-20">
        <section className="py-16 text-center sm:py-24">
          <p className="mx-auto mb-4 w-fit rounded-full border px-3 py-1 text-[11px] text-muted-foreground">
            Real model responses · no simulated streaming
          </p>
          <h1 className="mx-auto max-w-2xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            A chatbot that answers as it thinks
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-pretty text-muted-foreground">
            Prism streams every reply from your configured model, remembers the conversation, and keeps
            your history searchable — in dark or light, on any screen.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-2 sm:flex-row">
            <Button size="lg" asChild>
              <Link href="/register">
                Create an account
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link href="/login">I already have an account</Link>
            </Button>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="rounded-xl border bg-card p-4">
              <feature.icon className="size-5 text-muted-foreground" />
              <h2 className="mt-3 text-sm font-medium">{feature.title}</h2>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{feature.text}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
