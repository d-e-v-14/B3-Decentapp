"use client";

import { useAuth } from "@/hooks/useAuth";
import { useAuthStore } from "@/store/authStore";

export default function SignInButton() {
  const { signIn, logout } = useAuth();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const publicKey = useAuthStore((s) => s.publicKey);

  if (isAuthenticated) {
    return (
      <button
        onClick={logout}
        className="rounded-lg bg-gray-800 px-4 py-2 text-sm hover:bg-gray-700"
      >
        Signed in as {publicKey?.slice(0, 6)}…{publicKey?.slice(-4)}
      </button>
    );
  }

  return (
    <button
      onClick={signIn}
      className="rounded-lg bg-white px-6 py-3 font-medium text-black hover:bg-gray-200 transition"
    >
      Sign in
    </button>
  );
}
