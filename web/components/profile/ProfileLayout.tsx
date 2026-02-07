"use client";

export default function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="max-w-3xl mx-auto p-8 space-y-8">
      {children}
    </div>
  );
}
