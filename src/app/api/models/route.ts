import { NextResponse } from "next/server";
import { requireRateLimitedUser } from "@/lib/api";
import { route } from "@/lib/errors";
import { buildModelsDto } from "@/lib/models-dto";

export const GET = route(async () => {
  const user = await requireRateLimitedUser("models", 30);
  return NextResponse.json(await buildModelsDto(user.id));
});
