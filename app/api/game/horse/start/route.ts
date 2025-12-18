// app/api/game/horse/start/route.ts
import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { HORSES, RACE_MS } from "@/lib/horseRace";

type RaceState = {
  raceId: string;
  userId: string;
  pick: number;
  bet: number;
  createdAt: number;
  raceStartsAt: number;
  raceEndsAt: number;
  winner?: number | null;
  settled?: boolean;
  delta?: number;
  beforePoints?: number;
  afterPoints?: number;
};

const BET_MIN = 100;
const BET_MAX = 10000;

async function getUserPointsById(studentId: string) {
  if (!studentId) {
    return { ok: false as const, error: "학생 ID가 없습니다.", status: 400 as const };
  }

  const userKey = `user:${studentId}`;
  const data = await redis.hgetall(userKey);
  const points = Number((data as any)?.points ?? 0);

  if (!Number.isFinite(points)) {
    return { ok: false as const, error: "포인트 정보가 잘못되었습니다.", status: 500 as const };
  }

  return { ok: true as const, userId: studentId, userKey, points };
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as any;
  const pick = Number(body?.pick ?? 0);
  const bet = Math.trunc(Number(body?.bet ?? 0));
  const studentId = String(body?.studentId ?? "");

  // 말 번호 체크
  if (!Number.isInteger(pick) || pick < 1 || pick > HORSES) {
    return NextResponse.json(
      { ok: false, error: "말 번호가 올바르지 않습니다." },
      { status: 400 }
    );
  }

  // 베팅 금액 체크
  if (!Number.isFinite(bet) || bet < BET_MIN || bet > BET_MAX) {
    return NextResponse.json(
      { ok: false, error: "베팅 금액이 올바르지 않습니다." },
      { status: 400 }
    );
  }

  // 포인트 읽기 (쿠키 X)
  const ctx = await getUserPointsById(studentId);
  if (!ctx.ok) {
    return NextResponse.json(
      { ok: false, error: ctx.error },
      { status: ctx.status }
    );
  }
  if (ctx.points < bet) {
    return NextResponse.json(
      { ok: false, error: "포인트가 부족합니다." },
      { status: 400 }
    );
  }

  const raceId = crypto.randomUUID();
  const now = Date.now();
  const raceStartsAt = now;
  const raceEndsAt = now + RACE_MS; // 20초

  const state: RaceState = {
    raceId,
    userId: ctx.userId,
    pick,
    bet,
    createdAt: now,
    raceStartsAt,
    raceEndsAt,
    winner: null,
    settled: false,
    beforePoints: ctx.points,
  };

  await redis.set(`horse:race:${raceId}`, JSON.stringify(state), { ex: 60 * 5 });

  return NextResponse.json({
    ok: true,
    raceId,
    createdAt: now,
    raceStartsAt,
    raceEndsAt,
  });
}
