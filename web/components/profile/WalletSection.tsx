"use client";

export default function WalletSection() {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#141a2b] p-6">
      <h2 className="text-lg font-semibold mb-2">Wallet</h2>

      <p className="text-sm text-gray-400 mb-4">
        Wallet-based identity will be enabled in a later phase.
      </p>

      <button
        disabled
        className="rounded-lg bg-white/10 px-4 py-2 text-sm text-gray-300 cursor-not-allowed"
      >
        Connect wallet (coming soon)
      </button>
    </div>
  );
}
