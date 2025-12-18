// app/api/game/horse/finish/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { redis } from "@/lib/redis";
import { verifySession, COOKIE_NAME } from "@/lib/auth";

const HORSES = 5;

type RaceState = {
  raceId: string;
  userId?: string;
  pick: number;        // 내가 고른 말 번호
  bet: number;         // 베팅 금액
  raceEndsAt: number;  // 경주 종료 시각(ms)
  winner?: number | null;

  // 정산 후 채워지는 값들
  settled?: boolean;
  delta?: number;
  afterPoints?: number | null;
};

type UserCtx =
  | { ok: true; userId: string; userKey: string; points: number }
  | { ok: false; error: string; status: number };

// ───────────────── 유저 컨텍스트 ─────────────────

async function getUserContext(): Promise<UserCtx> {
  const cookieStore = cookies() as any;
  const cookie = cookieStore.get(COOKIE_NAME) as any;
  const token: string = cookie?.value ?? "";

  if (!token) {
    return { ok: false, error: "로그인이 필요합니다.", status: 401 };
  }

  const session: any = await (verifySession as any)(token).catch(() => null);
  if (!session) {
    return { ok: false, error: "세션이 유효하지 않습니다.", status: 401 };
  }

  const userId: string =
    session.user?.id ??
    session.user?.studentId ??
    session.studentId ??
    session.id;

  if (!userId) {
    return {
      ok: false,
      error: "사용자 정보를 찾을 수 없습니다.",
      status: 401,
    };
  }

  const userKey = `user:${userId}`;
  const rawUser = (await redis.hgetall(userKey)) as any;
  const points = Number(rawUser?.points ?? 0);

  if (!Number.isFinite(points)) {
    return {
      ok: false,
      error: "포인트 정보가 잘못되었습니다.",
      status: 500,
    };
  }

  return { ok: true, userId, userKey, points };
}

// ───────────────── 정산 엔드포인트 ─────────────────

export async function POST(req: Request) {
  try {
    const ctx = await getUserContext();

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

    const raceKey = `horse:race:${raceId}`;

    // redis.get 결과를 any로 받고, JSON.parse 전에 안전 처리
    const raw: any = await redis.get(raceKey);

    if (!raw) {
      return NextResponse.json(
        { ok: false, error: "경기를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // ✅ 타입스크립트가 뭐라고 하든, 여기서는 string으로 강제 변환
    const state = (typeof raw === "string"
      ? JSON.parse(raw)
      : JSON.parse(String(raw))) as RaceState;

    // 경기 주인 확인 (있으면)
    if (state.userId && state.userId !== userId) {
      return NextResponse.json(
        { ok: false, error: "자신의 경기만 정산할 수 있습니다." },
        { status: 403 }
      );
    }

    const now = Date.now();

    // 아직 안 끝났으면 정산 불가
    if (now < state.raceEndsAt) {
      return NextResponse.json(
        { ok: false, error: "경기가 아직 종료되지 않았습니다." },
        { status: 400 }
      );
    }

    // 이미 정산된 경기라면 저장된 값 그대로 반환
    if (state.settled && typeof state.afterPoints === "number") {
      return NextResponse.json({
        ok: true,
        settled: true,
        winner: state.winner,
        delta: state.delta ?? 0,
        points: state.afterPoints,
      });
    }

    // ── 승패 및 배당 계산 ──
    const bet = Number(state.bet ?? 0);
    const pick = Number(state.pick ?? 0);

    let winner = Number(state.winner ?? NaN);
    if (!Number.isFinite(winner) || winner < 1 || winner > HORSES) {
      winner = Math.floor(Math.random() * HORSES) + 1; // 1~5
    }

    const win = pick === winner;
    const delta = win ? bet : -bet;
    const newPoints = currentPoints + delta;

    // 포인트 / 경기 상태 저장
    await redis.hset(userKey, { points: String(newPoints) });

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
