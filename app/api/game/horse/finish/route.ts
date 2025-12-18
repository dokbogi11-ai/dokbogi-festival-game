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
  createdAt: number;
  raceEndsAt?: number;
  winner?: number | null;

  settled?: boolean;
  delta?: number;
  afterPoints?: number | null;
};

type UserCtx =
  | { ok: true; userId: string; userKey: string; points: number }
  | { ok: false; status: number; error: string };

// ───────── 유저 정보 + 현재 포인트 가져오기 ─────────
async function getUserContext(): Promise<UserCtx> {
  try {
    const cookieStore = cookies() as any;
    const token: string = cookieStore.get(COOKIE_NAME)?.value ?? "";

    if (!token) {
      return { ok: false, status: 401, error: "로그인이 필요합니다." };
    }

    const session: any = await (verifySession as any)(token).catch(() => null);
    if (!session) {
      return {
        ok: false,
        status: 401,
        error: "세션이 유효하지 않습니다.",
      };
    }

    const userId: string =
      session.user?.id ??
      session.user?.studentId ??
      session.studentId ??
      session.id;

    if (!userId) {
      return {
        ok: false,
        status: 401,
        error: "사용자 정보를 찾을 수 없습니다.",
      };
    }

    const userKey = `user:${userId}`;
    const rawUser = (await redis.hgetall(userKey)) as any;
    const points = Number(rawUser?.points ?? 0);

    if (!Number.isFinite(points)) {
      return {
        ok: false,
        status: 500,
        error: "포인트 정보가 잘못되었습니다.",
      };
    }

    return { ok: true, userId, userKey, points };
  } catch (err) {
    console.error("[horse/finish] getUserContext error", err);
    return {
      ok: false,
      status: 500,
      error: "사용자 정보를 불러오는 중 오류가 발생했습니다.",
    };
  }
}

// ───────── 정산 엔드포인트 ─────────
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

    // 내가 아닌 다른 사람이 정산 못 하게
    if (state.userId && state.userId !== userId) {
      return NextResponse.json(
        { ok: false, error: "자신의 경기만 정산할 수 있습니다." },
        { status: 403 }
      );
    }

    // 이미 정산된 경기면 저장된 값 그대로 돌려주기
    if (state.settled && typeof state.afterPoints === "number") {
      return NextResponse.json({
        ok: true,
        settled: true,
        winner: state.winner,
        delta: state.delta ?? 0,
        points: state.afterPoints,
      });
    }

    const bet = Number(state.bet ?? 0);
    const pick = Number(state.pick ?? 0);

    if (!Number.isFinite(bet) || bet <= 0) {
      return NextResponse.json(
        { ok: false, error: "베팅 정보가 잘못되었습니다." },
        { status: 500 }
      );
    }

    // 승자 없으면 여기서 1~HORSES 중 하나 랜덤으로 정함
    let winner = Number(state.winner ?? NaN);
    if (!Number.isFinite(winner) || winner < 1 || winner > HORSES) {
      winner = Math.floor(Math.random() * HORSES) + 1;
    }

    const win = pick === winner;

    // ✅ tree 게임과 동일한 구조:
    // newPoints = currentPoints - bet + reward
    const reward = win ? bet * 2 : 0;
    const newPoints = currentPoints - bet + reward;
    const delta = newPoints - currentPoints; // 이기면 +bet, 지면 -bet

    // 포인트 저장
    await redis.hset(userKey, { points: String(newPoints) });

    // (선택) 랭킹도 쓰고 싶으면 활성화
    await redis.zadd("ranking:points", {
      score: newPoints,
      member: userId,
    });

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
    console.error("[horse/finish] POST error", err);
    return NextResponse.json(
      { ok: false, error: "정산에 실패했습니다." },
      { status: 500 }
    );
  }
}
