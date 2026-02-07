"use client";

import { useProfile } from "@/hooks/useProfile";

export default function ProfileCard() {
  const { profile, update, ready } = useProfile();
  if (!ready) return null;

  return (
    <div className="rounded-2xl border border-white/10 bg-[#141a2b] p-6">
      <h2 className="text-lg font-semibold mb-4">Profile</h2>

      <div className="flex items-center gap-6">
        <div className="h-16 w-16 rounded-full bg-blue-600 from-indigo-500 to-purple-600 flex items-center justify-center text-xl font-bold">
          {profile.name.charAt(0)}
        </div>

        <div className="flex-1 space-y-3">
          <input
            className="w-full bg-transparent border border-white/10 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-indigo-500"
            value={profile.name}
            onChange={(e) => update({ name: e.target.value })}
            placeholder="Display name"
          />

          <input
            className="w-full bg-transparent border border-white/10 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-indigo-500"
            value={profile.username}
            onChange={(e) => update({ username: e.target.value })}
            placeholder="Username"
          />
        </div>
      </div>
    </div>
  );
}
