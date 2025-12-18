// app/api/game/horse/finish/route.ts
import { NextResponse } from "next/server";
import redis from "@/lib/redis";
// 상대 경로: app/api/game/horse/finish → (../../../../../) → lib/gamePoints
import {
  getUserPointsCtx,
  setUserPoints,
} from "../../../../../lib/gamePoints";

type RaceState = {
  raceId: string;
  userId?: string;
  pick: number;
  bet: number;
  raceEndsAt: number;
  winner?: number | null;

  settled?: boolean;
  delta?: number;
  afterPoints?: number | null;
};

const HORSES = 5;

export async function POST(req: Request) {
  try {
    // ───── 유저 / 포인트 읽기 ─────
    const ctx = await getUserPointsCtx();
    if (!ctx.ok) {
      return NextResponse.json(
        { ok: false, error: ctx.error },
        { status: ctx.status }
      );
    }

    const { userId, userKey, points: currentPoints } = ctx;

    const body: any = await req.json().catch(() => null);
    const raceId = String(body?.raceId ?? "");

    if (!raceId) {
      return NextResponse.json(
        { ok: false, error: "raceId가 필요합니다." },
        { status: 400 }
      );
    }

    const raceKey = `horse:race:${raceId}`; // start/action과 prefix 일치해야 함
    const raw = (await redis.get(raceKey)) as string | null;

    if (!raw) {
      return NextResponse.json(
        { ok: false, error: "경기를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const state = JSON.parse(raw) as RaceState;

    // 다른 사람이 만든 경기 정산 방지
    if (state.userId && state.userId !== userId) {
      return NextResponse.json(
        { ok: false, error: "자신의 경기만 정산할 수 있습니다." },
        { status: 403 }
      );
    }

    const now = Date.now();

    // 아직 끝나지 않았으면 정산 불가
    if (now < state.raceEndsAt) {
      return NextResponse.json(
        { ok: false, error: "경기가 아직 종료되지 않았습니다." },
        { status: 400 }
      );
    }

    // 이미 정산된 경기면 저장된 값 그대로 반환
    if (state.settled && typeof state.afterPoints === "number") {
      return NextResponse.json({
        ok: true,
        settled: true,
        winner: state.winner,
        delta: state.delta ?? 0,
        points: state.afterPoints,
      });
    }

    // ───── 승자 / 배당 계산 ─────
    let winner = Number(state.winner ?? NaN);
    if (!Number.isFinite(winner) || winner < 1 || winner > HORSES) {
      winner = Math.floor(Math.random() * HORSES) + 1;
    }

    const bet = Number(state.bet ?? 0);
    const pick = Number(state.pick ?? 0);

    const win = pick === winner;
    // 배당 2배: 이기면 +bet, 지면 -bet
    const delta = win ? bet : -bet;
    const newPoints = currentPoints + delta;

    // ───── 실제 포인트 DB 반영 ─────
    await setUserPoints(userKey, newPoints);

    // 레이스 상태에도 정산 정보 저장
    const newState: RaceState = {
      ...state,
      winner,
      settled: true,
      delta,
      afterPoints: newPoints,
    };

    await redis.set(raceKey, JSON.stringify(newState), { ex: 60 * 10 });

    return NextResponse.json({
      ok: true,
      settled: true,
      win,
      winner,
      delta,
      points: newPoints,
    });
  } catch (err) {
    console.error("[horse/finish] error", err);
    return NextResponse.json(
      { ok: false, error: "정산에 실패했습니다." },
      { status: 500 }
    );
  }
}
