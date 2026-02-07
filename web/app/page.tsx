import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 text-center">
      <h1 className="text-4xl font-bold tracking-tight">
        B3 DecentApp
      </h1>

      <p className="max-w-md text-gray-400">
        Web3-native messaging with Web2-smooth UX.
      </p>

      <Link
        href="/chat"
        className="rounded-md border border-gray-700 px-6 py-3 text-sm text-gray-200 hover:border-gray-500 transition"
      >
        Open Chat
      </Link>
    </main>
  );
}