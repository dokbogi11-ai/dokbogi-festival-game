"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type User = {
  studentId: string;
  name: string;
  role: "player" | "manager" | "display";
  points: number;
};

function formatPoints(n: number) {
  try {
    return new Intl.NumberFormat("ko-KR").format(n);
  } catch {
    return String(n);
  }
}

export default function PlayerPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const greeting = useMemo(() => {
    if (!user) return "";
    return `${user.name}님`;
  }, [user]);

  async function refreshMe() {
    const res = await fetch("/api/auth/me", { cache: "no-store" });
    const data = await res.json();
    setUser(data.user ?? null);
  }

  useEffect(() => {
    (async () => {
      try {
        await refreshMe();
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  if (loading) {
    return <div className="min-h-screen bg-neutral-950 text-white p-6">불러오는 중입니다…</div>;
  }

  if (!user) {
    router.push("/login");
    return null;
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 opacity-45">
        <div className="absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full bg-emerald-500 blur-[130px]" />
        <div className="absolute -bottom-48 -right-48 h-[620px] w-[620px] rounded-full bg-emerald-800 blur-[150px]" />
      </div>

      <div className="relative mx-auto w-full max-w-md px-5 pt-10 pb-10">
        {/* 상단 카드 */}
        <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-[0_12px_60px_rgba(0,0,0,0.60)] p-5">
          <div className="flex items-center justify-between">
            <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-emerald-300 via-emerald-400 to-emerald-600 shadow-[0_0_28px_rgba(34,197,94,0.30)] grid place-items-center font-black text-black">
              독
            </div>
            <button
              onClick={logout}
              className="rounded-2xl px-4 py-2 font-semibold border border-white/10 bg-white/5 active:scale-[0.99]"
            >
              로그아웃
            </button>
          </div>

          <div className="mt-4">
            <div className="text-xs text-white/60">PLAYER</div>
            <div className="mt-1 text-2xl font-black tracking-tight">{greeting}</div>
            <div className="mt-1 text-sm text-white/60">{user.studentId}</div>
          </div>

          {/* 포인트 */}
          <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 shadow-[0_0_34px_rgba(34,197,94,0.14)]">
            <div className="text-xs text-white/70">보유 포인트</div>
            <div className="mt-1 flex items-end justify-between gap-3">
              <div className="text-3xl font-black text-emerald-300">
                {formatPoints(user.points)}
              </div>
              <button
                onClick={refreshMe}
                className="rounded-xl px-3 py-2 text-sm font-semibold border border-white/10 bg-black/30"
              >
                새로고침
              </button>
            </div>
          </div>
        </div>

        {/* 게임 버튼 (모바일 터치 타겟 크게) */}
        <div className="mt-4 grid gap-4">
          <button
            onClick={() => router.push("/game/horse")}
            className="rounded-3xl border border-emerald-400/20 bg-gradient-to-br from-emerald-400/10 to-white/5 p-6 text-left backdrop-blur-xl shadow-[0_0_34px_rgba(34,197,94,0.14)] active:scale-[0.99]"
          >
            <div className="text-xs text-white/60">GAME 01</div>
            <div className="mt-1 text-2xl font-black">경마 게임</div>
            <div className="mt-2 text-sm text-white/70">배팅 후 게임을 진행하실 수 있습니다.</div>
            <div className="mt-4 text-emerald-300 font-extrabold">시작하기 →</div>
          </button>

          <button
            onClick={() => router.push("/game/tree")}
            className="rounded-3xl border border-emerald-400/20 bg-gradient-to-br from-emerald-400/10 to-white/5 p-6 text-left backdrop-blur-xl shadow-[0_0_34px_rgba(34,197,94,0.14)] active:scale-[0.99]"
          >
            <div className="text-xs text-white/60">GAME 02</div>
            <div className="mt-1 text-2xl font-black">나무 게임</div>
            <div className="mt-2 text-sm text-white/70">슬롯 결과에 따라 배당이 적용됩니다.</div>
            <div className="mt-4 text-emerald-300 font-extrabold">시작하기 →</div>
          </button>
        </div>
      </div>
    </div>
  );
}
