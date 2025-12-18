// app/page.tsx
import { redirect } from "next/navigation";

export default function RootPage() {
  // 첫 페이지에 오면 바로 /login 으로 보내기
  redirect("/login");
}
