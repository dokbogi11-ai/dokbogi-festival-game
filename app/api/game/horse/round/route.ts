// app/api/game/horse/round/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { redis } from "@/lib/redis";
import { verifySession } from "@/lib/auth";

const COOKIE_NAME = "dokbogi_session";

const MIN_BET = 100;
const MAX_BET = 10000;

// 색 타입
type Color = "red" | "orange" | "yellow" | "green";

// 색 띠 배열 (왼→오)
const STRIP: Color[] = [
  "red",
  "red",
  "red",
  "red",
  "red",
  "orange",
  "orange",
  "yellow",
  "green",
  "yellow",
  "orange",
  "orange",
  "red",
  "red",
  "red",
  "red",
  "red",
];

// 색별 배당 배수 (원금 포함)
const MULTIPLIER: Record<Color, number> = {
  red: 0,      // 전부 잃음
  orange: 1,   // 원금 회수
  yellow: 1.5, // 1.5배
  green: 2,    // 2배
};

function randomIndex() {
  return Math.floor(Math.random() * STRIP.length); // 0 ~ length-1
}

export async function POST(req: NextRequest) {
  try {
    // ───── 세션 확인 ─────
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;

    if (!token) {
      return NextResponse.json(
        { ok: false, error: "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    const session = await verifySession(token as string).catch(() => null as any);
    if (!session?.studentId) {
      return NextResponse.json(
        { ok: false, error: "세션이 유효하지 않습니다." },
        { status: 401 }
      );
    }

    const studentId = String(session.studentId);
    const userKey = `user:${studentId}`;

    // ───── 요청 파라미터 ─────
    const body = (await req.json().catch(() => null)) as any;
    if (!body) {
      return NextResponse.json(
        { ok: false, error: "잘못된 요청입니다." },
        { status: 400 }
      );
    }

    const amount = Number(body.amount ?? NaN);

    if (!Number.isFinite(amount) || amount < MIN_BET || amount > MAX_BET) {
      return NextResponse.json(
        {
          ok: false,
          error: `베팅 금액은 ${MIN_BET} ~ ${MAX_BET} 사이여야 합니다.`,
        },
        { status: 400 }
      );
    }

    // ───── 현재 포인트 읽기 ─────
    const rawUser = (await redis.hgetall(userKey)) as Record<string, any>;
    const currentPoints = Number.isFinite(Number(rawUser?.points))
      ? Number(rawUser.points)
      : 0;

    if (currentPoints < amount) {
      return NextResponse.json(
        { ok: false, error: "포인트가 부족합니다." },
        { status: 400 }
      );
    }

    // ───── 결과 결정 ─────
    const index = randomIndex();
    const color = STRIP[index];
    const multiplier = MULTIPLIER[color];

    // 지급 포인트 (정수로 맞춰주려고 floor)
    const reward = Math.floor(amount * multiplier);
    const newPoints = currentPoints - amount + reward;
    const delta = newPoints - currentPoints;

    await redis.hset(userKey, {
      ...rawUser,
      points: String(newPoints),
    });

    return NextResponse.json({
      ok: true,
      index,        // 몇 번째 칸인지 (0 ~ STRIP.length-1)
      color,        // "red" | "orange" | "yellow" | "green"
      multiplier,   // 0 / 1 / 1.5 / 2
      delta,        // 이번 판에서 변한 포인트
      points: newPoints, // 최종 포인트
    });
  } catch (err) {
    console.error("[color/round] error", err);
    return NextResponse.json(
      { ok: false, error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
