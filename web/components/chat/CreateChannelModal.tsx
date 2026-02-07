"use client";

import { useState } from "react";

export default function CreateChannelModal({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string) => void;
}) {
  const [name, setName] = useState("");

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative z-10 w-[420px] rounded-2xl bg-[#1b2136] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold mb-2">
          Create Channel
        </h2>

        <p className="text-sm text-gray-400 mb-4">
          Channels are end-to-end encrypted by default.
        </p>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Channel name"
          className="w-full rounded-xl bg-[#0f1424] px-4 py-3 text-sm outline-none mb-4"
          autoFocus
        />

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white"
          >
            Cancel
          </button>

          <button
            onClick={() => {
              if (!name.trim()) return;
              onCreate(name);
              setName("");
              onClose();
            }}
            className="px-4 py-2 text-sm rounded-lg bg-indigo-500 hover:bg-indigo-600"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
