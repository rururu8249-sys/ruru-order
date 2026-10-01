"use client";
import AdminLiveSideDrawer from "./AdminLiveSideDrawer";
export default function SettingsUnsavedChangesDialog({saving,onSave,onDiscard,onCancel}:{saving:boolean;onSave:()=>void;onDiscard:()=>void;onCancel:()=>void}) {
  return <AdminLiveSideDrawer title="저장하지 않은 설정" width={420} onClose={onCancel}>
    <div className="space-y-4 p-4 text-sm text-ink">
      <p>변경한 설정이 아직 저장되지 않았습니다. 어떻게 할까요?</p>
      <div className="flex flex-col gap-2">
        <button type="button" disabled={saving} onClick={onSave} className="min-h-11 rounded-xl bg-rose-deep px-3 font-bold text-white disabled:opacity-50">{saving ? "저장 중…" : "저장 후 이동"}</button>
        <button type="button" disabled={saving} onClick={onDiscard} className="min-h-11 rounded-xl border border-line px-3 font-bold disabled:opacity-50">버리고 이동</button>
        <button type="button" disabled={saving} onClick={onCancel} className="min-h-11 rounded-xl border border-line px-3 font-bold disabled:opacity-50">계속 편집</button>
      </div>
    </div>
  </AdminLiveSideDrawer>;
}
