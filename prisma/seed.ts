import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const email = (process.env.SEED_EMAIL ?? "demo@example.com").toLowerCase();
  const password = process.env.SEED_PASSWORD ?? "Demo1234";
  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: "Demo User",
      passwordHash,
      preferences: { create: {} },
    },
  });

  const existing = await prisma.conversation.findFirst({ where: { userId: user.id } });
  if (!existing) {
    await prisma.conversation.create({
      data: {
        userId: user.id,
        title: "Welcome",
        messages: {
          create: [
            { role: "USER", content: "What can you help me with?", status: "COMPLETED" },
            {
              role: "ASSISTANT",
              content:
                "I can help with writing, analysis, coding and research. Ask me anything — responses stream token by token.",
              status: "COMPLETED",
              model: process.env.AI_DEFAULT_MODEL ?? "seed",
            },
          ],
        },
      },
    });
  }

  const counts = {
    users: await prisma.user.count(),
    conversations: await prisma.conversation.count(),
    messages: await prisma.message.count(),
  };
  console.log(JSON.stringify({ seededUser: email, counts }));
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
