import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { redis } from "@/lib/redis";
import { verifySession } from "@/lib/auth";
const COOKIE_NAME = "dokbogi_session";


const RANDOM_COST = 5000;

export async function POST() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;

    if (!token) {
      return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    const session = await verifySession(token);
    if (session.role !== "player") {
      return NextResponse.json({ ok: false, error: "권한이 없습니다." }, { status: 403 });
    }

    const userKey = `user:${session.studentId}`;
    const user = (await (redis as any).hgetall(userKey)) as any;
    const curPoints = Number.isFinite(Number(user?.points)) ? Number(user.points) : 0;

    if (curPoints < RANDOM_COST) {
      return NextResponse.json({ ok: false, error: "포인트가 부족합니다." }, { status: 400 });
    }

    const nextPoints = curPoints - RANDOM_COST;

    await (redis as any).hset(userKey, { points: nextPoints });
    await (redis as any).zadd("ranking:points", {
      score: nextPoints,
      member: session.studentId,
    });

    return NextResponse.json({ ok: true, points: nextPoints });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
