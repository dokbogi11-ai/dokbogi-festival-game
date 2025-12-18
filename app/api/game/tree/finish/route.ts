// app/api/game/horse/finish/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { redis } from "@/lib/redis";
import { verifySession, COOKIE_NAME } from "@/lib/auth";

const HORSES = 5;

// 레이스 상태
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

// tree/finish와 거의 동일한 유저 컨텍스트
type UserCtx =
  | { ok: true; userId: string; userKey: string; points: number }
  | { ok: false; error: string; status: number };

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
    const raw = (await redis.get(raceKey)) as string | null;

    if (!raw) {
      return NextResponse.json(
        { ok: false, error: "경기를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const state = JSON.parse(raw) as RaceState;

    // 경기 주인 확인
    if (state.userId && state.userId !== userId) {
      return NextResponse.json(
        { ok: false, error: "자신의 경기만 정산할 수 있습니다." },
        { status: 403 }
      );
    }

    // 이미 정산된 경우
    if (state.settled && typeof state.afterPoints === "number") {
      return NextResponse.json({
        ok: true,
        settled: true,
        winner: state.winner,
        delta: state.delta ?? 0,
        points: state.afterPoints,
      });
    }

    const now = Date.now();

    // (원하면 여기에서 raceEndsAt 체크 가능: now < state.raceEndsAt → 아직 종료 안 됨)
    // 지금은 프론트에서 20초 애니메이션 끝난 뒤에만 호출하니까 굳이 막진 않아도 됨.

    const bet = Number(state.bet ?? 0);
    const pick = Number(state.pick ?? 0);

    // winner가 없으면 랜덤으로 하나 뽑음
    let winner = Number(state.winner ?? NaN);
    if (!Number.isFinite(winner) || winner < 1 || winner > HORSES) {
      winner = Math.floor(Math.random() * HORSES) + 1; // 1~HORSES
    }

    const win = pick === winner;

    // tree와 동일한 패턴:
    //   newPoints = currentPoints - bet + (win ? bet * 2 : 0)
    //   → 이기면 P + bet, 지면 P - bet
    const reward = win ? bet * 2 : 0;
    const newPoints = currentPoints - bet + reward;
    const delta = newPoints - currentPoints;

    // 포인트 저장
    await redis.hset(userKey, { points: String(newPoints) });

    // 레이스 상태도 업데이트 (10분 정도 뒤에 사라지게 해도 됨)
    const newState: RaceState = {
      ...state,
      winner,
      settled: true,
      delta,
      afterPoints: newPoints,
    };

    await redis.set(raceKey, JSON.stringify(newState) as any);

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
