"use client";

type Role = "player" | "manager" | "display";

const ROLE_META: Record<Role, { label: string; sub: string }> = {
  player: { label: "학생", sub: "" },
  manager: { label: "관리자", sub: "" },
  display: { label: "디스플레이", sub: "" },
};

export default function RoleSegment({
  value,
  onChange,
}: {
  value: Role;
  onChange: (v: Role) => void;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/40 p-2 backdrop-blur-xl">
      <div className="grid grid-cols-3 gap-2">
        {(Object.keys(ROLE_META) as Role[]).map((r) => {
          const active = value === r;
          return (
            <button
              key={r}
              type="button"
              onClick={() => onChange(r)}
              className={[
                "rounded-xl px-3 py-4 text-center transition",
                "border",
                active
                  ? "border-emerald-400/50 bg-emerald-400/10 shadow-[0_0_30px_rgba(34,197,94,0.18)]"
                  : "border-white/10 bg-white/5 hover:bg-white/10",
              ].join(" ")}
            >
              <div className={active ? "text-emerald-300 font-extrabold" : "text-white font-bold"}>
                {ROLE_META[r].label}
              </div>
              <div className="mt-1 text-[11px] text-white/60">{ROLE_META[r].sub}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
