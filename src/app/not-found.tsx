import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm font-medium text-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">This page doesn’t exist</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        The conversation was deleted, or it belongs to another account.
      </p>
      <Button asChild>
        <Link href="/chat">Back to your chats</Link>
      </Button>
    </div>
  );
}
