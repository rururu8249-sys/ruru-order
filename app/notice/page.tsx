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

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

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

const KAKAO_CHANNEL_URL = "https://pf.kakao.com/_RMxaqX";

export default function NoticePage() {
  const [notices, setNotices] = useState<Notice[]>([]);
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
    }

    setLoading(false);
  };

  return (
    <main className="min-h-screen bg-[#fffafa] px-4 py-6 text-[#171717]">
      <section className="mx-auto w-full max-w-[480px]">
        <header className="mb-5 rounded-[32px] border border-[#f4e7e9] bg-white px-5 py-6 shadow-[0_16px_40px_rgba(30,20,20,0.06)]">
          <Link
            href="/"
            className="mb-5 inline-flex rounded-full bg-[#fff2f4] px-4 py-2 text-[13px] font-black tracking-[-0.03em] text-[#ff4b60] transition active:scale-[0.98]"
          >
            ← 홈으로
          </Link>

          <div className="inline-flex rounded-full bg-[#fff1a8] px-3 py-1 text-[12px] font-black text-[#2b2416]">
            📢 필독 공지
          </div>

          <h1 className="mt-3 text-[38px] font-black leading-tight tracking-[-0.07em] text-[#151515]">
            공지사항
          </h1>

          <p className="mt-2 text-[15px] font-bold leading-relaxed tracking-[-0.04em] text-[#7b6d6d]">
            주문 전 꼭 확인해야 하는 안내입니다.
          </p>
        </header>

        {loading && (
          <div className="rounded-[28px] border border-[#f1ecec] bg-white p-7 text-center text-[15px] font-black text-[#777] shadow-[0_14px_35px_rgba(30,20,20,0.06)]">
            공지사항 불러오는 중...
          </div>
        )}

        {!loading && notices.length === 0 && (
          <div className="rounded-[28px] border border-[#f1ecec] bg-white p-7 text-center text-[15px] font-black text-[#777] shadow-[0_14px_35px_rgba(30,20,20,0.06)]">
            등록된 공지사항이 없습니다.
          </div>
        )}

        <div className="space-y-4">
          {notices.map((notice) => (
            <article
              key={notice.id}
              className={`rounded-[30px] bg-white p-5 shadow-[0_14px_35px_rgba(30,20,20,0.07)] ${
                notice.is_pinned
                  ? "border-2 border-[#ff5d6d]"
                  : "border border-[#f1ecec]"
              }`}
            >
              <div className="mb-4 flex flex-wrap items-center gap-2">
                {notice.is_pinned && (
                  <div className="inline-flex rounded-full bg-gradient-to-r from-[#ff5d6d] to-[#ff405a] px-3 py-1 text-[12px] font-black text-white">
                    상단고정
                  </div>
                )}

                <div className="inline-flex rounded-full bg-[#f7f3f3] px-3 py-1 text-[12px] font-black text-[#5f5555]">
                  {notice.category || "공지"}
                </div>
              </div>

              <h2 className="text-[22px] font-black leading-snug tracking-[-0.05em] text-[#151515]">
                {notice.title}
              </h2>

              <div className="mt-4 whitespace-pre-line text-[15px] font-semibold leading-[1.8] tracking-[-0.03em] text-[#4f5968]">
                {notice.content}
              </div>
            </article>
          ))}
        </div>

        <section className="mt-5 rounded-[30px] bg-gradient-to-br from-[#ff5d6d] via-[#ff4c62] to-[#ff405a] p-5 text-white shadow-[0_20px_42px_rgba(255,76,98,0.25)]">
          <div className="text-[22px] font-black tracking-[-0.05em]">
            문의가 필요하신가요?
          </div>

          <p className="mt-2 text-[14px] font-semibold leading-relaxed tracking-[-0.03em] text-white/85">
            주문 관련 문의는 카톡채널로 유튜브 닉네임과 주문자 성함을 함께 남겨주세요.
          </p>

          <a
            href={KAKAO_CHANNEL_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 block rounded-2xl bg-white px-4 py-4 text-center text-[16px] font-black text-[#ff4b60] transition active:scale-[0.98]"
          >
            카톡채널 문의하기
          </a>
        </section>

        <footer className="py-8 text-center">
          <p className="text-[15px] font-medium tracking-[-0.04em] text-[#5f5555]">
            오늘도 루루동이와 함께 행복한 쇼핑 되세요!♡
          </p>
          <div className="mx-auto mt-5 h-px w-full bg-[#eee5e5]" />
          <p className="mt-4 text-[12px] text-[#aaa]">
            copyright © since 2024 루루동이. All rights reserved.
          </p>
        </footer>
      </section>
    </main>
  );
}
