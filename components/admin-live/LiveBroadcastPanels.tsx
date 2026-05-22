"use client";

import { useMemo, useState } from "react";
import { issueNotes, liveChatMessages } from "./mockData";

type IssueStatusFilter = "open" | "all" | "resolved";
type VideoRatio = "vertical" | "wide" | "auto";

type Props = {
  videoRatio: VideoRatio;
};

type IssueNote = {
  id: string;
  color: string;
  status: string;
  tags: string[];
  title: string;
  body: string;
  createdAt: string;
};

function noteClass(color: string) {
  if (color === "yellow") return "border-amber-200 bg-amber-50";
  if (color === "blue") return "border-blue-200 bg-blue-50";
  return "border-red-200 bg-red-50";
}

function tagClass(color: string) {
  if (color === "yellow") return "bg-amber-100 text-amber-700";
  if (color === "blue") return "bg-blue-100 text-blue-700";
  return "bg-red-100 text-red-700";
}

function videoSizeClass(videoRatio: VideoRatio) {
  if (videoRatio === "wide") return "aspect-video h-[300px] w-full max-w-[540px]";
  if (videoRatio === "auto") return "aspect-[4/5] h-[330px] w-auto";
  return "aspect-[9/16] h-[330px] w-auto";
}

export default function LiveBroadcastPanels({ videoRatio }: Props) {
  const [showMemoAdd, setShowMemoAdd] = useState(false);
  const [statusFilter, setStatusFilter] = useState<IssueStatusFilter>("open");
  const [notes, setNotes] = useState<IssueNote[]>(issueNotes);

  const filteredNotes = useMemo(() => {
    if (statusFilter === "all") return notes;
    return notes.filter((note) => note.status === statusFilter);
  }, [notes, statusFilter]);

  const openCount = notes.filter((note) => note.status === "open").length;

  return (
    <section className="mb-4 grid grid-cols-12 items-stretch gap-3">
      <div className="col-span-12 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm lg:col-span-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-black text-slate-950">
            방송화면
            <span className="rounded-md bg-red-600 px-2 py-0.5 text-[11px] text-white">LIVE</span>
          </div>
          <div className="text-xs font-black text-slate-400">
            {videoRatio === "vertical" ? "9:16 세로" : videoRatio === "wide" ? "16:9 가로" : "자동"}
          </div>
        </div>

        <div className="flex h-[360px] items-center justify-center rounded-2xl bg-slate-100 p-2">
          <div className={`relative overflow-hidden rounded-[1.5rem] bg-slate-950 shadow-sm ${videoSizeClass(videoRatio)}`}>
            <div className="absolute left-4 top-4 z-10 rounded-md bg-red-600 px-2 py-1 text-xs font-black text-white">
              LIVE
            </div>

            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-amber-100 via-stone-100 to-slate-100">
              <div className="w-[78%] rounded-[2rem] bg-white/70 p-6 text-center shadow-sm backdrop-blur">
                <div className="text-5xl">👟</div>
                <div className="mt-4 text-lg font-black text-slate-900">루루동이LIVE</div>
                <div className="mt-2 text-xs font-bold text-slate-500">유튜브 라이브 영상 영역</div>
              </div>
            </div>

            <div className="absolute bottom-0 left-0 right-0 flex items-center gap-2 bg-black/70 px-3 py-2 text-white">
              <span className="text-base">Ⅱ</span>
              <span>🔊</span>
              <div className="h-1 flex-1 rounded-full bg-white/25">
                <div className="h-1 w-[54%] rounded-full bg-red-500" />
              </div>
              <span className="text-[11px] font-black text-red-400">● LIVE</span>
              <span>⚙</span>
            </div>
          </div>
        </div>
      </div>

      <div className="col-span-12 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm lg:col-span-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-black text-slate-950">라이브 채팅</h2>
          <span className="text-xs font-bold text-slate-500">👥 487</span>
        </div>

        <div className="h-[292px] space-y-1.5 overflow-y-auto pr-1">
          {liveChatMessages.map(([name, message, time]) => (
            <div key={`${name}-${time}`} className="grid grid-cols-[28px_1fr_52px] items-start gap-2 text-xs">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-[11px] font-black text-slate-500">
                {name.slice(0, 1)}
              </div>
              <div className="min-w-0">
                <span className="mr-2 font-black text-slate-800">{name}</span>
                <span className="text-slate-600">{message}</span>
              </div>
              <div className="text-right text-[11px] font-bold text-slate-400">{time}</div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex h-10 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-400">
          메시지를 입력하세요...
          <span className="ml-auto">☺</span>
        </div>
      </div>

      <div className="relative col-span-12 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm lg:col-span-3">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-black text-slate-950">회원 특이사항 · 고객이슈 {openCount}</h2>
          <button
            onClick={() => setShowMemoAdd((value) => !value)}
            className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-black text-slate-500 hover:bg-slate-50"
          >
            + 메모 추가
          </button>
        </div>

        <div className="mb-3 flex gap-1 rounded-xl bg-slate-50 p-1">
          {[
            ["open", "미해결"],
            ["all", "전체"],
            ["resolved", "해결완료"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key as IssueStatusFilter)}
              className={[
                "flex-1 rounded-lg px-2 py-1.5 text-xs font-black",
                statusFilter === key ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-900",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="h-[292px] space-y-2 overflow-y-auto pr-1">
          {filteredNotes.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 p-5 text-center text-xs font-bold text-slate-400">
              표시할 특이사항이 없습니다.
            </div>
          ) : (
            filteredNotes.map((note) => (
              <div
                key={note.id}
                className={`rounded-xl border p-2.5 shadow-sm ${noteClass(note.color)} ${
                  note.status === "resolved" ? "opacity-55" : ""
                }`}
              >
                <div className="mb-2 flex flex-wrap gap-1">
                  {note.tags.map((tag) => (
                    <span key={tag} className={`rounded-md px-2 py-0.5 text-[11px] font-black ${tagClass(note.color)}`}>
                      {tag}
                    </span>
                  ))}
                  {note.status === "resolved" && (
                    <span className="rounded-md bg-slate-200 px-2 py-0.5 text-[11px] font-black text-slate-600">
                      해결완료
                    </span>
                  )}
                </div>

                <div className="text-xs font-black text-slate-800">{note.title}</div>
                <p className="mt-1 line-clamp-2 whitespace-pre-line text-xs leading-4 text-slate-600">{note.body}</p>

                <div className="mt-1.5 flex items-center gap-2">
                  <span className="mr-auto text-[11px] font-bold text-slate-400">{note.createdAt}</span>
                  {note.status === "open" && (
                    <button
                      onClick={() =>
                        setNotes((prev) =>
                          prev.map((item) => (item.id === note.id ? { ...item, status: "resolved" } : item))
                        )
                      }
                      className="rounded-lg bg-slate-900 px-2 py-1 text-[11px] font-black text-white hover:bg-slate-700"
                    >
                      해결완료
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-2 flex items-center justify-center gap-3 text-sm font-black">
          <button className="text-slate-300">‹</button>
          <button className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-white">1</button>
          <button className="text-slate-500">2</button>
          <button className="text-slate-500">3</button>
          <button className="text-slate-500">4</button>
          <button className="text-slate-400">›</button>
        </div>

        {showMemoAdd && (
          <div className="absolute right-full top-10 z-30 mr-3 w-[330px] rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xl">
            <div className="mb-3 flex items-center">
              <h3 className="text-sm font-black text-slate-950">특이사항 추가</h3>
              <button onClick={() => setShowMemoAdd(false)} className="ml-auto text-lg text-slate-400 hover:text-slate-800">
                ×
              </button>
            </div>

            <label className="mb-1 block text-xs font-black text-slate-500">고객 검색</label>
            <div className="mb-3 flex gap-2">
              <input
                placeholder="닉네임 / 이름 / 전번 검색"
                className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-xs font-bold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
              />
              <button className="rounded-xl bg-slate-900 px-3 text-xs font-black text-white">검색</button>
            </div>

            <div className="mb-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs">
              <div className="font-black text-blue-800">lovelyday · 김지연</div>
              <div className="mt-1 font-bold text-blue-600">010-1234-5678</div>
              <button className="mt-2 rounded-lg bg-blue-600 px-3 py-1.5 text-[11px] font-black text-white">
                이 고객 선택
              </button>
            </div>

            <div className="mb-3">
              <div className="mb-1 text-xs font-black text-slate-500">이슈유형 다중선택</div>
              <div className="flex flex-wrap gap-1">
                {["교환", "반품", "환불", "구매", "진상", "기타"].map((tag, index) => (
                  <button
                    key={tag}
                    className={[
                      "rounded-lg px-2 py-1 text-xs font-black",
                      index < 2 ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                    ].join(" ")}
                  >
                    {index < 2 ? "✓ " : ""}
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            <label className="mb-1 block text-xs font-black text-slate-500">메모내용</label>
            <textarea
              rows={4}
              placeholder="특이사항 내용을 입력하세요"
              className="mb-3 w-full resize-none rounded-xl border border-slate-200 p-3 text-xs font-bold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
            />

            <div className="mb-3 rounded-xl bg-slate-50 px-3 py-2 text-xs font-black text-slate-500">
              메모날짜: 2026.05.23 20:41 자동입력
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowMemoAdd(false)}
                className="h-10 flex-1 rounded-xl border border-slate-200 text-xs font-black text-slate-600 hover:bg-slate-50"
              >
                취소
              </button>
              <button className="h-10 flex-1 rounded-xl bg-blue-600 text-xs font-black text-white hover:bg-blue-700">
                저장
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
