"use client";

// components/admin-v2/today/AdminTodayYoutubeChatActionBox.tsx
// 목적: ChatGPT 분석문구 복사 / 오늘할일 등록 버튼

export default function AdminTodayYoutubeChatActionBox({
  taskMemo,
  saving,
  setTaskMemo,
  onCopyGptPrompt,
  onRegisterTodayTask,
}: {
  taskMemo: string;
  saving: boolean;
  setTaskMemo: (value: string) => void;
  onCopyGptPrompt: () => void;
  onRegisterTodayTask: () => void;
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-3">
      <div className="mb-2 text-sm font-black text-neutral-950">
        4. 처리
      </div>

      <textarea
        value={taskMemo}
        onChange={(event) => setTaskMemo(event.target.value)}
        placeholder="오늘할일에 등록할 메모를 직접 적어도 됩니다. 비워두면 검색결과 또는 전체 채팅으로 등록됩니다."
        className="h-24 w-full resize-none rounded-2xl border border-neutral-200 bg-neutral-50 p-3 text-sm font-bold outline-none focus:border-red-500 focus:ring-4 focus:ring-red-100/70"
      />

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={onCopyGptPrompt}
          className="rounded-xl bg-neutral-950 px-4 py-3 text-sm font-black text-white active:scale-[0.98]"
        >
          ChatGPT 분석문구 복사
        </button>

        <button
          type="button"
          onClick={onRegisterTodayTask}
          disabled={saving}
          className="rounded-xl bg-red-600 px-4 py-3 text-sm font-black text-white active:scale-[0.98] disabled:bg-neutral-300"
        >
          {saving ? "등록중" : "오늘할일 등록"}
        </button>
      </div>
    </div>
  );
}
