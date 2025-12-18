"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import RoleSegment from "./RoleSegment";


type Role = "player" | "manager" | "display";

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-emerald-300 via-emerald-400 to-emerald-600 shadow-[0_0_28px_rgba(34,197,94,0.30)] grid place-items-center font-black text-black">
        독
      </div>
      <div>
        <div className="text-xs text-white/60">BUGIL Academic Arts Festival</div>
        <div className="text-lg font-extrabold tracking-tight">
          <span className="text-emerald-300">독보기</span> 로그인 페이지
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [role, setRole] = useState<Role>("player");
  const [studentId, setStudentId] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(() => {
    const id = studentId.trim();
    const pwOk = password.trim().length >= 1;

    const idOk =
      role === "player"
        ? /^\d{5}$/.test(id) // 학생은 5자리 학번만 허용
        : id.length >= 3; // 관리자/디스플레이는 문자열 아이디 허용(dokbogi, display)

    return idOk && pwOk;
  }, [studentId, password, role]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, password, role }),
      });

      const text = await res.text();
      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch {
        data = { error: text?.slice(0, 180) || "서버 응답을 처리할 수 없습니다." };
      }

      if (!res.ok) {
        setMsg(data?.error ?? `로그인에 실패했습니다. (HTTP ${res.status})`);
        return;
      }

      if (data.role === "manager") router.push("/manager");
      else if (data.role === "display") router.push("/display");
      else router.push("/player");
    } catch (err: any) {
      setMsg(`접속 중 오류가 발생했습니다: ${String(err?.message ?? err)}`);
    } finally {
      setLoading(false);
    }
  }

  const idLabel = role === "player" ? "학번" : "ID";
  const idPlaceholder = role === "player" ? "10101" : "관리자 계정 입력";
  const idInputMode = role === "player" ? "numeric" : "text";

  return (
    <div className="min-h-screen bg-neutral-950 text-white relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 opacity-45">
        <div className="absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full bg-emerald-500 blur-[130px]" />
        <div className="absolute -bottom-48 -right-48 h-[620px] w-[620px] rounded-full bg-emerald-700 blur-[150px]" />
      </div>

      <div className="relative mx-auto max-w-lg p-6 pt-12">
        <Logo />

        <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-[0_12px_60px_rgba(0,0,0,0.60)]">
          <div className="p-6 sm:p-8">
            <div className="flex items-end justify-between gap-3">
              <h1 className="text-2xl font-black tracking-tight">로그인</h1>
              <div className="text-xs text-white/60">개발자: 황도운</div>
            </div>

            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <div>
                <div className="text-sm text-white/85 mb-2">로그인 옵션을 선택하십시오</div>
                <RoleSegment value={role} onChange={setRole} />
              </div>

              <div>
                <label className="text-sm text-white/85">{idLabel}</label>
                <input
                  className="mt-2 w-full rounded-2xl bg-neutral-900/70 border border-white/10 p-4 outline-none focus:ring-2 focus:ring-emerald-400/60"
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  placeholder={idPlaceholder}
                  inputMode={idInputMode as any}
                  autoCapitalize="none"
                  autoCorrect="off"
                />
              </div>

              <div>
                <label className="text-sm text-white/85">비밀번호</label>
                <input
                  className="mt-2 w-full rounded-2xl bg-neutral-900/70 border border-white/10 p-4 outline-none focus:ring-2 focus:ring-emerald-400/60"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="비밀번호"
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
                {loading ? "접속 중입니다…" : "로그인"}
              </button>

              <button
                type="button"
                onClick={() => router.push("/signup")}
                className="w-full rounded-2xl py-4 font-bold border border-white/10 bg-white/5 hover:bg-white/10"
              >
                회원가입으로 이동
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
