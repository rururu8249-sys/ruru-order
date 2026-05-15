// app/notice/page.tsx
// 전체 교체용
// 파일 위치:
// /Users/ruru/Desktop/ruru-order-app/app/notice/page.tsx
//
// 기능:
// - Supabase notices 테이블에서 공지글 불러오기
// - 관리자에서 등록/수정/숨김 처리한 내용 자동 반영
// - 고정공지 우선 노출
// - 관리자에서 정한 sort_order 순서대로 노출

"use client";

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
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <section className="max-w-4xl mx-auto">

        <div className="mb-8">
          <div className="text-sm font-extrabold text-gray-500 mb-2">
            RURU NOTICE
          </div>

          <h1 className="text-4xl md:text-5xl font-extrabold text-gray-950">
            공지사항
          </h1>

          <p className="mt-3 text-gray-500 font-bold">
            주문 전 꼭 확인해야 하는 안내입니다.
          </p>
        </div>

        {loading && (
          <div className="rounded-3xl border border-gray-200 bg-white p-7 text-center font-bold text-gray-500">
            공지사항 불러오는 중...
          </div>
        )}

        {!loading && notices.length === 0 && (
          <div className="rounded-3xl border border-gray-200 bg-white p-7 text-center font-bold text-gray-500">
            등록된 공지사항이 없습니다.
          </div>
        )}

        <div className="space-y-4">
          {notices.map((notice) => (
            <article
              key={notice.id}
              className={`rounded-3xl border bg-white p-6 md:p-7 shadow-sm ${
                notice.is_pinned ? "border-black" : "border-gray-200"
              }`}
            >
              <div className="flex items-center gap-2 mb-4">
                {notice.is_pinned && (
                  <div className="inline-flex rounded-full bg-black px-3 py-1 text-xs font-extrabold text-white">
                    상단고정
                  </div>
                )}

                <div className="inline-flex rounded-full bg-gray-100 px-3 py-1 text-xs font-extrabold text-gray-700">
                  {notice.category || "공지"}
                </div>
              </div>

              <h2 className="text-xl md:text-2xl font-extrabold text-gray-950 leading-snug">
                {notice.title}
              </h2>

              <div className="mt-4 text-base md:text-lg text-gray-600 leading-relaxed font-semibold whitespace-pre-line">
                {notice.content}
              </div>
            </article>
          ))}
        </div>

        <div className="mt-8 rounded-3xl bg-black text-white p-6 md:p-7">
          <div className="text-xl font-extrabold">
            문의가 필요하신가요?
          </div>

          <p className="mt-3 text-white/70 font-semibold leading-relaxed">
            주문 관련 문의는 카톡채널로 유튜브 닉네임과 주문자 성함을 함께 남겨주세요.
          </p>
        </div>

      </section>
    </main>
  );
}
