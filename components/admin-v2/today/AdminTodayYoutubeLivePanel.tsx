"use client";

// components/admin-v2/today/AdminTodayYoutubeLivePanel.tsx
// 목적: 오늘할일 관제탑 안에서 유튜브 라이브 채팅을 안전하게 보조 관리
// 1차 범위:
// - 방송 URL/영상ID 입력
// - 유튜브 보기/채팅창 열기
// - 복사한 채팅 붙여넣기
// - 채팅글/닉네임 검색
// - ChatGPT 분석문구 복사
// - 필요한 내용만 오늘할일 등록
// 주의: YouTube API/OAuth/채팅 글쓰기 없음. 주문/입금/배송/정산 로직 없음.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

const STORAGE_KEY = "ruru-admin-youtube-live-url";
const CHATGPT_URL = "https://chatgpt.com/";

function normalize(value: unknown) {
  return String(value ?? "").replace(/\s+/g, "").toLowerCase();
}

function extractYoutubeVideoId(input: string) {
  const raw = input.trim();

  if (!raw) return "";

  if (/^[a-zA-Z0-9_-]{8,20}$/.test(raw) && !raw.includes("/")) {
    return raw;
  }

  try {
    const url = new URL(raw);

    const v = url.searchParams.get("v");
    if (v) return v;

    const parts = url.pathname.split("/").filter(Boolean);

    const liveIndex = parts.findIndex((part) => part === "live");
    if (liveIndex >= 0 && parts[liveIndex + 1]) return parts[liveIndex + 1];

    const shortsIndex = parts.findIndex((part) => part === "shorts");
    if (shortsIndex >= 0 && parts[shortsIndex + 1]) return parts[shortsIndex + 1];

    if (url.hostname.includes("youtu.be") && parts[0]) return parts[0];

    return "";
  } catch {
    return "";
  }
}

function buildGptPrompt({
  liveUrl,
  videoId,
  keyword,
  nickname,
  chatText,
  filteredText,
}: {
  liveUrl: string;
  videoId: string;
  keyword: string;
  nickname: string;
  chatText: string;
  filteredText: string;
}) {
  return [
    "아래 유튜브 라이브 채팅 내용을 라이브커머스 운영자 입장에서 분석해줘.",
    "",
    "분석 기준:",
    "1. 구매 의사, 주문 문의, 입금 문의, 배송 문의, 사이즈/색상 문의를 먼저 찾아줘.",
    "2. 닉네임별로 누가 무엇을 문의했는지 정리해줘.",
    "3. 내가 바로 답변해야 할 채팅을 우선순위로 표시해줘.",
    "4. 단순 잡담/인사/반응은 참고용으로만 분류해줘.",
    "5. 오늘할일에 등록해야 할 채팅만 따로 모아줘.",
    "6. 답변은 짧고 부드러운 라이브방송 채팅 말투로 추천해줘.",
    "",
    "출력 형식:",
    "## 바로 처리할 채팅",
    "- 닉네임:",
    "- 문의 내용:",
    "- 분류:",
    "- 추천 답변:",
    "- 오늘할일 등록 추천 여부:",
    "",
    "## 참고용 채팅",
    "- 닉네임:",
    "- 내용:",
    "",
    `방송 URL: ${liveUrl || "-"}`,
    `영상ID: ${videoId || "-"}`,
    `검색어: ${keyword || "-"}`,
    `닉네임 검색: ${nickname || "-"}`,
    "",
    "[검색 필터 결과]",
    filteredText || "-",
    "",
    "[전체 채팅 복사 내용]",
    chatText || "-",
  ].join("\n");
}

export default function AdminTodayYoutubeLivePanel() {
  const [liveUrl, setLiveUrl] = useState("");
  const [chatText, setChatText] = useState("");
  const [keyword, setKeyword] = useState("");
  const [nickname, setNickname] = useState("");
  const [taskMemo, setTaskMemo] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setLiveUrl(saved);
    } catch {
      // localStorage 실패는 무시
    }
  }, []);

  const videoId = useMemo(() => extractYoutubeVideoId(liveUrl), [liveUrl]);

  const filteredLines = useMemo(() => {
    const lines = chatText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const key = normalize(keyword);
    const nick = normalize(nickname);

    return lines.filter((line) => {
      const target = normalize(line);
      const keywordMatch = !key || target.includes(key);
      const nicknameMatch = !nick || target.includes(nick);

      return keywordMatch && nicknameMatch;
    });
  }, [chatText, keyword, nickname]);

  const filteredText = filteredLines.join("\n");

  const saveLiveUrl = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, liveUrl.trim());
      alert("유튜브 방송 링크를 저장했습니다.");
    } catch {
      alert("저장 실패. 브라우저 저장공간을 확인해주세요.");
    }
  };

  const openYoutubeWatch = () => {
    if (!videoId) {
      alert("유튜브 라이브 URL 또는 영상ID를 먼저 입력해주세요.");
      return;
    }

    window.open(`https://www.youtube.com/watch?v=${videoId}`, "_blank", "noopener,noreferrer");
  };

  const openYoutubeChat = () => {
    if (!videoId) {
      alert("유튜브 라이브 URL 또는 영상ID를 먼저 입력해주세요.");
      return;
    }

    window.open(`https://www.youtube.com/live_chat?is_popout=1&v=${videoId}`, "_blank", "noopener,noreferrer");
  };

  const copyGptPrompt = async () => {
    if (!chatText.trim()) {
      alert("채팅 내용을 복사해서 붙여넣은 뒤 사용해주세요.");
      return;
    }

    const prompt = buildGptPrompt({
      liveUrl,
      videoId,
      keyword,
      nickname,
      chatText,
      filteredText,
    });

    try {
      await navigator.clipboard.writeText(prompt);
      alert("유튜브 채팅 분석문구를 복사했습니다.\n\nChatGPT 창에 붙여넣으면 됩니다.");
    } catch {
      alert("복사 실패. 채팅 내용을 직접 복사해주세요.");
    }
  };

  const registerTodayTask = async () => {
    const bodyText = taskMemo.trim() || filteredText.trim() || chatText.trim();

    if (!bodyText) {
      alert("오늘할일에 등록할 채팅 내용이나 메모를 입력해주세요.");
      return;
    }

    const titleLabel = nickname.trim() || keyword.trim() || "유튜브 채팅 확인";

    const ok = window.confirm(
      `유튜브 채팅 내용을 오늘할일에 등록할까요?\n\n${titleLabel}`
    );

    if (!ok) return;

    setSaving(true);

    const { error } = await supabase.from("admin_tasks").insert({
      task_type: "general",
      title: `유튜브채팅 · ${titleLabel}`,
      body: [
        "선택태그: 유튜브채팅",
        `방송URL: ${liveUrl || "-"}`,
        `영상ID: ${videoId || "-"}`,
        `검색어: ${keyword || "-"}`,
        `닉네임: ${nickname || "-"}`,
        "",
        "등록 내용:",
        bodyText,
      ].join("\n"),
      source: "youtube-live",
      priority: "normal",
      status: "open",
      related_product: null,
      raw_payload: {
        liveUrl,
        videoId,
        keyword,
        nickname,
        taskMemo,
        filteredText,
      },
    });

    setSaving(false);

    if (error) {
      alert("유튜브 채팅 오늘할일 등록 실패\n\n" + error.message);
      return;
    }

    setTaskMemo("");
    window.dispatchEvent(new CustomEvent("ruru-admin-task-created"));
    alert("유튜브 채팅 내용을 오늘할일에 등록했습니다.");
  };

  return (
    <section className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="mb-3">
        <h2 className="text-lg font-black tracking-[-0.04em] text-neutral-950">
          유튜브 LIVE 채팅
        </h2>
        <p className="mt-1 text-xs font-bold text-neutral-500">
          1차는 무료 수동 방식입니다. 채팅창을 열고, 필요한 채팅을 복사해 붙여넣어 검색/등록합니다.
        </p>
      </div>

      <div className="grid gap-3">
        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
          <div className="mb-2 text-sm font-black text-neutral-950">
            1. 방송 링크 / 영상ID
          </div>

          <div className="grid gap-2 lg:grid-cols-[1fr_auto_auto_auto]">
            <input
              value={liveUrl}
              onChange={(event) => setLiveUrl(event.target.value)}
              placeholder="유튜브 라이브 URL 또는 영상ID"
              className="h-11 rounded-xl border border-neutral-200 bg-white px-3 text-sm font-bold outline-none focus:border-red-500 focus:ring-4 focus:ring-red-100/70"
            />

            <button
              type="button"
              onClick={saveLiveUrl}
              className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-black text-neutral-700 active:scale-[0.98]"
            >
              링크저장
            </button>

            <button
              type="button"
              onClick={openYoutubeWatch}
              className="rounded-xl bg-red-600 px-3 py-2 text-xs font-black text-white active:scale-[0.98]"
            >
              유튜브 보기
            </button>

            <button
              type="button"
              onClick={openYoutubeChat}
              className="rounded-xl bg-neutral-950 px-3 py-2 text-xs font-black text-white active:scale-[0.98]"
            >
              채팅창 열기
            </button>
          </div>

          <div className="mt-2 rounded-xl bg-white px-3 py-2 text-xs font-bold text-neutral-500">
            인식된 영상ID: {videoId || "아직 없음"}
          </div>
        </div>

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
              onClick={copyGptPrompt}
              className="rounded-xl bg-neutral-950 px-4 py-3 text-sm font-black text-white active:scale-[0.98]"
            >
              ChatGPT 분석문구 복사
            </button>

            <button
              type="button"
              onClick={registerTodayTask}
              disabled={saving}
              className="rounded-xl bg-red-600 px-4 py-3 text-sm font-black text-white active:scale-[0.98] disabled:bg-neutral-300"
            >
              {saving ? "등록중" : "오늘할일 등록"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
