"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-emerald-300 via-emerald-400 to-emerald-600 shadow-[0_0_28px_rgba(34,197,94,0.30)] grid place-items-center font-black text-black">
        독
      </div>
      <div>
        <div className="text-xs text-white/60">BUGIL Academic Arts Festival</div>
        <div className="text-lg font-extrabold tracking-tight">
          <span className="text-emerald-300">독보기</span> 게임 부스
        </div>
      </div>
    </div>
  );
}

export default function SignupPage() {
  const router = useRouter();
  const [studentId, setStudentId] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(() => {
    return /^\d{5}$/.test(studentId.trim()) && name.trim().length >= 1 && password.trim().length >= 4;
  }, [studentId, name, password]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, name, password }),
      });

      const text = await res.text();
      let data: any = null;
      try { data = JSON.parse(text); } catch { data = { error: text?.slice(0, 180) || "서버 응답 파싱 실패" }; }

      if (!res.ok) {
        setMsg(data?.error ?? `회원가입 실패 (HTTP ${res.status})`);
        return;
      }

      setMsg("가입 완료. 로그인으로 이동!");
      setTimeout(() => router.push("/login"), 450);
    } catch (err: any) {
      setMsg(`네트워크/서버 오류: ${String(err?.message ?? err)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 opacity-45">
        <div className="absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full bg-emerald-500 blur-[130px]" />
        <div className="absolute -bottom-48 -right-48 h-[620px] w-[620px] rounded-full bg-emerald-800 blur-[150px]" />
      </div>

      <div className="relative mx-auto max-w-lg p-6 pt-12">
        <Logo />

        <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-[0_12px_60px_rgba(0,0,0,0.60)]">
          <div className="p-6 sm:p-8">
            <div className="flex items-end justify-between gap-3">
              <h1 className="text-2xl font-black tracking-tight">회원가입</h1>
              <div className="text-xs text-white/60">이름/학번 저장</div>
            </div>

            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <div>
                <label className="text-sm text-white/85">학번</label>
                <input
                  className="mt-2 w-full rounded-2xl bg-neutral-900/70 border border-white/10 p-4 outline-none focus:ring-2 focus:ring-emerald-400/60"
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  placeholder="10101"
                  inputMode="numeric"
                />
              </div>

              <div>
                <label className="text-sm text-white/85">이름</label>
                <input
                  className="mt-2 w-full rounded-2xl bg-neutral-900/70 border border-white/10 p-4 outline-none focus:ring-2 focus:ring-emerald-400/60"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="홍길동"
                />
              </div>

              <div>
                <label className="text-sm text-white/85">비밀번호</label>
                <input
                  className="mt-2 w-full rounded-2xl bg-neutral-900/70 border border-white/10 p-4 outline-none focus:ring-2 focus:ring-emerald-400/60"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="4자리 이상"
                  type="password"
                />
              </div>

              {msg && (
                <div className="rounded-2xl border border-white/10 bg-black/40 p-4 text-sm text-white/85">
                  {msg}
                </div>
              )}

              <button
                disabled={loading || !canSubmit}
                className="w-full rounded-2xl py-4 font-extrabold text-black
                           bg-gradient-to-r from-emerald-300 via-emerald-400 to-emerald-600
                           shadow-[0_0_34px_rgba(34,197,94,0.28)]
                           disabled:opacity-40"
              >
                {loading ? "처리 중..." : "가입하기"}
              </button>

              <button
                type="button"
                onClick={() => router.push("/login")}
                className="w-full rounded-2xl py-4 font-bold border border-white/10 bg-white/5 hover:bg-white/10"
              >
                로그인으로
              </button>
            </form>
          </div>

          <div className="px-6 pb-6 sm:px-8 sm:pb-8 text-xs text-white/55">
            * 가입하면 기본 포인트/랭킹이 자동 생성돼.
          </div>
        </div>
      </div>
    </div>
  );
}
