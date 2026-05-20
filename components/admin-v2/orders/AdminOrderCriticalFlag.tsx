"use client";

type AdminOrderCriticalFlagProps = {
  text: string;
};

export default function AdminOrderCriticalFlag({ text }: AdminOrderCriticalFlagProps) {
  if (!text) return null;

  return (
    <div className="mt-0.5 text-center text-[10px] font-black text-red-600">
      {text}
    </div>
  );
}
