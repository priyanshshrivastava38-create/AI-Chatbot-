import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Create an account" };

export default async function RegisterPage() {
  const session = await auth();
  if (session?.user) redirect("/chat");
  return <AuthForm mode="register" />;
}
