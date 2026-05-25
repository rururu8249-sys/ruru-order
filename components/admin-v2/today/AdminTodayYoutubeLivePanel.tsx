"use client";

import { showAdminToast } from "@/lib/adminToast";

// components/admin-v2/today/AdminTodayYoutubeLivePanel.tsx
// 목적: 오늘할일 관제탑 안에서 유튜브 라이브 방송 화면/채팅창을 안전하게 확인
// 주의: YouTube API/OAuth/채팅 글쓰기 없음. 주문/입금/배송/정산 로직 없음.

import { useEffect, useMemo, useState } from "react";
import AdminTodayYoutubeLiveLinkBox from "@/components/admin-v2/today/AdminTodayYoutubeLiveLinkBox";
import AdminTodayYoutubeLiveEmbedBox from "@/components/admin-v2/today/AdminTodayYoutubeLiveEmbedBox";
import {
  YOUTUBE_LIVE_STORAGE_KEY,
  extractYoutubeVideoId,
} from "@/components/admin-v2/today/youtubeLiveUtils";

export default function AdminTodayYoutubeLivePanel() {
  const [liveUrl, setLiveUrl] = useState("");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(YOUTUBE_LIVE_STORAGE_KEY);
      if (saved) setLiveUrl(saved);
    } catch {
      // localStorage 실패는 무시
    }
  }, []);

  const videoId = useMemo(() => extractYoutubeVideoId(liveUrl), [liveUrl]);

  const saveLiveUrl = () => {
    try {
      window.localStorage.setItem(YOUTUBE_LIVE_STORAGE_KEY, liveUrl.trim());
      showAdminToast("유튜브 방송 링크를 저장했습니다.");
    } catch {
      showAdminToast("저장 실패. 브라우저 저장공간을 확인해주세요.");
    }
  };

  const openYoutubeWatch = () => {
    if (!videoId) {
      showAdminToast("유튜브 라이브 URL 또는 영상ID를 먼저 입력해주세요.");
      return;
    }

    window.open(`https://www.youtube.com/watch?v=${videoId}`, "_blank", "noopener,noreferrer");
  };

  const openYoutubeChat = () => {
    if (!videoId) {
      showAdminToast("유튜브 라이브 URL 또는 영상ID를 먼저 입력해주세요.");
      return;
    }

    window.open(`https://www.youtube.com/live_chat?is_popout=1&v=${videoId}`, "_blank", "noopener,noreferrer");
  };

  return (
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
    </div>
  );
}
