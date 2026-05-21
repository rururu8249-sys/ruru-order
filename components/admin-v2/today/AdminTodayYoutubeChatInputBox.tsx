"use client";

// components/admin-v2/today/AdminTodayYoutubeChatInputBox.tsx
// 목적: 유튜브 채팅 복사 내용 붙여넣기

export default function AdminTodayYoutubeChatInputBox({
  chatText,
  setChatText,
}: {
  chatText: string;
  setChatText: (value: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
      <div className="mb-2 text-sm font-black text-neutral-950">
        2. 채팅 복사 붙여넣기
      </div>

      <textarea
        value={chatText}
        onChange={(event) => setChatText(event.target.value)}
        placeholder="유튜브 채팅창에서 필요한 채팅을 복사해서 붙여넣으세요."
        className="h-32 w-full resize-none rounded-2xl border border-neutral-200 bg-white p-3 text-sm font-bold outline-none focus:border-red-500 focus:ring-4 focus:ring-red-100/70"
      />
    </div>
  );
}
