"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { loadPublicNotices, type PublicNotice } from "@/lib/publicNoticeBoard";

const buttonStyle = "min-h-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 disabled:opacity-40 active:bg-slate-100";
const dateText = (value: string) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Seoul" }) : "";
};

export default function PublicNoticeBoard({ selectedId, onSelect, requestKey = 0 }: {
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  requestKey?: number;
}) {
  const [notices, setNotices] = useState<PublicNotice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [article, setArticle] = useState<{ id: number; key: number; data: PublicNotice | null; loading: boolean } | null>(null);
  const top = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    setLoading(true); setError(false);
    void loadPublicNotices(supabase).then((rows) => {
      if (active) setNotices(rows);
    }).catch(() => {
      if (active) { setNotices([]); setError(true); }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]);

  useEffect(() => {
    if (selectedId === null) { setArticle(null); return; }
    let active = true;
    setArticle({ id: selectedId, key: requestKey, data: null, loading: true });
    void (async () => {
      let data: PublicNotice | null = null;
      try {
        const result = await supabase.from("notices")
          .select("id,title,content,created_at,is_pinned,is_visible")
          .eq("id", selectedId).eq("is_visible", true).maybeSingle();
        if (!result.error && result.data?.id === selectedId && result.data.is_visible === true) data = result.data;
      } catch { /* Failure must not leave an older article visible. */ }
      if (active) setArticle({ id: selectedId, key: requestKey, data, loading: false });
    })();
    return () => { active = false; };
  }, [selectedId, requestKey]);

  const filtered = notices.filter(n => `${n.title}\n${n.content}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const pages = Math.max(1, Math.ceil(filtered.length / 10));
  const currentPage = Math.min(page, pages);
  const shown = filtered.slice((currentPage - 1) * 10, currentPage * 10);
  const index = filtered.findIndex(n => n.id === selectedId);
  const previous = index > 0 ? filtered[index - 1] : null;
  const next = index >= 0 ? filtered[index + 1] : null;
  const current = article?.id === selectedId && article.key === requestKey ? article : null;
  const move = (id: number | null) => {
    onSelect(id);
    top.current?.scrollIntoView({ block: "start", behavior: "instant" });
    top.current?.focus({ preventScroll: true });
  };

  return <div ref={top} tabIndex={-1} className="min-w-0 outline-none">
    {selectedId !== null ? <article className="mb-5 border-b border-slate-200 pb-4">
      {!current || current.loading ? <p role="status" className="py-6 text-sm">공지를 불러오는 중…</p> : current.data ? <>
        <h3 className="break-words text-lg font-bold text-slate-950">{current.data.title}</h3>
        <p className="mt-2 text-xs text-slate-500">{dateText(current.data.created_at)}</p>
        <p className="my-5 whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">{current.data.content}</p>
      </> : <p role="alert" className="py-6 text-sm text-slate-600">공지를 찾을 수 없어요. 삭제·비공개 상태이거나 연결을 확인해야 합니다.</p>}
      <nav aria-label="공지 본문 이동" className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={buttonStyle} disabled={!previous || loading || error} onClick={() => previous && move(previous.id)}>이전글</button>
        <button type="button" className={buttonStyle} disabled={!next || loading || error} onClick={() => next && move(next.id)}>다음글</button>
        <button type="button" className={`${buttonStyle} ml-auto`} onClick={() => move(null)}>목록</button>
      </nav>
    </article> : null}

    {loading ? <p role="status" className="py-6 text-sm text-slate-500">공지 목록을 불러오는 중…</p> : error ? <div role="alert" className="py-6 text-sm">
      <p className="mb-3">공지 목록을 불러오지 못했어요.</p>
      <button type="button" className={buttonStyle} onClick={() => setRetry(n => n + 1)}>다시 불러오기</button>
    </div> : <>
      <p className="mb-2 text-xs text-slate-500">공지 {filtered.length}개{query ? ` · 검색: ${query}` : ""}</p>
      <ul aria-label="공지 목록" className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
        {shown.map((notice, i) => <li key={notice.id}>
          <button type="button" aria-label={`${notice.title} 읽기`} onClick={() => move(notice.id)} className={`flex w-full items-start gap-3 px-3 py-3 text-left active:bg-slate-50 ${selectedId === notice.id ? "bg-rose-50" : ""}`}>
            <span className="w-8 shrink-0 pt-0.5 text-center text-xs font-bold text-[#7B2D43]">{notice.is_pinned ? "고정" : (currentPage - 1) * 10 + i + 1}</span>
            <span className="min-w-0 flex-1"><span className="block break-words text-sm font-bold text-slate-900">{notice.title}</span><span className="mt-1 block text-xs text-slate-500">{dateText(notice.created_at)}</span></span>
          </button>
        </li>)}
      </ul>
      {!shown.length ? <p role="status" className="py-6 text-center text-sm text-slate-500">{query ? "검색 결과가 없어요." : "등록된 공지가 없어요."}</p> : null}
      <form role="search" aria-label="공지 검색" onSubmit={e => { e.preventDefault(); setQuery(input.trim()); setPage(1); onSelect(null); }} className="mt-4 flex gap-2">
        <input aria-label="공지 제목 또는 내용" placeholder="제목 또는 내용 검색" value={input} onChange={e => setInput(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" />
        <button className={buttonStyle} type="submit">검색</button>
        {query ? <button className={buttonStyle} type="button" onClick={() => { setInput(""); setQuery(""); setPage(1); onSelect(null); }}>초기화</button> : null}
      </form>
      {pages > 1 ? <nav aria-label="공지 목록 페이지" className="mt-4 flex flex-wrap justify-center gap-1">
        <button type="button" className={buttonStyle} disabled={currentPage === 1} onClick={() => { setPage(currentPage - 1); move(null); }}>이전</button>
        {Array.from({ length: Math.min(5, pages) }, (_, i) => Math.max(1, Math.min(currentPage - 2, pages - 4)) + i).map(number => <button key={number} type="button" aria-label={`${number}페이지`} aria-current={number === currentPage ? "page" : undefined} className={`${buttonStyle} ${number === currentPage ? "!border-[#7B2D43] !bg-[#7B2D43] !text-white" : ""}`} onClick={() => { setPage(number); move(null); }}>{number}</button>)}
        <button type="button" className={buttonStyle} disabled={currentPage === pages} onClick={() => { setPage(currentPage + 1); move(null); }}>다음</button>
      </nav> : null}
    </>}
  </div>;
}
