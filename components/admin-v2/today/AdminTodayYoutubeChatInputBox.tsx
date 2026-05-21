"use client";

// components/admin-v2/today/AdminTodayYoutubeChatInputBox.tsx
// 목적: 유튜브 채팅 복사 내용 임시 메모용 붙여넣기

export default function AdminTodayYoutubeChatInputBox({
  chatText,
  setChatText,
}: {
  chatText: string;
  setChatText: (value: string) => void;
}) {
  return (
    <div className="rounded-2xl bg-neutral-50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-sm font-black text-neutral-950">
          채팅 복사 메모
        </div>
        <div className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-neutral-500">
          선택
        </div>
      </div>

      <textarea
        value={chatText}
        onChange={(event) => setChatText(event.target.value)}
        placeholder="필요한 채팅을 잠깐 붙여넣어 확인할 때만 사용하세요."
        className="h-24 w-full resize-none rounded-xl border border-neutral-200 bg-white p-3 text-sm font-bold outline-none focus:border-red-500 focus:ring-4 focus:ring-red-100/70"
      />
    </div>
  );
}
