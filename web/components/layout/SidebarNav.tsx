"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useIdentity } from "../../hooks/useIdentity";

const navItems = [
  { name: "Chat", href: "/chat" },
  { name: "Profile", href: "/profile" },
  { name: "Settings", href: "/settings" },
  { name: "Security", href: "/security" },
];

export default function SidebarNav() {
  const pathname = usePathname();
  const identity = useIdentity();

  return (
    <aside className="w-[260px] bg-[#141a2b] flex flex-col border-r border-white/10">
      {/* App Header */}
      <div className="px-5 py-4 border-b border-white/10">
        <div className="text-lg font-semibold">B3 DecentApp</div>
        <div className="text-xs text-gray-400">
          Web3 Messaging
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const active = pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-xl px-4 py-2 text-sm transition ${
                active
                  ? "bg-indigo-500/20 text-white"
                  : "text-gray-300 hover:bg-white/5"
              }`}
            >
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* Identity Footer */}
      <div className="px-4 py-3 border-t border-white/10 flex items-center gap-3">
        <div className="h-9 w-9 rounded-full bg-indigo-600 flex items-center justify-center font-bold">
          {identity.ready ? identity.short[0] : ""}
        </div>
        <div className="flex-1">
          <div className="text-sm">
            {identity.ready ? identity.short : "Loading…"}
          </div>
          <div className="text-xs text-green-400">
            {identity.ready ? "Connected" : ""}
          </div>
        </div>
      </div>
    </aside>
  );
}
