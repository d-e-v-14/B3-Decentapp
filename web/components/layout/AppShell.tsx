"use client";

import SidebarNav from "./SidebarNav";
import TopNav from "./TopNav";

export default function AppShell({
  children,
  fullWidth = false,
}: {
  children: React.ReactNode;
  fullWidth?: boolean;
}) {
  return (
    <div className="flex h-screen bg-[#0b0f1a] text-white">
      {/* Global Sidebar */}
      <SidebarNav />

      {/* Main Area */}
      <div className="flex-1 flex flex-col">
        <TopNav />

        <main
          className={`flex-1 ${
            fullWidth ? "" : "max-w-6xl mx-auto px-6 py-6"
          }`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
