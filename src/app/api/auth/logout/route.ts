import { NextResponse } from "next/server";
import { destroyUserSession } from "@/lib/auth/cookies";

export async function POST() {
  await destroyUserSession();
  return NextResponse.json({ ok: true });
}
