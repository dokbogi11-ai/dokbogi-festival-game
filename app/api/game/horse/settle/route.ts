// app/api/game/horse/settle/route.ts
import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis"; // 너가 쓰던 redis 클라이언트 경로 그대로

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null) as {
      studentId?: string;
      delta?: number;
    } | null;

    if (!body || !body.studentId || typeof body.delta !== "number" || !Number.isFinite(body.delta)) {
      return NextResponse.json(
        { ok: false, error: "invalid body" },
        { status: 400 }
      );
    }

    const studentId = body.studentId;
    const delta = Math.trunc(body.delta);

    const key = `user:${studentId}`;

    // 현재 포인트
    const currentStr = (await redis.hget(key, "points")) as string | null;
    const current = Number.parseInt(currentStr ?? "0", 10) || 0;

    const next = current + delta;

    await redis.hset(key, { points: String(next) });

    return NextResponse.json({ ok: true, points: next });
  } catch (e) {
    console.error("[horse/settle] server error", e);
    return NextResponse.json(
      { ok: false, error: "server error" },
      { status: 500 }
    );
  }
}
