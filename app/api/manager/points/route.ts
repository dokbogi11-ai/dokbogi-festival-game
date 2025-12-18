import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
const COOKIE_NAME = "dokbogi_session";

import { redis } from "@/lib/redis";

type Body =
  | { studentId: string; mode: "set"; value: number }
  | { studentId: string; mode: "delta"; value: number };

export async function PATCH(req: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

  const session = await verifySession(token);
  if (session.role !== "manager") {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  const body = (await req.json()) as Partial<Body>;
  const studentId = String((body as any).studentId ?? "").trim();
  const mode = (body as any).mode as "set" | "delta";
  const value = Number((body as any).value);

  if (!/^\d{5}$/.test(studentId)) {
    return NextResponse.json({ error: "학번 형식이 올바르지 않습니다." }, { status: 400 });
  }
  if (!Number.isFinite(value)) {
    return NextResponse.json({ error: "포인트 값이 올바르지 않습니다." }, { status: 400 });
  }
  if (mode !== "set" && mode !== "delta") {
    return NextResponse.json({ error: "mode 값이 올바르지 않습니다." }, { status: 400 });
  }

  const key = `user:${studentId}`;
  const u = await redis.hgetall<Record<string, any>>(key);
  if (!u?.studentId) {
    return NextResponse.json({ error: "해당 학번의 가입 정보가 없습니다." }, { status: 404 });
  }

  const cur = Number.isFinite(Number(u.points)) ? Number(u.points) : 0;
  const next = mode === "set" ? value : cur + value;

  await redis.hset(key, { points: next });
  await redis.zadd("ranking:points", { score: next, member: studentId });

  return NextResponse.json({ ok: true, points: next });
}
