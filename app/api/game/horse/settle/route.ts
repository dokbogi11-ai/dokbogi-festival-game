// app/api/game/horse/settle/route.ts
import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { verifySession, COOKIE_NAME } from "@/lib/auth";

type SettleBody = {
  delta: number; // 이기면 +, 지면 -
};

export async function POST(req: NextRequest) {
  try {
    // 1. 쿠키에서 토큰 가져오기
    const token = req.cookies.get(COOKIE_NAME)?.value;

    if (!token) {
      return NextResponse.json(
        { ok: false, error: "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    // 2. 세션 검증
    const session = await verifySession(token).catch(() => null);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "세션이 유효하지 않습니다." },
        { status: 401 }
      );
    }

    const studentId = session.studentId;

    // 3. body 파싱
    const body = (await req.json()) as Partial<SettleBody>;
    if (typeof body.delta !== "number") {
      return NextResponse.json(
        { ok: false, error: "delta 값이 필요합니다." },
        { status: 400 }
      );
    }

    const delta = body.delta;

    // 4. 현재 포인트 읽기
    const userKey = `user:${studentId}`;
    const user = await redis.hgetall(userKey);
    const currentPoints = Number(user?.points ?? "0");

    // 5. 새 포인트 계산 (음수 방지)
    let newPoints = currentPoints + delta;
    if (newPoints < 0) newPoints = 0;

    // 6. DB + 랭킹 업데이트
    await redis.hset(userKey, { points: String(newPoints) });
    await redis.zadd("ranking:points", {
      score: newPoints,
      member: studentId,
    });

    // 7. 응답
    return NextResponse.json({
      ok: true,
      studentId,
      beforePoints: currentPoints,
      delta,
      points: newPoints,
    });
  } catch (err) {
    console.error("[/api/game/horse/settle] error:", err);
    return NextResponse.json(
      { ok: false, error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
