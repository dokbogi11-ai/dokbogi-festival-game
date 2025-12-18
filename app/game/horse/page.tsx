"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const HORSES = 5;
const RACE_SECONDS = 20; // 경기 시간 20초
const MIN_SPEED = 0.04; // 최소 속도 (트랙 비율 / 초)
const MAX_SPEED = 0.06; // 최대 속도

const MIN_BET = 100;
const MAX_BET = 10000;

type Phase = "idle" | "running" | "finished";

type ItemType = "stop3" | "slowA" | "slowB" | "back3";

type ActiveItem = {
  type: ItemType;
  until: number; // ms 기준
};

type Horse = {
  id: number;
  baseSpeed: number; // 기본 속도 (트랙 비율 / 초)
  pos: number; // 0~1
  item: ActiveItem | null;
};

type Me = {
  studentId: string;
  name: string;
  role: "player" | "manager" | "display";
  points: number;
};

const ITEM_COST = 3000;
const RANDOM_COST = 5000;

function nf(n: number) {
  try {
    return new Intl.NumberFormat("ko-KR").format(n);
  } catch {
    return String(n);
  }
}

function randRange(min: number, max: number) {
  return min + Math.random() * (max - min);
}

export default function HorseGamePage() {
  const router = useRouter();

  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const [phase, setPhase] = useState<Phase>("idle");
  const [pick, setPick] = useState(1);
  const [bet, setBet] = useState<number>(100);

  const [horses, setHorses] = useState<Horse[]>([]);
  const [winner, setWinner] = useState<number | null>(null);

  const [msg, setMsg] = useState<string | null>(null);

  const [targetHorse, setTargetHorse] = useState<number>(2);
  const [slowA, setSlowA] = useState<number>(0.5);
  const [slowB, setSlowB] = useState<number>(0.7);

  const [elapsed, setElapsed] = useState<number>(0);
  const [usedRandom, setUsedRandom] = useState(false); // 랜덤은 경기당 1번

  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const raceStartRef = useRef<number | null>(null);

  // --- 내 정보 ---
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const data = await res.json().catch(() => null);
        setMe(data?.user ?? null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function stopAnim() {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }

  // 말/상태 초기화
  function resetRace() {
    const newHorses: Horse[] = Array.from({ length: HORSES }, (_, i) => ({
      id: i + 1,
      baseSpeed: randRange(MIN_SPEED, MAX_SPEED),
      pos: 0,
      item: null,
    }));

    setHorses(newHorses);
    setWinner(null);
    setMsg(null);
    setElapsed(0);
    setUsedRandom(false);

    setSlowA(randRange(0.3, 0.6)); // 30~60%
    setSlowB(randRange(0.1, 0.4)); // 10~40%

    const defaultTarget = pick === 1 ? 2 : 1;
    setTargetHorse(defaultTarget);

    lastTimeRef.current = null;
    raceStartRef.current = null;
  }

  // 서버 포인트 정산 (경기 시작/종료 둘 다 여기로)
  async function settle(delta: number): Promise<boolean> {
    try {
      const res = await fetch("/api/game/horse/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delta }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        setMsg(data?.error ?? "포인트 정산에 실패했습니다.");
        return false;
      }

      if (typeof data.points === "number") {
        setMe((prev) => (prev ? { ...prev, points: data.points } : prev));
      }

      return true;
    } catch {
      setMsg("포인트 정산 중 오류가 발생했습니다.");
      return false;
    }
  }

  // 애니메이션
  function startAnim() {
    stopAnim();
    lastTimeRef.current = null;
    raceStartRef.current = null;

    const tick = (time: number) => {
      if (raceStartRef.current == null) {
        raceStartRef.current = time;
      }

      if (lastTimeRef.current == null) {
        lastTimeRef.current = time;
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const dtMs = time - lastTimeRef.current;
      const dt = dtMs / 1000;
      lastTimeRef.current = time;

      const totalElapsed = (time - raceStartRef.current) / 1000;
      setElapsed(totalElapsed);

      let shouldContinue = true;
      let settleDelta: number | null = null;

      setHorses((prev) => {
        let finished = false;
        let winnerId: number | null = null;

        const now = performance.now();

        let next = prev.map((h) => {
          let speed = h.baseSpeed;

          // 아이템 효과
          if (h.item && now < h.item.until) {
            const kind = h.item.type;
            if (kind === "stop3") {
              speed = 0;
            } else if (kind === "slowA") {
              speed = h.baseSpeed * slowA;
            } else if (kind === "slowB") {
              speed = h.baseSpeed * slowB;
            } else if (kind === "back3") {
              speed = -h.baseSpeed;
            }
          } else if (h.item && now >= h.item.until) {
            h = { ...h, item: null };
          }

          let pos = h.pos + speed * dt;
          if (pos < 0) pos = 0;
          if (pos >= 1) {
            pos = 1;
          }

          return { ...h, pos };
        });

        // 누가 결승선 넘었는지 + 현재 1등 찾기
        let maxPos = -1;
        next.forEach((h) => {
          if (h.pos >= 1) {
            finished = true;
          }
          if (h.pos > maxPos) {
            maxPos = h.pos;
            winnerId = h.id;
          }
        });

        // 20초가 지났는데 아무도 안 들어왔으면 1등 말 강제로 결승선까지
        if (!finished && totalElapsed >= RACE_SECONDS && winnerId != null) {
          finished = true;
          next = next.map((h) =>
            h.id === winnerId ? { ...h, pos: 1 } : h
          );
        }

        if (finished && winnerId != null) {
          shouldContinue = false;
          stopAnim();
          setWinner(winnerId);
          setPhase("finished");

          // 승리한 경우: bet*2 지급 (시작 시 bet만큼 이미 빠져 있음)
          if (winnerId === pick) {
            settleDelta = bet * 2;
          }
        }

        return next;
      });

      // 승리 정산 API 호출 (setHorses 바깥에서)
      if (settleDelta !== null) {
        void settle(settleDelta);
      }

      if (shouldContinue && totalElapsed < RACE_SECONDS) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
  }

  // 경기 시작
  async function handleStartRace() {
    if (!me) {
      router.push("/login");
      return;
    }
    if (me.role !== "player") {
      router.push(me.role === "manager" ? "/manager" : "/display");
      return;
    }

    if (bet < MIN_BET || bet > MAX_BET) {
      setMsg(`배팅 금액은 ${MIN_BET} ~ ${MAX_BET} 사이여야 합니다.`);
      return;
    }
    if (me.points < bet) {
      setMsg("포인트가 부족합니다.");
      return;
    }

    // 서버에 먼저 bet 만큼 차감 요청
    const ok = await settle(-bet);
    if (!ok) return;

    resetRace();
    setPhase("running");

    setTimeout(() => {
      startAnim();
    }, 0);
  }

  // 다시 시작
  function handleRestart() {
    resetRace();
    setPhase("idle");
  }

  // 서버 포인트 차감: 아이템
  async function spendForItem(): Promise<boolean> {
    if (!me) return false;
    if (me.points < ITEM_COST) {
      setMsg("포인트가 부족합니다.");
      return false;
    }

    const res = await fetch("/api/game/horse/item", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.ok) {
      setMsg(data?.error ?? "포인트를 사용할 수 없습니다.");
      return false;
    }

    if (typeof data.points === "number") {
      setMe((prev) => (prev ? { ...prev, points: data.points } : prev));
    }

    return true;
  }

  // 서버 포인트 차감: 랜덤 속도
  async function spendForRandom(): Promise<boolean> {
    if (!me) return false;
    if (me.points < RANDOM_COST) {
      setMsg("포인트가 부족합니다.");
      return false;
    }

    const res = await fetch("/api/game/horse/random", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.ok) {
      setMsg(data?.error ?? "포인트를 사용할 수 없습니다.");
      return false;
    }

    if (typeof data.points === "number") {
      setMe((prev) => (prev ? { ...prev, points: data.points } : prev));
    }

    return true;
  }

  // 아이템 사용 (무제한)
  async function applyItem(type: ItemType) {
    if (phase !== "running") {
      setMsg("레이스가 진행 중일 때만 사용할 수 있습니다.");
      return;
    }
    if (targetHorse === pick) {
      setMsg("내 말에는 아이템을 사용할 수 없습니다.");
      return;
    }

    const ok = await spendForItem();
    if (!ok) return;

    setHorses((prev) =>
      prev.map((h) => {
        if (h.id !== targetHorse) return h;
        const now = performance.now();
        let duration = 3000;

        // 느리게 A/B는 경기 내내 적용
        if (type === "slowA" || type === "slowB") {
          duration = RACE_SECONDS * 1000;
        }

        return {
          ...h,
          item: {
            type,
            until: now + duration,
          },
        };
      })
    );
  }

  // 랜덤 속도 재설정 (경기당 1회)
  async function rerollSpeeds() {
    if (phase !== "running") {
      setMsg("레이스가 진행 중일 때만 사용할 수 있습니다.");
      return;
    }

    if (usedRandom) {
      setMsg("이 경기에선 이미 랜덤 속도를 사용했습니다.");
      return;
    }

    const ok = await spendForRandom();
    if (!ok) return;

    setHorses((prev) =>
      prev.map((h) => ({
        ...h,
        baseSpeed: randRange(MIN_SPEED, MAX_SPEED),
      }))
    );

    setUsedRandom(true);
    setMsg("모든 말의 기본 속도가 다시 섞였습니다.");
  }

  // 아이템 사용 안함 (그냥 메시지만)
  function skipItem() {
    if (phase !== "running") {
      setMsg("레이스가 진행 중일 때만 사용할 수 있습니다.");
      return;
    }
    setMsg("이번에는 아이템을 사용하지 않았습니다.");
  }

  // 접근 제어
  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white p-6">
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
          <div className="text-xs text-white/60">경마 게임</div>
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

        {/* 트랙 + 경과 시간 */}
        <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-5">
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold text-white/85">트랙</div>
            <div className="text-xs text-white/60">
              {phase === "idle"
                ? "대기"
                : phase === "running"
                ? `진행 중 · ${elapsed.toFixed(1)}s`
                : "종료"}
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {horses.map((h) => {
              const chosen = h.id === pick;
              return (
                <div
                  key={h.id}
                  className="relative h-10 rounded-2xl bg-black/35 border border-white/10 overflow-hidden"
                >
                  <div className="absolute left-0 top-0 h-full w-14 grid place-items-center text-white/70 text-sm font-bold">
                    {h.id}번
                  </div>
                  <div className="absolute right-0 top-0 h-full w-16 grid place-items-center text-white/35 text-xs font-bold">
                    FIN
                  </div>

                  <div
                    className="absolute top-1/2 -translate-y-1/2 h-7 w-14 rounded-2xl
                               bg-gradient-to-r from-emerald-300 via-emerald-400 to-emerald-600
                               shadow-[0_0_20px_rgba(34,197,94,0.25)]
                               grid place-items-center text-black font-black"
                    style={{ left: `${14 + h.pos * 70}%` }}
                  >
                    {chosen ? "★" : "▶"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* idle: 말 선택 + 배팅 */}
        {phase === "idle" && (
          <>
            <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-5 space-y-4">
              <div>
                <div className="text-sm font-bold text-white/85">내 말 선택</div>
                <div className="mt-3 grid grid-cols-5 gap-2">
                  {Array.from({ length: HORSES }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => {
                        setPick(n);
                        setTargetHorse(n === 1 ? 2 : 1);
                      }}
                      className={[
                        "rounded-2xl py-3 font-extrabold transition border",
                        pick === n
                          ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-200"
                          : "border-white/10 bg-black/25 text-white/85",
                      ].join(" ")}
                    >
                      {n}번
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <div className="text-sm font-bold text-white/85">배팅 금액</div>
                  <div className="text-xs text-white/60">
                    {MIN_BET} ~ {MAX_BET} (승리 시 2배 지급)
                  </div>
                </div>

                <input
                  value={String(bet)}
                  onChange={(e) => {
                    const v = Math.trunc(Number(e.target.value));
                    if (!Number.isFinite(v)) {
                      setBet(MIN_BET);
                    } else {
                      const clamped = Math.max(MIN_BET, Math.min(MAX_BET, v));
                      setBet(clamped);
                    }
                  }}
                  inputMode="numeric"
                  className="mt-3 w-full rounded-2xl bg-neutral-900/70 border border-white/10 p-4 outline-none focus:ring-2 focus:ring-emerald-400/60 text-lg font-extrabold"
                />
              </div>
            </div>

            <button
              onClick={handleStartRace}
              className="w-full rounded-3xl py-5 font-extrabold text-black
                         bg-gradient-to-r from-emerald-300 via-emerald-400 to-emerald-600
                         shadow-[0_0_34px_rgba(34,197,94,0.22)]"
            >
              경기 시작
            </button>
          </>
        )}

        {/* running: 아이템 */}
        {phase === "running" && (
          <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-bold text-white/85">아이템</div>
              <div className="text-xs text-white/60">
                랜덤 속도: {usedRandom ? "사용 완료" : "사용 가능 (1회)"}
              </div>
            </div>

            <div className="grid grid-cols-[1.2fr,2fr] gap-3">
              <select
                value={targetHorse}
                onChange={(e) => setTargetHorse(Number(e.target.value))}
                className="rounded-xl bg-neutral-900/70 border border-white/10 px-3 py-2 outline-none"
              >
                {Array.from({ length: HORSES }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n} disabled={n === pick}>
                    {n}번{n === pick ? " (내 말)" : ""}
                  </option>
                ))}
              </select>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => applyItem("stop3")}
                  className="rounded-xl border border-white/10 bg-black/25 px-3 py-2"
                >
                  3초 멈추기 ({ITEM_COST}P)
                </button>
                <button
                  type="button"
                  onClick={() => applyItem("back3")}
                  className="rounded-xl border border-white/10 bg-black/25 px-3 py-2"
                >
                  3초 뒤로가기 ({ITEM_COST}P)
                </button>
                <button
                  type="button"
                  onClick={() => applyItem("slowA")}
                  className="rounded-xl border border-white/10 bg-black/25 px-3 py-2"
                >
                  속도 저하 A ({ITEM_COST}P)
                </button>
                <button
                  type="button"
                  onClick={() => applyItem("slowB")}
                  className="rounded-xl border border-white/10 bg-black/25 px-3 py-2"
                >
                  속도 저하 B ({ITEM_COST}P)
                </button>
              </div>
            </div>

            <div className="text-[11px] text-white/60">
              A 계수: {Math.round(slowA * 100)}% , B 계수:{" "}
              {Math.round(slowB * 100)}%
            </div>

            <button
              type="button"
              onClick={rerollSpeeds}
              className="w-full rounded-2xl py-3 font-extrabold border border-white/10 bg-white/5 hover:bg-white/10 text-xs"
            >
              모든 말 속도 랜덤 재설정 ({RANDOM_COST}P)
            </button>

            <button
              type="button"
              onClick={skipItem}
              className="w-full rounded-2xl py-3 font-extrabold border border-white/10 bg-black/40 hover:bg-black/60 text-xs"
            >
              아이템 사용 안함
            </button>
          </div>
        )}

        {/* finished: 결과 */}
        {phase === "finished" && (
          <>
            <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-5 text-sm text-white/85">
              {winner
                ? `${winner}번 말이 1등입니다. ${
                    winner === pick ? "(내 말 승리! 배당 2배 지급)" : ""
                  }`
                : "경기가 종료되었습니다."}
            </div>
            <button
              onClick={handleRestart}
              className="w-full rounded-3xl py-5 font-extrabold border border-white/10 bg-white/5 hover:bg-white/10"
            >
              다시 시작
            </button>
          </>
        )}

        {msg && (
          <div className="rounded-3xl border border-white/10 bg-black/40 p-5 text-sm text-white/85">
            {msg}
          </div>
        )}
      </div>
    </div>
  );
}
