"use client";

export default function DangerZone() {
  return (
    <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-6">
      <h2 className="text-lg font-semibold text-red-400 mb-2">
        Danger Zone
      </h2>

      <p className="text-sm text-gray-400 mb-4">
        Clear local identity and reset this device.
      </p>

      <button
        onClick={() => {
          localStorage.clear();
          location.reload();
        }}
        className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white"
      >
        Reset profile
      </button>
    </div>
  );
}
