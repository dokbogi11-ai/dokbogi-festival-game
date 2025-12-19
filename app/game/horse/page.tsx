"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Me = {
  studentId: string;
  name: string;
  role: "player" | "manager" | "display";
  points: number;
};

type Phase = "idle" | "running" | "slowing" | "result";
type Color = "red" | "orange" | "yellow" | "green";

const MIN_BET = 100;
const MAX_BET = 10000;

// 왼→오 색 띠
const STRIP: Color[] = [
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
];

function nf(n: number) {
  try {
    return new Intl.NumberFormat("ko-KR").format(n);
  } catch {
    return String(n);
  }
}

function colorClass(c: Color) {
  switch (c) {
    case "red":
      return "bg-red-500";
    case "orange":
      return "bg-orange-400";
    case "yellow":
      return "bg-yellow-300";
    case "green":
      return "bg-emerald-400";
  }
}

/**
 * 서버에 delta, studentId 보내서 포인트 정산
 * → /api/game/horse/settle
 */
async function settleOnServer(studentId: string, delta: number): Promise<number | null> {
  try {
    const res = await fetch("/api/game/horse/settle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId, delta }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.ok || typeof data.points !== "number") {
      console.error("[horse/settle] error", res.status, data);
      return null;
    }

    return data.points as number;
  } catch (e) {
    console.error("[horse/settle] error", e);
    return null;
  }
}

export default function ColorGamePage() {
  const router = useRouter();

  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const [phaseState, setPhaseState] = useState<Phase>("idle");
  const phaseRef = useRef<Phase>("idle");
  const phase: Phase = phaseState;
  const setPhase = (p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  };

  const [betAmount, setBetAmount] = useState<number>(MIN_BET);
  const [betInput, setBetInput] = useState<string>(String(MIN_BET));

  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const currentIndexRef = useRef<number>(0);

  const [lastColor, setLastColor] = useState<Color | null>(null);
  const [lastDelta, setLastDelta] = useState<number | null>(null);

  const [msg, setMsg] = useState<string | null>(null);

  // 애니메이션 관련 ref
  const spinTimerRef = useRef<number | null>(null);
  const speedRef = useRef<number>(50); // 딜레이(ms) → 작을수록 빠름
  const directionRef = useRef<1 | -1>(1); // 1: 왼→오, -1: 오→왼

  // 감속 단계 관련
  const slowStepsRef = useRef<number>(0);
  const maxSlowStepsRef = useRef<number>(0);

  // ───────── 유저 정보 ─────────
  async function refreshMe() {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      setMe(data?.user ?? null);
    } catch {
      // ignore
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

    return () => {
      if (spinTimerRef.current !== null) {
        clearTimeout(spinTimerRef.current);
      }
    };
  }, []);

  // 베팅 인풋 보정 (blur 시)
  function normalizeBet() {
    let v = parseInt(betInput.replace(/[^\d]/g, ""), 10);
    if (isNaN(v)) v = MIN_BET;
    if (v < MIN_BET) v = MIN_BET;
    if (v > MAX_BET) v = MAX_BET;
    setBetAmount(v);
    setBetInput(String(v));
    return v;
  }

  const canStart = useMemo(() => {
    if (!me) return false;
    if (me.role !== "player") return false;
    if (phase === "running" || phase === "slowing") return false;
    if (!Number.isFinite(betAmount)) return false;
    if (betAmount < MIN_BET || betAmount > MAX_BET) return false;
    if (me.points < betAmount) return false;
    return true;
  }, [me, betAmount, phase]);

  function clearSpinTimer() {
    if (spinTimerRef.current !== null) {
      clearTimeout(spinTimerRef.current);
      spinTimerRef.current = null;
    }
  }

  // 인덱스 한 칸 이동 (양 끝에서 튕김)
  function stepIndex(): number {
    const last = STRIP.length - 1;
    let nextIdx = 0;

    setCurrentIndex((prev) => {
      let idx = prev + directionRef.current;

      if (idx < 0) {
        idx = 1;
        directionRef.current = 1;
      } else if (idx > last) {
        idx = last - 1;
        directionRef.current = -1;
      }

      nextIdx = idx;
      currentIndexRef.current = idx;
      return idx;
    });

    return nextIdx;
  }

  // ───────── 애니메이션 루프 ─────────
  function startSpinLoop() {
    clearSpinTimer();
    speedRef.current = 50; // 시작은 빠르게
    directionRef.current = 1;
    slowStepsRef.current = 0;

    const tick = () => {
      const phaseNow = phaseRef.current;

      // 한 칸 이동 후 인덱스
      const idx = stepIndex();

      if (phaseNow === "slowing") {
        slowStepsRef.current += 1;

        // STOP 이후: 빠르게 느려지게
        if (speedRef.current < 420) {
          speedRef.current += 35;
        }

        // 감속이 충분하면 지금 위치에서 바로 정지 + 정산
        const canStop =
          slowStepsRef.current >= maxSlowStepsRef.current &&
          speedRef.current >= 260;

        if (canStop) {
          clearSpinTimer();

          const idxNow = currentIndexRef.current;
          const color = STRIP[idxNow]; // 화살표가 가리키는 색 그대로

          if (!me) {
            setPhase("result");
            return;
          }

          const bet = betAmount;
          let delta = 0;

          // delta = "순이익"
          if (color === "red") {
            delta = -bet; // 전부 잃음
          } else if (color === "orange") {
            delta = 0; // 원금
          } else if (color === "yellow") {
            delta = Math.floor(bet * 0.5); // 1.5배 → 순이익 0.5배
          } else if (color === "green") {
            delta = bet; // 2배 → 순이익 1배
          }

          setLastColor(color);
          setLastDelta(delta);

          // 클라 포인트 즉시 반영
          setMe((prev) =>
            prev ? { ...prev, points: prev.points + delta } : prev
          );

          // 서버 정산 (Upstash에 반영)
          void (async () => {
            const newPoints = await settleOnServer(me.studentId, delta);
            if (typeof newPoints === "number") {
              setMe((prev) =>
                prev ? { ...prev, points: newPoints } : prev
              );
            }
          })();

          let colorName = "";
          if (color === "red") colorName = "빨간색 (전부 잃음)";
          else if (color === "orange") colorName = "주황색 (원금 회수)";
          else if (color === "yellow") colorName = "노란색 (1.5배)";
          else if (color === "green") colorName = "초록색 (2배)";

          const sign = delta >= 0 ? "+" : "";
          setMsg(`${colorName}에 멈췄습니다. (${sign}${nf(delta)}P)`);

          setPhase("result");
          return;
        }
      } else {
        // running 동안은 빠른 속도 유지
        speedRef.current = 50;
      }

      // 계속 진행
      spinTimerRef.current = window.setTimeout(tick, speedRef.current);
    };

    spinTimerRef.current = window.setTimeout(tick, speedRef.current);
  }

  // ───────── 게임 시작 ─────────
  async function handleStart() {
    if (!me) {
      router.push("/login");
      return;
    }
    if (me.role !== "player") {
      router.push(me.role === "manager" ? "/manager" : "/display");
      return;
    }

    const normalized = normalizeBet();
    if (normalized < MIN_BET || normalized > MAX_BET) {
      setMsg(`베팅 금액은 ${MIN_BET} ~ ${MAX_BET} 사이여야 합니다.`);
      return;
    }
    if (me.points < normalized) {
      setMsg("포인트가 부족합니다.");
      return;
    }

    setMsg(null);
    setLastColor(null);
    setLastDelta(null);

    // 시작 위치 리셋
    currentIndexRef.current = 0;
    setCurrentIndex(0);

    setPhase("running");
    startSpinLoop();
  }

  // ───────── STOP: 감속 시작 ─────────
  async function handleStop() {
    if (phaseRef.current !== "running") return;
    if (!me) return;

    const bet = normalizeBet();
    if (me.points < bet) {
      setMsg("포인트가 부족합니다.");
      return;
    }

    // 최소 이동 횟수 = 한 바퀴 + 랜덤(0~한 바퀴)
    const base = STRIP.length;
    const extra = Math.floor(Math.random() * STRIP.length);
    maxSlowStepsRef.current = base + extra;

    slowStepsRef.current = 0;
    speedRef.current = 80; // STOP 직후 살짝 느려진 상태

    setPhase("slowing");
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

  const isSpinning = phase === "running" || phase === "slowing";

  // ───────── UI ─────────
  return (
    <div className="min-h-screen bg-neutral-950 text-white relative overflow-hidden">
      {/* 배경 */}
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
          <div className="text-xs text-white/60">색 띠 룰렛 게임</div>
          <div className="mt-1 text-xl font-black tracking-tight">
            {me.name}님
          </div>

          <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4">
            <div className="text-xs text-white/70">보유 포인트</div>
            <div className="mt-1 text-3xl font-black text-emerald-300">
              {nf(me.points)}
            </div>
          </div>
        </div>

        {/* 색 띠 + 화살표 */}
        <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-5 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-bold text-white/85">색 띠</div>
            {lastColor !== null && lastDelta !== null && (
              <div className="text-xs text-white/60">
                최근: {lastColor},{" "}
                {lastDelta >= 0 ? "+" : ""}
                {nf(lastDelta)}P
              </div>
            )}
          </div>

          <div className="space-y-3">
            {/* 화살표 줄 */}
            <div className="flex items-end gap-1">
              {STRIP.map((_, idx) => (
                <div key={idx} className="flex-1 flex justify-center">
                  <div
                    className={[
                      "w-0 h-0 border-l-4 border-r-4 border-b-6 border-b-white",
                      idx === currentIndex ? "opacity-100" : "opacity-0",
                    ].join(" ")}
                  />
                </div>
              ))}
            </div>

            {/* 색 띠 줄 */}
            <div className="flex gap-1">
              {STRIP.map((c, idx) => (
                <div
                  key={idx}
                  className={[
                    "flex-1 h-6 rounded-md",
                    colorClass(c),
                    idx === currentIndex
                      ? "ring-2 ring-white shadow-[0_0_14px_rgba(255,255,255,0.6)]"
                      : "opacity-70",
                  ].join(" ")}
                />
              ))}
            </div>

            <div className="text-[11px] text-white/60 mt-1">
              빨간: 전부 잃음 / 주황: 원금 회수 / 노랑: 1.5배 / 초록: 2배
            </div>
          </div>
        </div>

        {/* 베팅 + 버튼 */}
        <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold text-white/85">베팅 금액</div>
            <div className="text-xs text-white/60">
              {MIN_BET} ~ {MAX_BET}P
            </div>
          </div>

          <input
            value={betInput}
            onChange={(e) => setBetInput(e.target.value)}
            onBlur={normalizeBet}
            inputMode="numeric"
            className="mt-2 w-full rounded-2xl bg-neutral-900/70 border border-white/10 p-4 outline-none focus:ring-2 focus:ring-emerald-400/60 text-lg font-extrabold"
          />

          {!isSpinning ? (
            <button
              onClick={handleStart}
              disabled={!canStart}
              className="mt-1 w-full rounded-3xl py-4 font-extrabold text-black
                         bg-gradient-to-r from-emerald-300 via-emerald-400 to-emerald-600
                         shadow-[0_0_34px_rgba(34,197,94,0.22)]
                         disabled:opacity-40"
            >
              게임 시작
            </button>
          ) : (
            <button
              onClick={handleStop}
              className="mt-1 w-full rounded-3xl py-4 font-extrabold
                         border border-red-400/60 bg-red-500/90 text-white
                         shadow-[0_0_30px_rgba(248,113,113,0.5)]"
            >
              STOP
            </button>
          )}
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
