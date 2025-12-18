// app/components/ClubLogo.tsx
"use client";

import Image from "next/image";

type Props = {
  size?: number;
};

export function ClubLogo({ size = 44 }: Props) {
  return (
    <Image
      src="/club.png"    // ← 네가 넣은 파일명
      width={size}
      height={size}
      alt="club logo"
      className="rounded-xl shadow-[0_0_18px_rgba(34,197,94,0.25)]"
    />
  );
}
