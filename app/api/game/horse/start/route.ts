// app/api/game/horse/start/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { redis } from "@/lib/redis";
import { verifySession, COOKIE_NAME } from "@/lib/auth";

const HORSES = 5;
const RACE_SECONDS = 20;
const MIN_BET = 100;
const MAX_BET = 10000;

type RaceState = {
  raceId: string;
  userId: string;
  pick: number;
  bet: number;
  createdAt: number;
  raceEndsAt: number;
  settled: boolean;
  winner: number | null;
  delta: number;
  afterPoints: number | null;
};

async function getUserIdFromCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value ?? "";
  if (!token) return null;

  try {
    const session: any = await verifySession(token);
    const studentId = String(session?.studentId ?? "");
    if (!studentId) return null;
    return studentId;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const userId = await getUserIdFromCookie();
    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    const body: any = await req.json().catch(() => null);
    const pick = Number(body?.pick);
    const bet = Number(body?.bet);

    if (!Number.isInteger(pick) || pick < 1 || pick > HORSES) {
      return NextResponse.json(
        { ok: false, error: "말 번호가 잘못되었습니다." },
        { status: 400 }
      );
    }

    if (!Number.isFinite(bet) || bet < MIN_BET || bet > MAX_BET) {
      return NextResponse.json(
        {
          ok: false,
          error: `베팅 금액은 ${MIN_BET} ~ ${MAX_BET} 사이여야 합니다.`,
        },
        { status: 400 }
      );
    }

    const userKey = `user:${userId}`;
    const rawUser = (await redis.hgetall(userKey)) as any;
    const currentPoints = Number(rawUser?.points ?? 0);

    if (!Number.isFinite(currentPoints)) {
      return NextResponse.json(
        { ok: false, error: "포인트 정보가 잘못되었습니다." },
        { status: 500 }
      );
    }

    if (currentPoints < bet) {
      return NextResponse.json(
        { ok: false, error: "포인트가 부족합니다." },
        { status: 400 }
      );
    }

    // ✅ 경기 시작 시: 포인트에서 bet만 빼기
    const newPoints = currentPoints - bet;
    await redis.hset(userKey, { points: String(newPoints) });

    const now = Date.now();
    const raceId = `${userId}:${now}:${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const raceKey = `horse:race:${raceId}`;

    const state: RaceState = {
      raceId,
      userId,
      pick,
      bet,
      createdAt: now,
      raceEndsAt: now + RACE_SECONDS * 1000,
      settled: false,
      winner: null,
      delta: 0,
      afterPoints: null,
    };

    await redis.set(raceKey, JSON.stringify(state) as any);

    return NextResponse.json({
      ok: true,
      raceId,
      points: newPoints,
    });
  } catch (err) {
    console.error("[horse/start] error", err);
    return NextResponse.json(
      { ok: false, error: "경기 시작에 실패했습니다." },
      { status: 500 }
    );
  }
}
