"use client";

// components/admin-v2/today/AdminTodayYoutubeLivePanel.tsx
// 목적: 오늘할일 관제탑 안에서 유튜브 라이브 채팅을 안전하게 보조 관리
// 주의: YouTube API/OAuth/채팅 글쓰기 없음. 주문/입금/배송/정산 로직 없음.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import AdminTodayYoutubeLiveLinkBox from "@/components/admin-v2/today/AdminTodayYoutubeLiveLinkBox";
import AdminTodayYoutubeChatInputBox from "@/components/admin-v2/today/AdminTodayYoutubeChatInputBox";
import AdminTodayYoutubeLiveEmbedBox from "@/components/admin-v2/today/AdminTodayYoutubeLiveEmbedBox";
import AdminTodayYoutubeChatSearchBox from "@/components/admin-v2/today/AdminTodayYoutubeChatSearchBox";
import AdminTodayYoutubeChatActionBox from "@/components/admin-v2/today/AdminTodayYoutubeChatActionBox";
import AdminTodayCollapsiblePanel from "@/components/admin-v2/today/AdminTodayCollapsiblePanel";
import {
  CHATGPT_URL,
  YOUTUBE_LIVE_STORAGE_KEY,
  buildYoutubeLiveGptPrompt,
  extractYoutubeVideoId,
  filterYoutubeChatLines,
} from "@/components/admin-v2/today/youtubeLiveUtils";

export default function AdminTodayYoutubeLivePanel() {
  const [liveUrl, setLiveUrl] = useState("");
  const [chatText, setChatText] = useState("");
  const [keyword, setKeyword] = useState("");
  const [nickname, setNickname] = useState("");
  const [taskMemo, setTaskMemo] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(YOUTUBE_LIVE_STORAGE_KEY);
      if (saved) setLiveUrl(saved);
    } catch {
      // localStorage 실패는 무시
    }
  }, []);

  const videoId = useMemo(() => extractYoutubeVideoId(liveUrl), [liveUrl]);

  const filteredLines = useMemo(
    () => filterYoutubeChatLines({ chatText, keyword, nickname }),
    [chatText, keyword, nickname]
  );

  const filteredText = filteredLines.join("\n");

  const saveLiveUrl = () => {
    try {
      window.localStorage.setItem(YOUTUBE_LIVE_STORAGE_KEY, liveUrl.trim());
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

    const prompt = buildYoutubeLiveGptPrompt({
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
      window.open(CHATGPT_URL, "_blank", "noopener,noreferrer");
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
        <AdminTodayYoutubeLiveLinkBox
          liveUrl={liveUrl}
          videoId={videoId}
          setLiveUrl={setLiveUrl}
          onSave={saveLiveUrl}
          onOpenWatch={openYoutubeWatch}
          onOpenChat={openYoutubeChat}
        />

        <AdminTodayYoutubeLiveEmbedBox
          videoId={videoId}
          onOpenWatch={openYoutubeWatch}
          onOpenChat={openYoutubeChat}
        />

        <AdminTodayYoutubeChatInputBox
          chatText={chatText}
          setChatText={setChatText}
        />

        <AdminTodayCollapsiblePanel
          title="검색 / 분석 / 오늘할일 등록"
          description="채팅을 붙여넣은 뒤 필요할 때만 펼쳐서 닉네임·단어 검색, ChatGPT 분석, 오늘할일 등록을 합니다."
          badge={filteredLines.length > 0 ? `${filteredLines.length}줄` : "선택 사용"}
          defaultOpen={false}
        >
          <div className="grid gap-3">
            <AdminTodayYoutubeChatSearchBox
              keyword={keyword}
              nickname={nickname}
              filteredLines={filteredLines}
              setKeyword={setKeyword}
              setNickname={setNickname}
            />

            <AdminTodayYoutubeChatActionBox
              taskMemo={taskMemo}
              saving={saving}
              setTaskMemo={setTaskMemo}
              onCopyGptPrompt={copyGptPrompt}
              onRegisterTodayTask={registerTodayTask}
            />
          </div>
        </AdminTodayCollapsiblePanel>
      </div>
    </section>
  );
}
