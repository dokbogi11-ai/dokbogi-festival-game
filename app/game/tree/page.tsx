"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Me = {
  studentId: string;
  name: string;
  role: "player" | "manager" | "display";
  points: number;
};

type BetType = "EXACT" | "ODD" | "EVEN" | "LEFT" | "RIGHT";
type Point = { x: number; y: number };

const MIN_BET = 100;
const MAX_BET = 10000;
const SLOT_COUNT = 6;

// ───────── 피라미드(트리) 모양 설정 ─────────
// 위에서 1,2,3,4,5 개의 점 → 5줄
const ROWS = 5;

// 삼각형 크기 / 위치 조정용 상수
const PEG_STEP_X = 13; // 가로 간격 (%). 숫자 올리면 더 넓어짐
const TOP_Y = 8;       // 위쪽 시작 위치 (%)
const BOTTOM_Y = 78;   // 아래쪽 끝 위치 (%)

// row: 0~ROWS-1, col: 0~row
function pegX(row: number, col: number) {
  const width = row * PEG_STEP_X;
  const start = 50 - width / 2;
  return start + col * PEG_STEP_X;
}

function pegY(row: number) {
  if (ROWS <= 1) return (TOP_Y + BOTTOM_Y) / 2;
  const step = (BOTTOM_Y - TOP_Y) / (ROWS - 1);
  return TOP_Y + row * step;
}

// 슬롯 X좌표: 숫자 버튼(1~6) 중앙과 정확히 맞추기
// slotIndex: 0~5 → 화면에선 1~6
function slotX(slotIndex: number) {
  const colWidth = 100 / SLOT_COUNT;         // 전체 100%를 6등분
  return colWidth * (slotIndex + 0.5);       // 각 칸 중앙
}

// 최종 슬롯에 맞춰 떨어지는 경로 생성
function generatePath(finalSlot: number): Point[] {
  const path: Point[] = [];

  // 0~(ROWS-1) 동안 "오른쪽으로 가는 횟수"를 적당히 섞어서 만듦
  const rightsTotal = Math.max(0, Math.min(ROWS, finalSlot - 1));
  let rightsRemaining = rightsTotal;
  let col = 0;

  // 시작점 (위쪽 중앙)
  path.push({ x: 50, y: 4 });

  for (let row = 0; row < ROWS; row++) {
    const rowsLeft = ROWS - row;
    let goRight = false;

    if (rightsRemaining <= 0) {
      goRight = false;
    } else if (rightsRemaining >= rowsLeft) {
      goRight = true;
    } else {
      goRight = Math.random() < 0.5;
    }

    if (goRight && col < row) {
      col += 1;
      rightsRemaining -= 1;
    }

    const x = pegX(row, col);
    const y = pegY(row);
    path.push({ x, y });
  }

  const slotIndex = finalSlot - 1;
  const sx = slotX(slotIndex);

  // peg 줄 아래로 조금 더 떨어뜨려서 슬롯 쪽으로
  path.push({ x: sx, y: 84 });
  path.push({ x: sx, y: 92 });

  return path;
}

function nf(n: number) {
  try {
    return new Intl.NumberFormat("ko-KR").format(n);
  } catch {
    return String(n);
  }
}

export default function TreeGamePage() {
  const router = useRouter();

  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const [betType, setBetType] = useState<BetType>("EXACT");
  const [betSlot, setBetSlot] = useState<number>(1);
  const [betAmount, setBetAmount] = useState<number>(1000);

  const [msg, setMsg] = useState<string | null>(null);
  const [isRolling, setIsRolling] = useState(false);
  const [ballPos, setBallPos] = useState<Point | null>(null);

  const [lastSlot, setLastSlot] = useState<number | null>(null);
  const [lastDelta, setLastDelta] = useState<number | null>(null);

  async function refreshMe() {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      const data = await res.json();
      setMe(data.user ?? null);
    } catch {
      // 무시
    }
  }

  useEffect(() => {
    (async () => {
      try {
        await refreshMe();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const canStart = useMemo(() => {
    if (!me) return false;
    if (me.role !== "player") return false;
    if (isRolling) return false;
    if (!Number.isFinite(betAmount)) return false;
    if (betAmount < MIN_BET || betAmount > MAX_BET) return false;
    if (me.points < betAmount) return false;
    if (betType === "EXACT" && (betSlot < 1 || betSlot > SLOT_COUNT)) return false;
    return true;
  }, [me, isRolling, betAmount, betType, betSlot]);

  function clampBet(v: unknown) {
    const n = Math.trunc(Number(v));
    if (!Number.isFinite(n)) return MIN_BET;
    return Math.max(MIN_BET, Math.min(MAX_BET, n));
  }

  function applyResult(finalSlot: number, win: boolean, delta: number, serverPoints?: number) {
    setIsRolling(false);
    setLastSlot(finalSlot);
    setLastDelta(delta);

    if (Number.isFinite(serverPoints ?? NaN)) {
      setMe((prev) => (prev ? { ...prev, points: serverPoints as number } : prev));
    } else if (me) {
      setMe({ ...me, points: me.points + delta });
    } else {
      refreshMe();
    }

    if (win) {
      setMsg(`${finalSlot}번에 적중! (${delta >= 0 ? "+" : ""}${nf(delta)}P)`);
    } else {
      setMsg(`${finalSlot}번으로 떨어졌습니다. (${delta >= 0 ? "+" : ""}${nf(delta)}P)`);
    }
  }

  // requestAnimationFrame을 이용한 부드러운 낙하 애니메이션
  function animatePath(path: Point[], onEnd: () => void) {
    if (path.length < 2) {
      onEnd();
      return;
    }

    let segIndex = 0;
    const SEG_MS = 130; // 한 구간 이동 시간

    const runSegment = () => {
      const start = path[segIndex];
      const end = path[segIndex + 1];
      const startTime = performance.now();

      const frame = (now: number) => {
        const t = Math.min(1, (now - startTime) / SEG_MS);
        const x = start.x + (end.x - start.x) * t;
        const y = start.y + (end.y - start.y) * t;
        setBallPos({ x, y });

        if (t < 1) {
          requestAnimationFrame(frame);
        } else {
          segIndex += 1;
          if (segIndex < path.length - 1) {
            runSegment();
          } else {
            onEnd();
          }
        }
      };

      requestAnimationFrame(frame);
    };

    setBallPos(path[0]);
    runSegment();
  }

  async function handleStart() {
    if (!canStart) return;

    setMsg(null);
    setIsRolling(true);

    const payload: any = { betType, amount: betAmount };
    if (betType === "EXACT") payload.betSlot = betSlot;

    try {
      const res = await fetch("/api/game/tree/round", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }

      if (!res.ok || !data?.ok) {
        console.error("tree round error:", res.status, data);
        setIsRolling(false);
        setMsg(data?.error ?? `게임을 시작할 수 없습니다. (코드 ${res.status})`);
        return;
      }

      const finalSlot: number = data.finalSlot;
      const win: boolean = !!data.win;
      const delta: number = Number(data.delta ?? 0);
      const serverPoints: number | undefined = Number.isFinite(data.points)
        ? Number(data.points)
        : undefined;

      const path = generatePath(finalSlot);

      animatePath(path, () => {
        applyResult(finalSlot, win, delta, serverPoints);
      });
    } catch (e) {
      console.error(e);
      setIsRolling(false);
      setMsg("서버와 통신에 실패했습니다.");
    }
  }

  // ───────── 접근 제어 ─────────
  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center">
        불러오는 중입니다…
      </div>
    );
  }

  if (!me) {
    router.push("/login");
    return null;
  }

  if (me.role !== "player") {
    router.push(me.role === "manager" ? "/manager" : "/display");
    return null;
  }

  // ───────── UI ─────────
  return (
    <div className="min-h-screen bg-neutral-950 text-white relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 opacity-45">
        <div className="absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full bg-emerald-500 blur-[130px]" />
        <div className="absolute -bottom-48 -right-48 h-[620px] w-[620px] rounded-full bg-emerald-800 blur-[150px]" />
      </div>

      <div className="relative mx-auto w-full max-w-md px-5 pt-8 pb-10 space-y-4">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.push("/player")}
            className="rounded-2xl px-4 py-2 font-semibold border border-white/10 bg-white/5"
          >
            뒤로
          </button>
          <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-emerald-300 via-emerald-400 to-emerald-600 shadow-[0_0_28px_rgba(34,197,94,0.30)] grid place-items-center font-black text-black">
            독
          </div>
        </div>

        {/* 내 정보 */}
        <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-5">
          <div className="text-xs text-white/60">나무 게임</div>
          <div className="mt-1 text-xl font-black tracking-tight">{me.name}님</div>

          <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4">
            <div className="text-xs text-white/70">보유 포인트</div>
            <div className="mt-1 text-3xl font-black text-emerald-300">{nf(me.points)}</div>
          </div>
        </div>

        {/* 피라미드 + 슬롯 */}
        <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-bold text-white/85">피라미드</div>
            {lastSlot && (
              <div className="text-xs text-white/60">
                최근: {lastSlot}번{" "}
                {lastDelta !== null && `(${lastDelta >= 0 ? "+" : ""}${nf(lastDelta)}P)`}
              </div>
            )}
          </div>

          <div className="relative w-full h-72 rounded-2xl bg-black/40 border border-white/10 overflow-hidden">
            {/* 점들 (트리 모양) */}
            {Array.from({ length: ROWS }).map((_, row) =>
              Array.from({ length: row + 1 }).map((__, col) => {
                const x = pegX(row, col);
                const y = pegY(row);
                return (
                  <div
                    key={`${row}-${col}`}
                    className="absolute w-1.5 h-1.5 rounded-full bg-neutral-400"
                    style={{
                      left: `${x}%`,
                      top: `${y}%`,
                      transform: "translate(-50%, -50%)",
                    }}
                  />
                );
              })
            )}

            {/* 공 */}
            {ballPos && (
              <div
                className="absolute w-3 h-3 rounded-full bg-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.9)]"
                style={{
                  left: `${ballPos.x}%`,
                  top: `${ballPos.y}%`,
                  transform: "translate(-50%, -50%)",
                }}
              />
            )}
          </div>

          {/* 슬롯 버튼 (1~6) */}
          <div className="mt-4 grid grid-cols-6 gap-2">
            {Array.from({ length: SLOT_COUNT }, (_, i) => {
              const n = i + 1;
              const selected = betType === "EXACT" && betSlot === n;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => {
                    if (betType === "EXACT") setBetSlot(n);
                  }}
                  className={[
                    "rounded-2xl py-2 text-sm font-extrabold border",
                    betType === "EXACT"
                      ? selected
                        ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-200"
                        : "border-white/10 bg-black/40 text-white/80"
                      : "border-white/10 bg-black/40 text-white/60",
                  ].join(" ")}
                >
                  {n}
                </button>
              );
            })}
          </div>
        </div>

        {/* 베팅 설정 */}
        <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold text-white/85">베팅</div>
            <div className="text-xs text-white/60">
              {MIN_BET} ~ {MAX_BET}P
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs">
            <button
              type="button"
              onClick={() => setBetType("EXACT")}
              className={[
                "rounded-2xl px-3 py-2 border font-semibold",
                betType === "EXACT"
                  ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-200"
                  : "border-white/10 bg-black/30 text-white/70",
              ].join(" ")}
            >
              정확 번호 (×2.0)
            </button>
            <button
              type="button"
              onClick={() => setBetType("ODD")}
              className={[
                "rounded-2xl px-3 py-2 border font-semibold",
                betType === "ODD"
                  ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-200"
                  : "border-white/10 bg-black/30 text-white/70",
              ].join(" ")}
            >
              홀수 (×1.5)
            </button>
            <button
              type="button"
              onClick={() => setBetType("EVEN")}
              className={[
                "rounded-2xl px-3 py-2 border font-semibold",
                betType === "EVEN"
                  ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-200"
                  : "border-white/10 bg-black/30 text-white/70",
              ].join(" ")}
            >
              짝수 (×1.5)
            </button>
            <button
              type="button"
              onClick={() => setBetType("LEFT")}
              className={[
                "rounded-2xl px-3 py-2 border font-semibold",
                betType === "LEFT"
                  ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-200"
                  : "border-white/10 bg-black/30 text-white/70",
              ].join(" ")}
            >
              1~3 (×1.5)
            </button>
            <button
              type="button"
              onClick={() => setBetType("RIGHT")}
              className={[
                "rounded-2xl px-3 py-2 border font-semibold",
                betType === "RIGHT"
                  ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-200"
                  : "border-white/10 bg-black/30 text-white/70",
              ].join(" ")}
            >
              4~6 (×1.5)
            </button>
          </div>

          <div>
            <div className="text-xs text-white/60 mb-1">베팅 금액</div>
            <input
              value={String(betAmount)}
              onChange={(e) => setBetAmount(clampBet(e.target.value))}
              inputMode="numeric"
              className="w-full rounded-2xl bg-neutral-900/70 border border-white/10 p-3 outline-none focus:ring-2 focus:ring-emerald-400/60 text-lg font-extrabold"
            />
          </div>

          <button
            onClick={handleStart}
            disabled={!canStart}
            className="mt-1 w-full rounded-3xl py-4 font-extrabold text-black
                       bg-gradient-to-r from-emerald-300 via-emerald-400 to-emerald-600
                       shadow-[0_0_34px_rgba(34,197,94,0.22)]
                       disabled:opacity-40"
          >
            {isRolling ? "게임 진행 중…" : "게임 시작"}
          </button>
        </div>

        {msg && (
          <div className="rounded-3xl border border-white/10 bg-black/40 p-5 text-sm text-white/85">
            {msg}
          </div>
        )}
      </div>
    </div>
  );
}
