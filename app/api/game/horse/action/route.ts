// app/api/game/horse/action/route.ts
import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { HORSES } from "@/lib/horseRace";

const COST_DEFAULT_ITEM = 3000;
const COST_PAUSE_3S = 4000;
const COST_BACK_2S = 5000;
const COST_RANDOM = 5000;

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

function getItemCost(type: string): number {
  switch (type) {
    case "pause3":
      return COST_PAUSE_3S;
    case "back2":
      return COST_BACK_2S;
    case "randomSpeed":
      return COST_RANDOM;
    case "slowA":
    case "slowB":
    default:
      return COST_DEFAULT_ITEM;
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as any;
  const raceId = String(body?.raceId ?? "");
  const type = String(body?.type ?? "");
  const horseId = Number(body?.horseId ?? 0);

  if (!raceId) {
    return NextResponse.json(
      { ok: false, error: "레이스 ID가 필요합니다." },
      { status: 400 }
    );
  }

  if (!["pause3", "back2", "slowA", "slowB", "randomSpeed"].includes(type)) {
    return NextResponse.json(
      { ok: false, error: "잘못된 아이템입니다." },
      { status: 400 }
    );
  }

  if (!Number.isInteger(horseId) || horseId < 1 || horseId > HORSES) {
    return NextResponse.json(
      { ok: false, error: "잘못된 말 번호입니다." },
      { status: 400 }
    );
  }

  const stateRaw = await redis.get(`horse:race:${raceId}`);
  if (!stateRaw) {
    return NextResponse.json(
      { ok: false, error: "경기를 찾을 수 없습니다." },
      { status: 404 }
    );
  }

  const state = JSON.parse(stateRaw) as any;

  // 이 경기의 주인 유저 기준으로 포인트 차감
  const ctx = await getUserPointsById(state.userId);
  if (!ctx.ok) {
    return NextResponse.json(
      { ok: false, error: ctx.error },
      { status: ctx.status }
    );
  }

  const now = Date.now();
  if (now >= state.raceEndsAt) {
    return NextResponse.json(
      { ok: false, error: "이미 경기가 끝났습니다." },
      { status: 400 }
    );
  }

  const cost = getItemCost(type);
  if (ctx.points < cost) {
    return NextResponse.json(
      { ok: false, error: "포인트가 부족합니다." },
      { status: 400 }
    );
  }

  const newPoints = ctx.points - cost;
  await setUserPoints(`user:${ctx.userId}`, newPoints);

  // 효과 로그만 저장 (실제 연출은 클라에서)
  const effects = Array.isArray(state.effects) ? state.effects : [];
  effects.push({ at: now, type, horseId, cost });
  state.effects = effects;

  await redis.set(`horse:race:${raceId}`, JSON.stringify(state), { ex: 60 * 5 });

  return NextResponse.json({ ok: true, points: newPoints });
}
