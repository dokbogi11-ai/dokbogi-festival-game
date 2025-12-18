import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
const COOKIE_NAME = "dokbogi_session";

import { redis } from "@/lib/redis";

type UserRow = {
  studentId: string;
  name: string;
  role: "player" | "manager" | "display";
  points: number;
};

function toNumber(v: any) {
  if (typeof v === "number") return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

  const session = await verifySession(token);
  if (session.role !== "manager") {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  // 1) 기본: users:all에서 가져오기
  let ids = await redis.smembers<string[]>("users:all");

  // 2) 비어 있으면: ranking:points에서 멤버를 끌어와 users:all을 복구
  if (!ids || ids.length === 0) {
    const members = await redis.zrange<string[]>("ranking:points", 0, 5000);
    if (members?.length) {
      for (const m of members) {
        await redis.sadd("users:all", String(m));
      }
      ids = await redis.smembers<string[]>("users:all");
    }
  }

  const rows: UserRow[] = [];

  for (const studentId of ids) {
    // 관리자/디스플레이 하드코딩 계정은 목록에서 제외(원하시면 포함도 가능)
    if (studentId === "dokbogi" || studentId === "display") continue;

    const u = await redis.hgetall<Record<string, any>>(`user:${studentId}`);
    if (!u?.studentId) continue;

    rows.push({
      studentId: String(u.studentId),
      name: String(u.name ?? ""),
      role: (String(u.role ?? "player") as any),
      points: toNumber(u.points),
    });
  }

  rows.sort((a, b) => b.points - a.points);

  return NextResponse.json({ users: rows });
}
