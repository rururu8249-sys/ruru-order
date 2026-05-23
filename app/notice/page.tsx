"use client";

// app/notice/page.tsx
// 전체 교체용
// 파일 위치:
// /Users/ruru/Desktop/ruru-order-app/app/notice/page.tsx
//
// 기능 유지:
// - Supabase notices 테이블에서 공지글 불러오기
// - 관리자에서 등록/수정/숨김 처리한 내용 자동 반영
// - 고정공지 우선 노출
// - 관리자에서 정한 sort_order 순서대로 노출
//
// 디자인 변경:
// - 홈화면 리뉴얼 톤에 맞춘 모바일 우선 핑크/화이트 카드형 UI
// - 기존 Supabase 조회 로직은 유지

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import CustomerTopNav from "@/components/customer/CustomerTopNav";
import NoticePageHero from "@/components/notice/NoticePageHero";
import NoticeStateMessage from "@/components/notice/NoticeStateMessage";
import NoticeCard from "@/components/notice/NoticeCard";
import NoticePagination from "@/components/notice/NoticePagination";

type Notice = {
  id: number;
  title: string;
  content: string;
  category: string;
  is_pinned: boolean;
  is_visible: boolean;
  sort_order: number;
  created_at: string;
};

const blockCustomerCopyEvents = () => {
  const block = (event: Event) => event.preventDefault();

  const blockKey = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    const isMac = event.metaKey;
    const isWin = event.ctrlKey;

    if (
      event.key === "F12" ||
      ((isWin || isMac) && ["c", "x", "u"].includes(key)) ||
      (isWin && event.shiftKey && ["i", "j"].includes(key)) ||
      (isMac && event.altKey && ["i", "j"].includes(key))
    ) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  document.addEventListener("contextmenu", block);
  document.addEventListener("copy", block);
  document.addEventListener("cut", block);
  document.addEventListener("dragstart", block);
  document.addEventListener("selectstart", block);
  document.addEventListener("keydown", blockKey);

  return () => {
    document.removeEventListener("contextmenu", block);
    document.removeEventListener("copy", block);
    document.removeEventListener("cut", block);
    document.removeEventListener("dragstart", block);
    document.removeEventListener("selectstart", block);
    document.removeEventListener("keydown", blockKey);
  };
};

export default function NoticePage() {
  useEffect(() => {
    return blockCustomerCopyEvents();
  }, []);

  const [notices, setNotices] = useState<Notice[]>([]);
  const [noticePage, setNoticePage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadNotices();
  }, []);

  const loadNotices = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("notices")
      .select("*")
      .eq("is_visible", true)
      .order("is_pinned", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (!error) {
      setNotices(data || []);
    setNoticePage(1);
    }

    setLoading(false);
  };




  const NOTICES_PER_PAGE = 2;
  const totalNoticePages = Math.max(1, Math.ceil(notices.length / NOTICES_PER_PAGE));
  const safeNoticePage = Math.min(noticePage, totalNoticePages);
  const visibleNotices = notices.slice(
    (safeNoticePage - 1) * NOTICES_PER_PAGE,
    safeNoticePage * NOTICES_PER_PAGE
  );

  return (
    <main className="min-h-screen select-none bg-[#f5f8ff] px-4 py-6 text-[#151923]" style={{ WebkitUserSelect: "none", WebkitTouchCallout: "none" }}>
      <section className="mx-auto w-full max-w-md">
        <CustomerTopNav />
        <NoticePageHero />

        {loading && <NoticeStateMessage message="공지사항 불러오는 중..." />}

        {!loading && notices.length === 0 && (
          <NoticeStateMessage message="등록된 공지사항이 없습니다." />
        )}

        <div className="space-y-4">
          {visibleNotices.map((notice) => (
            <NoticeCard key={notice.id} notice={notice} />
          ))}
        </div>

        {notices.length > 0 && (
          <NoticePagination
            currentPage={safeNoticePage}
            totalPages={totalNoticePages}
            onPageChange={setNoticePage}
          />
        )}


        <footer className="py-8 text-center">
          <p className="text-[15px] font-medium tracking-[-0.04em] text-slate-500">
            오늘도 루루동이와 함께 행복한 쇼핑 되세요!♡
          </p>
          <div className="mx-auto mt-5 h-px w-full bg-blue-100" />
          <p className="mt-4 text-[12px] text-slate-400">
            copyright © since 2024 루루동이. All rights reserved.
          </p>
        </footer>
      </section>
    </main>
  );
}
