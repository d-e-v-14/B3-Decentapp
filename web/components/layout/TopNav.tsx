"use client";

import { usePathname } from "next/navigation";

export default function TopNav() {
  const pathname = usePathname();

  const titleMap: Record<string, string> = {
    "/chat": "Chat",
    "/profile": "Profile",
    "/settings": "Settings",
    "/security": "Security",
  };

  const title =
    Object.entries(titleMap).find(([key]) =>
      pathname.startsWith(key)
    )?.[1] ?? "B3 DecentApp";

  return (
    <header className="h-14 px-6 flex items-center border-b border-white/10 bg-[#0f1424]">
      <h1 className="text-sm font-semibold text-gray-200">
        {title}
      </h1>
    </header>
  );
}
