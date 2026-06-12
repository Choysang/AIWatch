"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export function SubpageNav() {
  const router = useRouter();

  function onBack() {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/");
  }

  return (
    <nav className="subpage-nav" aria-label="子页面导航">
      <button type="button" onClick={onBack}>
        返回
      </button>
      <Link href="/">首页</Link>
    </nav>
  );
}
