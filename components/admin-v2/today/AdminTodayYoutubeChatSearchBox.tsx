"use client";

// components/admin-v2/today/AdminTodayYoutubeChatSearchBox.tsx
// 목적: 붙여넣은 유튜브 채팅의 채팅글/닉네임 검색

export default function AdminTodayYoutubeChatSearchBox({
  keyword,
  nickname,
  filteredLines,
  setKeyword,
  setNickname,
}: {
  keyword: string;
  nickname: string;
  filteredLines: string[];
  setKeyword: (value: string) => void;
  setNickname: (value: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-3">
      <div className="mb-2 text-sm font-black text-neutral-950">
        3. 검색 / 필터
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        <input
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="채팅글 검색: 입금, 주문, 사이즈, 배송..."
          className="h-11 rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-sm font-bold outline-none focus:border-red-500 focus:ring-4 focus:ring-red-100/70"
        />

        <input
          value={nickname}
          onChange={(event) => setNickname(event.target.value)}
          placeholder="닉네임 검색"
          className="h-11 rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-sm font-bold outline-none focus:border-red-500 focus:ring-4 focus:ring-red-100/70"
        />
      </div>

      <div className="mt-3 rounded-2xl bg-neutral-50 p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-black text-neutral-500">
            검색 결과
          </div>
          <div className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-neutral-600">
            {filteredLines.length.toLocaleString()}줄
          </div>
        </div>

        {filteredLines.length === 0 ? (
          <div className="rounded-xl bg-white p-4 text-center text-sm font-black text-neutral-400">
            검색 결과가 없습니다.
          </div>
        ) : (
          <div className="grid max-h-[220px] gap-1.5 overflow-y-auto pr-1">
            {filteredLines.slice(0, 120).map((line, index) => (
              <div
                key={`${line}-${index}`}
                className="rounded-xl bg-white px-3 py-2 text-xs font-bold leading-relaxed text-neutral-800"
              >
                {line}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
