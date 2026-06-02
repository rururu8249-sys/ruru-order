// components/order/OrderCustomerModeSwitch.tsx
// 목적: 고객정보 확인/입력 모드 전환 UI
// 주의: UI 전용. 고객정보 저장/조회/Supabase 로직 없음.

type CustomerMode = "load" | "new";

type OrderCustomerModeSwitchProps = {
  isEditing: boolean;
  customerMode: CustomerMode;
  onModeChange: (mode: CustomerMode) => void;
};

export default function OrderCustomerModeSwitch({
  isEditing,
  customerMode,
  onModeChange,
}: OrderCustomerModeSwitchProps) {
  if (isEditing) {
    return (
      <div className="rounded-[20px] bg-white p-2">
        <div className="rounded-2xl bg-coral-600 px-3 py-3 text-center text-sm font-black text-white">
          저장된 정보를 수정합니다
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 rounded-[20px] bg-white p-2">
      <button
        type="button"
        onClick={() => onModeChange("load")}
        className={`rounded-2xl px-3 py-3 text-sm font-black active:scale-[0.98] ${
          customerMode === "load"
            ? "bg-slate-950 text-white"
            : "bg-slate-100 text-slate-600"
        }`}
      >
        저장된 정보 확인
      </button>

      <button
        type="button"
        onClick={() => onModeChange("new")}
        className={`rounded-2xl px-3 py-3 text-sm font-black active:scale-[0.98] ${
          customerMode === "new"
            ? "bg-coral-600 text-white"
            : "bg-slate-100 text-slate-600"
        }`}
      >
        새 정보 입력
      </button>
    </div>
  );
}
