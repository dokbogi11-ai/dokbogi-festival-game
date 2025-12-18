// app/api/game/horse/finish/route.ts
import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { HORSES } from "@/lib/horseRace";

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

async function setUserPoints(userKey: string, points: number) {
  const safe = Math.trunc(points);
  await redis.hset(userKey, { points: String(safe) });
}

function seededRandomInt(seedStr: string, max: number): number {
  let h = 0;
  for (let i = 0; i < seedStr.length; i++) {
    h = (h * 31 + seedStr.charCodeAt(i)) | 0;
  }
  if (h < 0) h = -h;
  return (h % max) + 1; // 1..max
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as any;
  const raceId = String(body?.raceId ?? "");

  if (!raceId) {
    return NextResponse.json(
      { ok: false, error: "레이스 ID가 필요합니다." },
      { status: 400 }
    );
  }

  const raw = await redis.get(`horse:race:${raceId}`);
  if (!raw) {
    return NextResponse.json(
      { ok: false, error: "경기를 찾을 수 없습니다." },
      { status: 404 }
    );
  }

  const state = JSON.parse(raw) as RaceState;

  const ctx = await getUserPointsById(state.userId);
  if (!ctx.ok) {
    return NextResponse.json(
      { ok: false, error: ctx.error },
      { status: ctx.status }
    );
  }

  const now = Date.now();
  if (now < state.raceEndsAt) {
    return NextResponse.json(
      { ok: false, error: "경기가 아직 종료되지 않았습니다." },
      { status: 400 }
    );
  }

  // 이미 정산된 경우 그대로 반환
  if (state.settled && typeof state.afterPoints === "number") {
    return NextResponse.json({
      ok: true,
      settled: true,
      winner: state.winner,
      delta: state.delta ?? 0,
      points: state.afterPoints,
    });
  }

  const winner =
    state.winner && state.winner >= 1 && state.winner <= HORSES
      ? state.winner
      : seededRandomInt(state.raceId, HORSES);

  const before = typeof state.beforePoints === "number" ? state.beforePoints : ctx.points;
  const win = state.pick === winner;
  const delta = win ? state.bet : -state.bet;
  const after = before + delta;

  await setUserPoints(`user:${ctx.userId}`, after);

  const newState: RaceState = {
    ...state,
    winner,
    settled: true,
    delta,
    beforePoints: before,
    afterPoints: after,
  };

  await redis.set(`horse:race:${raceId}`, JSON.stringify(newState), {
    ex: 60 * 10,
  });

  return NextResponse.json({
    ok: true,
    settled: true,
    winner,
    win,
    delta,
    points: after,
  });
}
