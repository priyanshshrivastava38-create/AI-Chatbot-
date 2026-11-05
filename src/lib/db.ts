import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getEnv } from "./env";

/** Managed Postgres refuses plaintext connections; a local server usually accepts them. */
function adapterConnectionString(): string {
  const url = new URL(getEnv().DATABASE_URL);
  const local = ["localhost", "127.0.0.1", "::1", "0.0.0.0"].includes(url.hostname);
  if (!local && !url.searchParams.has("sslmode")) url.searchParams.set("sslmode", "require");
  return url.toString();
}

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: adapterConnectionString() });
  return new PrismaClient({ adapter });
}

type PrismaClientInstance = ReturnType<typeof createPrismaClient>;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClientInstance };

export const prisma: PrismaClientInstance =
  globalForPrisma.prisma ?? (globalForPrisma.prisma = createPrismaClient());

export type { PrismaClientInstance as DbClient };
