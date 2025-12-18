import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
const COOKIE_NAME = "dokbogi_session";

import { redis } from "@/lib/redis";

type Body = { studentId: string };

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

  const session = await verifySession(token);
  if (session.role !== "manager") {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  const body = (await req.json()) as Partial<Body>;
  const studentId = String(body.studentId ?? "").trim();

  if (!/^\d{5}$/.test(studentId)) {
    return NextResponse.json({ error: "학번 형식이 올바르지 않습니다." }, { status: 400 });
  }

  await redis.del(`user:${studentId}`);
  await redis.srem("users:all", studentId);
  await redis.zrem("ranking:points", studentId);

  return NextResponse.json({ ok: true });
}
