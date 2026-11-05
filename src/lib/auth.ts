import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { checkRateLimit } from "./rate-limit";
import { loginSchema } from "./validation";
import { logger } from "./log";

export const AUTH_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export type JwtWithUserId = { userId?: string };

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET,
  // Behind a proxy (Vercel, containers) Auth.js cannot tell the public origin from the request.
  trustHost: true,
  session: {
    strategy: "jwt",
    maxAge: AUTH_SESSION_MAX_AGE_SECONDS,
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    Credentials({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const forwarded = request?.headers?.get("x-forwarded-for");
        const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";
        const attempts = checkRateLimit(`login:${parsed.data.email}:${ip}`, 10, 5 * 60_000);
        if (!attempts.ok) {
          logger.info("auth.login_rate_limited");
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
        });
        if (!user) {
          logger.info("auth.login_unknown_email");
          return null;
        }

        const passwordMatches = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!passwordMatches) {
          logger.info("auth.login_bad_password", { userId: user.id });
          return null;
        }

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) (token as JwtWithUserId).userId = user.id;
      return token;
    },
    session({ session, token }) {
      const userId = (token as JwtWithUserId).userId;
      if (session.user && userId) {
        session.user.id = String(userId);
      }
      return session;
    },
  },
});
