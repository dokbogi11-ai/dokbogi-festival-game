import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

import { redis } from "@/lib/redis";
import { verifySession } from "@/lib/auth";
const COOKIE_NAME = "dokbogi_session";


const MIN_BET = 100;
const MAX_BET = 10000;
const SLOT_COUNT = 6;

const EXACT_PAYOUT = 2;    // 정확 번호 2배
const SIMPLE_PAYOUT = 1.5; // 나머지 1.5배

type BetType = "EXACT" | "ODD" | "EVEN" | "LEFT" | "RIGHT";

function randomFinalSlot() {
  return Math.floor(Math.random() * SLOT_COUNT) + 1; // 1~6
}

export async function POST(req: NextRequest) {
  try {
    // 세션
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) {
      return NextResponse.json(
        { ok: false, error: "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    const session = await verifySession(token as string);
    if (!session?.studentId) {
      return NextResponse.json(
        { ok: false, error: "세션이 유효하지 않습니다." },
        { status: 401 }
      );
    }

    const studentId = session.studentId;
    const userKey = `user:${studentId}`;

    // 요청 파라미터
    const body = (await req.json().catch(() => null)) as any;
    if (!body) {
      return NextResponse.json(
        { ok: false, error: "잘못된 요청입니다." },
        { status: 400 }
      );
    }

    const betType = body.betType as BetType;
    const betSlot = Number(body.betSlot ?? 0);
    const amount = Number(body.amount);

    if (!["EXACT", "ODD", "EVEN", "LEFT", "RIGHT"].includes(betType)) {
      return NextResponse.json(
        { ok: false, error: "유효하지 않은 베팅 유형입니다." },
        { status: 400 }
      );
    }

    if (!Number.isFinite(amount) || amount < MIN_BET || amount > MAX_BET) {
      return NextResponse.json(
        { ok: false, error: "베팅 금액 범위를 확인하세요." },
        { status: 400 }
      );
    }

    if (betType === "EXACT" && (betSlot < 1 || betSlot > SLOT_COUNT)) {
      return NextResponse.json(
        { ok: false, error: "유효하지 않은 번호입니다." },
        { status: 400 }
      );
    }

    // 현재 포인트 읽기
    const userData = (await redis.hgetall(userKey)) as Record<string, any>;
    const currentPoints = Number.isFinite(Number(userData?.points))
      ? Number(userData.points)
      : 0;

    if (currentPoints < amount) {
      return NextResponse.json(
        { ok: false, error: "포인트가 부족합니다." },
        { status: 400 }
      );
    }

    // 결과 계산
    const finalSlot = randomFinalSlot();
    let win = false;
    let reward = 0;

    if (betType === "EXACT" && betSlot === finalSlot) {
      win = true;
      reward = amount * EXACT_PAYOUT;
    } else if (betType === "ODD" && finalSlot % 2 === 1) {
      win = true;
      reward = Math.floor(amount * SIMPLE_PAYOUT);
    } else if (betType === "EVEN" && finalSlot % 2 === 0) {
      win = true;
      reward = Math.floor(amount * SIMPLE_PAYOUT);
    } else if (betType === "LEFT" && finalSlot <= 3) {
      win = true;
      reward = Math.floor(amount * SIMPLE_PAYOUT);
    } else if (betType === "RIGHT" && finalSlot >= 4) {
      win = true;
      reward = Math.floor(amount * SIMPLE_PAYOUT);
    }

    const newPoints = currentPoints - amount + reward;
    const delta = newPoints - currentPoints;

    await redis.hset(userKey, { ...userData, points: String(newPoints) });
    await redis.zadd("ranking:points", {
      score: newPoints,
      member: studentId,
    });

    return NextResponse.json({
      ok: true,
      finalSlot,
      win,
      delta,
      points: newPoints,
    });
  } catch (e) {
    console.error("tree round error", e);
    return NextResponse.json(
      { ok: false, error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
