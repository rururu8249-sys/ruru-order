"use client";

type AdminOrderDetailButtonProps = {
  isOpen: boolean;
  onClick: () => void;
};

export default function AdminOrderDetailButton({
  isOpen,
  onClick,
}: AdminOrderDetailButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-8 w-full max-w-[58px] rounded-lg border border-neutral-300 bg-white px-1 text-[11px] font-black text-neutral-700 hover:bg-neutral-50 active:scale-[0.98]"
    >
      {isOpen ? "닫기" : "보기"}
    </button>
  );
}
