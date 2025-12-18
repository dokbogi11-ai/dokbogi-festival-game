// app/page.tsx
"use client";

import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center relative overflow-hidden">
      {/* 배경 블러 */}
      <div className="pointer-events-none absolute inset-0 opacity-45">
        <div className="absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full bg-emerald-500 blur-[130px]" />
        <div className="absolute -bottom-48 -right-48 h-[620px] w-[620px] rounded-full bg-emerald-700 blur-[150px]" />
      </div>

      <div className="relative z-10 text-left px-6">
        <h1 className="text-4xl font-extrabold tracking-tight mb-3">
          <span className="text-emerald-300">독보기</span> 게임페이지의 <br />방문을 환영합니다.
        </h1>

        <button
          onClick={() => router.push("/login")}
          className="
            px-8 py-4 rounded-2xl font-extrabold text-black
            bg-gradient-to-r from-emerald-300 via-emerald-400 to-emerald-600
            shadow-[0_0_34px_rgba(34,197,94,0.30)]
            hover:opacity-90 transition
          "
        >
          로그인하기
        </button>
      </div>
    </div>
  );
}
