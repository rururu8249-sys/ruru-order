"use client";

// components/admin-live/AdminLiveNoticePanel.tsx
//
// [2026-08-30] 관리자 「📢 공지·쪽지」 — 흩어져 있던 손님 공지를 한자리에 모은다.
//
// 옮겨온 곳: 설정 → 주문서 표시 안의 「📢 접속 팝업 공지」 + 「주문서 공지 문구」
//   설정 패널에서는 같은 항목을 뺐다. 두 화면이 같은 키를 저장하면
//   한쪽에서 고친 걸 다른 쪽 저장이 되돌려버리기 때문이다(설정 저장은 키를 통째로 upsert 한다).
//
// 건드리는 표: settings (아래 NOTICE_KEYS 7개뿐)
//   주문·입금·정산·배송·포인트·Bankda 와 겹치는 칸은 하나도 없다.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { showAdminToast } from "@/lib/adminToast";
import { showAdminConfirm } from "@/lib/adminConfirm";
import { NOTE_PRESETS, safeSearchTerm } from "@/lib/customerNotePresets";
import { noteTimeText } from "@/lib/noteTime";

/** 이 화면이 저장하는 키 — 여기 없는 키는 절대 건드리지 않는다. */
const NOTICE_KEYS = [
  "popup_notice_enabled",
  "popup_notice_title",
  "popup_notice_text",
  "popup_notice_fontsize",
  "popup_notice_color",
  "popup_band_url",
  "notice_text",
] as const;

const DEFAULT_BAND_URL = "https://band.us/@ruru8249";
const clean = (v: unknown) => String(v ?? "").trim();

const FONT_LABEL: Record<string, string> = { normal: "보통", large: "크게", xlarge: "아주 크게" };
const FONT_PX: Record<string, number> = { normal: 14, large: 16, xlarge: 18 };

// [2026-08-30] 공지사항 목록 — /admin/notice 에 있던 기능을 그대로 가져왔다.
//   표(notices)와 동작(등록/수정/삭제/고정/공개/순서)은 하나도 안 바꿨다. 자리만 옮겼다.
type Notice = {
  id: number;
  title: string;
  content: string;
  category: string;
  is_pinned: boolean;
  is_visible: boolean;
  sort_order: number;
};
const EMPTY_NOTICE: Notice = { id: 0, title: "", content: "", category: "공지", is_pinned: false, is_visible: true, sort_order: 0 };

type PanelTab = "customer" | "list" | "send" | "sent";

// 쪽지 보낼 손님 검색 결과
type NoteCustomer = { id: number; youtube_nickname: string | null; customer_name: string | null; customer_phone: string | null };
// 보낸 쪽지 한 줄
type SentNote = {
  id: number; title: string; message: string; customer_phone: string | null; target_session_key: string | null;
  created_at: string; expires_at: string; seen_at: string | null; dismissed_at: string | null;
  revoked_at?: string | null; sent_by: string | null; is_active: boolean;
};

export default function AdminLiveNoticePanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [popupEnabled, setPopupEnabled] = useState(false);
  const [popupTitle, setPopupTitle] = useState("");
  const [popupText, setPopupText] = useState("");
  const [popupFont, setPopupFont] = useState("normal");
  const [popupColor, setPopupColor] = useState("#7B2D43");
  const [popupBandUrl, setPopupBandUrl] = useState(DEFAULT_BAND_URL);
  const [noticeText, setNoticeText] = useState("");

  const [tab, setTab] = useState<PanelTab>("customer");
  const [notices, setNotices] = useState<Notice[]>([]);
  const [form, setForm] = useState<Notice>(EMPTY_NOTICE);
  const [listBusy, setListBusy] = useState(false);

  // ── 쪽지 보내기 ──
  const [q, setQ] = useState("");
  const [found, setFound] = useState<NoteCustomer[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<NoteCustomer[]>([]);
  const [noteText, setNoteText] = useState("");
  const [noteHoursSel, setNoteHoursSel] = useState(12);
  const [sending, setSending] = useState(false);

  // ── 보낸 쪽지 ──
  const [sent, setSent] = useState<SentNote[]>([]);
  const [sentLoading, setSentLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.from("settings").select("key,value").in("key", NOTICE_KEYS as unknown as string[]);
        if (!alive) return;
        if (error) {
          showAdminToast("공지 설정 불러오기 실패\n\n" + error.message, "error");
          return;
        }
        const rows = (data || []) as { key: string; value: string | number | null }[];
        const get = (k: string) => rows.find((r) => r.key === k)?.value;
        setPopupEnabled(clean(get("popup_notice_enabled")) === "true");
        setPopupTitle(String(get("popup_notice_title") ?? ""));
        setPopupText(String(get("popup_notice_text") ?? ""));
        setPopupFont(clean(get("popup_notice_fontsize")) || "normal");
        setPopupColor(clean(get("popup_notice_color")) || "#7B2D43");
        setPopupBandUrl(clean(get("popup_band_url")) || DEFAULT_BAND_URL);
        setNoticeText(String(get("notice_text") ?? ""));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from("settings").upsert(
        [
          { key: "popup_notice_enabled", value: popupEnabled ? "true" : "false" },
          { key: "popup_notice_title", value: popupTitle.trim() },
          { key: "popup_notice_text", value: popupText },
          { key: "popup_notice_fontsize", value: popupFont },
          { key: "popup_notice_color", value: popupColor },
          { key: "popup_band_url", value: popupBandUrl.trim() },
          { key: "notice_text", value: noticeText },
        ],
        { onConflict: "key" },
      );
      if (error) {
        showAdminToast("공지 저장 실패\n\n" + error.message, "error");
        return;
      }
      showAdminToast("공지를 저장했습니다. 손님이 새로 들어오면 보입니다.", "success");
    } finally {
      setSaving(false);
    }
  };

  // ───────── 공지사항 목록 (notices 표) ─────────
  const loadNotices = async () => {
    const { data, error } = await supabase
      .from("notices")
      .select("id,title,content,category,is_pinned,is_visible,sort_order")
      .order("is_pinned", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) {
      showAdminToast("공지 목록 불러오기 실패\n\n" + error.message, "error");
      return;
    }
    setNotices((data || []) as Notice[]);
  };

  useEffect(() => { void loadNotices(); }, []);

  const saveNotice = async () => {
    if (!form.title.trim()) { showAdminToast("공지 제목을 입력해주세요."); return; }
    if (!form.content.trim()) { showAdminToast("공지 내용을 입력해주세요."); return; }
    setListBusy(true);
    try {
      // 새 글이면 맨 뒤 순서로. 기존 글이면 순서를 그대로 둔다(순서는 위/아래 버튼으로만 바뀐다).
      const nextSort = form.id
        ? Number(form.sort_order || 0)
        : Math.max(0, ...notices.map((n) => Number(n.sort_order || 0))) + 1;
      const payload = {
        title: form.title.trim(),
        content: form.content.trim(),
        category: form.category.trim() || "공지",
        is_pinned: form.is_pinned,
        is_visible: form.is_visible,
        sort_order: nextSort,
        updated_at: new Date().toISOString(),
      };
      const { error } = form.id
        ? await supabase.from("notices").update(payload).eq("id", form.id)
        : await supabase.from("notices").insert(payload);
      if (error) {
        showAdminToast((form.id ? "공지 수정 실패" : "공지 등록 실패") + "\n\n" + error.message, "error");
        return;
      }
      showAdminToast(form.id ? "공지를 수정했습니다." : "공지를 등록했습니다.", "success");
      setForm(EMPTY_NOTICE);
      await loadNotices();
    } finally {
      setListBusy(false);
    }
  };

  const deleteNotice = async (n: Notice) => {
    if (!(await showAdminConfirm(`「${n.title}」 공지를 삭제할까요?`))) return;
    const { error } = await supabase.from("notices").delete().eq("id", n.id);
    if (error) { showAdminToast("공지 삭제 실패\n\n" + error.message, "error"); return; }
    if (form.id === n.id) setForm(EMPTY_NOTICE);
    await loadNotices();
  };

  /** 위/아래 — 두 글의 sort_order 를 맞바꾼다(원래 /admin/notice 와 같은 방식). */
  const moveNotice = async (n: Notice, dir: "up" | "down") => {
    const i = notices.findIndex((x) => x.id === n.id);
    if (i < 0) return;
    const j = dir === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= notices.length) return;
    const other = notices[j];
    const a = Number(n.sort_order || i + 1);
    const b = Number(other.sort_order || j + 1);
    setListBusy(true);
    try {
      const r1 = await supabase.from("notices").update({ sort_order: b }).eq("id", n.id);
      if (r1.error) { showAdminToast("순서 변경 실패\n\n" + r1.error.message, "error"); return; }
      const r2 = await supabase.from("notices").update({ sort_order: a }).eq("id", other.id);
      if (r2.error) { showAdminToast("순서 변경 실패\n\n" + r2.error.message, "error"); return; }
      await loadNotices();
    } finally {
      setListBusy(false);
    }
  };

  /** 고정·공개 토글 — 한 칸만 바꾼다 */
  const toggleNotice = async (n: Notice, field: "is_pinned" | "is_visible") => {
    const { error } = await supabase.from("notices").update({ [field]: !n[field] }).eq("id", n.id);
    if (error) { showAdminToast("변경 실패\n\n" + error.message, "error"); return; }
    await loadNotices();
  };

  // ───────── 쪽지 보내기 ─────────
  const searchCustomers = async () => {
    const term = safeSearchTerm(q);
    if (!term) { setFound([]); return; }
    setSearching(true);
    try {
      // 닉네임 / 이름 / 전화번호 중 아무거나 걸리면 나온다. 표시 전용(SELECT만).
      const { data, error } = await supabase
        .from("customers")
        .select("id,youtube_nickname,customer_name,customer_phone")
        .or(`youtube_nickname.ilike.%${term}%,customer_name.ilike.%${term}%,customer_phone.ilike.%${term}%`)
        .order("last_order_at", { ascending: false, nullsFirst: false })
        .limit(40);
      if (error) { showAdminToast("손님 검색 실패\n\n" + error.message, "error"); return; }
      setFound((data || []) as NoteCustomer[]);
    } finally {
      setSearching(false);
    }
  };

  const togglePick = (c: NoteCustomer) => {
    setPicked((prev) => (prev.some((p) => p.id === c.id) ? prev.filter((p) => p.id !== c.id) : [...prev, c]));
  };

  const sendNotes = async () => {
    const msg = noteText.trim();
    if (picked.length === 0) { showAdminToast("보낼 손님을 골라주세요.", "warning"); return; }
    if (!msg) { showAdminToast("보낼 내용을 적어주세요.", "warning"); return; }

    const noPhone = picked.filter((p) => !String(p.customer_phone || "").replace(/[^0-9]/g, ""));
    const nameOf = (c: NoteCustomer) => String(c.youtube_nickname || c.customer_name || "이름없음").trim();
    const who = picked.length === 1 ? `「${nameOf(picked[0])}」님` : `${picked.length}명`;
    const warn = noPhone.length > 0 ? `\n\n※ ${noPhone.length}명은 전화번호가 없어 보낼 수 없습니다.` : "";
    if (!(await showAdminConfirm(`${who}에게 쪽지를 보낼까요?\n\n${msg.slice(0, 80)}${msg.length > 80 ? "…" : ""}${warn}`))) return;

    setSending(true);
    try {
      const res = await fetch("/api/admin-live/customer-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          targets: picked.map((p) => ({ phone: p.customer_phone })),
          message: msg,
          hours: noteHoursSel,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) throw new Error(j?.message || `요청 실패(${res.status})`);
      const parts = [`${j.sent || 0}명에게 보냈습니다.`];
      if (j.skipped) parts.push(`${j.skipped}명은 방금 같은 쪽지를 이미 받아서 건너뛰었습니다.`);
      showAdminToast(parts.join("\n"), (j.sent || 0) > 0 ? "success" : "warning");
      setNoteText("");
      setPicked([]);
      void loadSent();
    } catch (e) {
      showAdminToast("쪽지 발송 실패\n\n" + (e instanceof Error ? e.message : String(e)), "error");
    } finally {
      setSending(false);
    }
  };

  // ───────── 보낸 쪽지 ─────────
  const loadSent = async () => {
    setSentLoading(true);
    try {
      const res = await fetch("/api/admin-live/customer-note?limit=80", { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) { showAdminToast("보낸 쪽지 불러오기 실패\n\n" + (j?.message || res.status), "error"); return; }
      setSent((j.notes || []) as SentNote[]);
    } finally {
      setSentLoading(false);
    }
  };

  useEffect(() => { if (tab === "sent") void loadSent(); }, [tab]);

  const revokeNote = async (n: SentNote) => {
    const seenWarn = n.seen_at ? "\n\n⚠️ 손님이 이미 읽은 쪽지입니다. 화면에서는 내려가지만 이미 봤습니다." : "";
    if (!(await showAdminConfirm(`이 쪽지를 회수할까요?${seenWarn}`))) return;
    try {
      const res = await fetch("/api/admin-live/customer-note", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ id: n.id }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) throw new Error(j?.message || `요청 실패(${res.status})`);
      showAdminToast(j.alreadySeen ? "회수했습니다. 다만 손님이 이미 읽었습니다." : "회수했습니다.", j.alreadySeen ? "warning" : "success");
      void loadSent();
    } catch (e) {
      showAdminToast("회수 실패\n\n" + (e instanceof Error ? e.message : String(e)), "error");
    }
  };

  const card = "rounded-[20px] border border-line bg-surface-2 p-4";
  const input = "mt-1 h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm font-bold text-ink outline-none focus:border-rose-deep";
  const label = "text-xs font-black text-ink-soft";
  const help = "mt-1 block text-[11px] font-bold leading-5 text-ink-mute";

  // 미리보기 — 손님 팝업이 --- 를 가로줄로 바꿔 보여주는 것과 같은 방식
  const previewBlocks = popupText.split(/\n/).reduce<string[][]>((acc, line) => {
    if (line.trim() === "---") acc.push([]);
    else acc[acc.length - 1].push(line);
    return acc;
  }, [[]]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 탭 — 손님에게 보이는 공지 / 공지사항 목록 */}
      <div className="flex shrink-0 gap-2 border-b border-line bg-surface px-5 py-3">
        {([
          { key: "customer", label: "📢 손님 화면 공지", desc: "접속 팝업 · 상시 안내" },
          { key: "list", label: "📋 공지사항 목록", desc: "등록 · 고정 · 순서" },
          { key: "send", label: "📩 쪽지 보내기", desc: "검색 · 여러 명 한 번에" },
          { key: "sent", label: "📤 보낸 쪽지", desc: "읽음 확인 · 회수" },
        ] as { key: PanelTab; label: string; desc: string }[]).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-xl px-4 py-2 text-left transition ${tab === t.key ? "bg-rose-deep text-white" : "border border-line bg-surface text-ink-soft hover:bg-surface-2"}`}
          >
            <span className="block text-[13px] font-black">{t.label}</span>
            <span className={`block text-[10px] font-bold ${tab === t.key ? "text-white/70" : "text-ink-mute"}`}>{t.desc}</span>
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {tab === "customer" ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
          {/* ─────────── 왼쪽: 입력 ─────────── */}
          <div className="space-y-4">
            {/* 접속 팝업 공지 */}
            <div className={card}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-black text-ink">📢 접속 팝업 공지</div>
                  <div className="mt-1 text-xs font-bold leading-5 text-ink-mute">
                    손님이 사이트에 들어오자마자 뜨는 팝업입니다. 밴드 바로가기 + 24시간 안 보기 + 확인 버튼이 같이 나옵니다.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPopupEnabled((v) => !v)}
                  className={`shrink-0 rounded-full px-4 py-2 text-xs font-black transition ${popupEnabled ? "bg-rose-deep text-white" : "border border-line bg-surface text-ink-soft"}`}
                >
                  {popupEnabled ? "팝업 ON" : "팝업 OFF"}
                </button>
              </div>

              <label className="mt-3 block">
                <span className={label}>제목 (팝업 위 색상 띠 글씨)</span>
                <input
                  value={popupTitle}
                  onChange={(e) => setPopupTitle(e.target.value)}
                  placeholder="예) 📢 중요 공지  ·  비우면 제목 띠 없이 본문만 표시"
                  className={input}
                />
                <span className={help}>본문에 제목을 또 쓰면 두 번 나옵니다.</span>
              </label>

              <div className="mt-3">
                <div className="flex items-center justify-between gap-2">
                  <span className={label}>팝업 문구 (본문 · 줄바꿈 가능)</span>
                  <button
                    type="button"
                    onClick={() => setPopupText((prev) => (prev.endsWith("\n") || prev === "" ? prev : prev + "\n") + "---\n")}
                    className="shrink-0 rounded-full border border-line bg-surface px-3 py-1 text-[11px] font-black text-ink-soft"
                  >
                    ─ 구분선 넣기
                  </button>
                </div>
                <textarea
                  value={popupText}
                  onChange={(e) => setPopupText(e.target.value)}
                  placeholder={"예) 👜 롱샴 7/27(월) 출고완료\n---\n💄 향수&화장품 7/27(월)~ 업체 순차출고"}
                  rows={6}
                  className="mt-1 w-full resize-none rounded-xl border border-line bg-surface p-3 text-sm font-bold leading-relaxed text-ink outline-none focus:border-rose-deep"
                />
                <span className={help}>
                  한 줄에 <b className="text-ink-soft">---</b> 만 쓰면 손님 팝업에서 그 자리에 가로 구분선이 그어집니다.
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="block">
                  <span className={label}>글자 크기</span>
                  <select value={popupFont} onChange={(e) => setPopupFont(e.target.value)} className={input}>
                    <option value="normal">보통</option>
                    <option value="large">크게</option>
                    <option value="xlarge">아주 크게</option>
                  </select>
                </label>
                <label className="block">
                  <span className={label}>강조 색상 (제목·확인 버튼)</span>
                  <select value={popupColor} onChange={(e) => setPopupColor(e.target.value)} className={input}>
                    <option value="#7B2D43">딥로즈</option>
                    <option value="#0F6E56">초록</option>
                    <option value="#185FA5">파랑</option>
                    <option value="#1A1A1A">검정</option>
                    <option value="#C0392B">빨강</option>
                  </select>
                </label>
              </div>

              <label className="mt-3 block">
                <span className={label}>밴드 바로가기 주소</span>
                <input value={popupBandUrl} onChange={(e) => setPopupBandUrl(e.target.value)} placeholder={DEFAULT_BAND_URL} className={input} />
                <span className={help}>비우면 밴드 버튼이 숨겨집니다.</span>
              </label>
            </div>

            {/* 상시 안내 문구 */}
            <div className={card}>
              <div className="text-sm font-black text-ink">📌 쇼핑 전 꼭 확인 (상시 안내)</div>
              <div className="mt-1 text-xs font-bold leading-5 text-ink-mute">
                손님 <b className="text-ink-soft">쪽지함 맨 위</b>에 항상 보이는 안내입니다. 사이즈 오차·교환반품 비용처럼
                <b className="text-ink-soft"> 늘 해당되는 내용</b>을 넣으세요. 비우면 안 보입니다.
              </div>
              <textarea
                value={noticeText}
                onChange={(e) => setNoticeText(e.target.value)}
                placeholder={"예) 사이즈는 측정 방법에 따라 차이가 있어 100% 정확하지 않을 수 있습니다.\n단순 변심 교환·반품 시 택배비를 포함해 10,000원의 비용이 발생할 수 있습니다."}
                rows={4}
                className="mt-3 w-full resize-none rounded-xl border border-line bg-surface p-3 text-sm font-bold leading-relaxed text-ink outline-none focus:border-rose-deep"
              />
              <div className="mt-2 rounded-xl border border-line bg-warn-bg px-3 py-2 text-[11px] font-bold leading-5 text-warn-tx">
                예전엔 「설정 → 주문서 표시 → 주문서 공지 문구」였습니다. 같은 내용이고, 여기서 고치면 됩니다.
              </div>
            </div>
          </div>

          {/* ─────────── 오른쪽: 미리보기 ─────────── */}
          <div className="lg:sticky lg:top-0 lg:self-start">
            <div className="rounded-[20px] border border-line bg-surface-2 p-4">
              <div className="text-sm font-black text-ink">👀 손님 화면 미리보기</div>
              <div className="mt-1 text-[11px] font-bold text-ink-mute">저장 전 모습입니다. 실제 반영은 저장 후.</div>

              <div className="mt-3 rounded-2xl bg-slate-900/70 p-4">
                {popupEnabled && popupText.trim() ? (
                  <div className="overflow-hidden rounded-2xl bg-white shadow-lg">
                    {popupTitle.trim() ? (
                      <div className="px-4 py-2.5 text-center text-[13px] font-black text-white" style={{ background: popupColor }}>
                        {popupTitle}
                      </div>
                    ) : null}
                    <div className="px-4 py-4">
                      {previewBlocks.map((block, i) => (
                        <div key={i}>
                          {i > 0 ? <div className="my-3 border-t border-slate-200" /> : null}
                          <p
                            className="whitespace-pre-line text-center font-bold leading-relaxed text-slate-700"
                            style={{ fontSize: `${FONT_PX[popupFont] ?? 14}px` }}
                          >
                            {block.join("\n").trim()}
                          </p>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-2 px-4 pb-4">
                      {popupBandUrl.trim() ? (
                        <div className="rounded-xl bg-[#00C73C] py-2.5 text-center text-[13px] font-black text-white">🟢 밴드 바로가기</div>
                      ) : null}
                      <div className="rounded-xl py-2.5 text-center text-[13px] font-black text-white" style={{ background: popupColor }}>확인</div>
                      <div className="pt-1 text-center text-[11px] font-bold text-slate-400">24시간 동안 열지 않기</div>
                    </div>
                  </div>
                ) : (
                  <div className="py-10 text-center text-xs font-bold text-white/60">
                    {popupEnabled ? "본문이 비어 있어 팝업이 안 뜹니다." : "팝업 OFF — 손님에게 안 뜹니다."}
                  </div>
                )}
              </div>

              <div className="mt-3 text-[11px] font-black text-ink-soft">쪽지함 맨 위</div>
              <div className="mt-1 rounded-2xl border border-rose-line bg-rose-soft/40 p-3">
                {noticeText.trim() ? (
                  <>
                    <div className="text-[11px] font-black text-ink-mute">📌 쇼핑 전 꼭 확인</div>
                    <p className="mt-1 whitespace-pre-line text-[12px] font-bold leading-5 text-ink-soft">{noticeText}</p>
                  </>
                ) : (
                  <div className="py-4 text-center text-[11px] font-bold text-ink-mute">비어 있어 안 보입니다.</div>
                )}
              </div>
            </div>
          </div>
        </div>
        ) : tab === "list" ? (
        /* ───────── 공지사항 목록 ───────── */
        <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
          {/* 쓰기 */}
          <div className={`${card} lg:sticky lg:top-0 lg:self-start`}>
            <div className="text-sm font-black text-ink">{form.id ? "✏️ 공지 수정" : "➕ 새 공지 쓰기"}</div>
            <div className="mt-1 text-xs font-bold leading-5 text-ink-mute">
              손님 <b className="text-ink-soft">쪽지함</b>과 <b className="text-ink-soft">공지사항 페이지</b>에 함께 나옵니다.
            </div>

            <label className="mt-3 block">
              <span className={label}>제목</span>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="예) 추석 연휴 배송 안내" className={input} />
            </label>

            <label className="mt-3 block">
              <span className={label}>내용</span>
              <textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                rows={6}
                placeholder="줄바꿈 그대로 손님에게 보입니다."
                className="mt-1 w-full resize-none rounded-xl border border-line bg-surface p-3 text-sm font-bold leading-relaxed text-ink outline-none focus:border-rose-deep"
              />
            </label>

            <label className="mt-3 block">
              <span className={label}>분류</span>
              <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="공지" className={input} />
            </label>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setForm({ ...form, is_pinned: !form.is_pinned })}
                className={`rounded-xl px-3 py-2 text-xs font-black transition ${form.is_pinned ? "bg-rose-deep text-white" : "border border-line bg-surface text-ink-soft"}`}
              >
                {form.is_pinned ? "📌 상단 고정" : "고정 안 함"}
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...form, is_visible: !form.is_visible })}
                className={`rounded-xl px-3 py-2 text-xs font-black transition ${form.is_visible ? "bg-rose-deep text-white" : "border border-line bg-surface text-ink-soft"}`}
              >
                {form.is_visible ? "👁 공개" : "🙈 숨김"}
              </button>
            </div>

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={saveNotice}
                disabled={listBusy}
                className="flex-1 rounded-xl bg-rose-deep px-4 py-2.5 text-sm font-black text-white transition disabled:opacity-50"
              >
                {form.id ? "수정 저장" : "공지 등록"}
              </button>
              {form.id ? (
                <button type="button" onClick={() => setForm(EMPTY_NOTICE)} className="rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-black text-ink-soft">
                  취소
                </button>
              ) : null}
            </div>
          </div>

          {/* 목록 */}
          <div className="space-y-2">
            {notices.length === 0 ? (
              <div className={`${card} py-14 text-center text-sm font-bold text-ink-mute`}>등록된 공지가 없습니다.</div>
            ) : (
              notices.map((n, i) => (
                <div key={n.id} className={`rounded-[18px] border p-4 ${n.is_visible ? "border-line bg-surface" : "border-line bg-surface-2 opacity-60"}`}>
                  <div className="flex items-start gap-2">
                    <span className="text-base">{n.is_pinned ? "📌" : "📢"}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[14px] font-black text-ink">{n.title}</span>
                        {n.is_pinned ? <span className="rounded-full bg-rose-deep px-2 py-0.5 text-[10px] font-black text-white">고정</span> : null}
                        {!n.is_visible ? <span className="rounded-full border border-line px-2 py-0.5 text-[10px] font-black text-ink-mute">숨김</span> : null}
                        <span className="rounded-full border border-line px-2 py-0.5 text-[10px] font-black text-ink-mute">{n.category || "공지"}</span>
                      </div>
                      <p className="mt-1.5 whitespace-pre-line text-[12.5px] font-bold leading-6 text-ink-soft">{n.content}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <button type="button" onClick={() => moveNotice(n, "up")} disabled={i === 0 || listBusy} className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11px] font-black text-ink-soft disabled:opacity-30">↑ 위로</button>
                    <button type="button" onClick={() => moveNotice(n, "down")} disabled={i === notices.length - 1 || listBusy} className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11px] font-black text-ink-soft disabled:opacity-30">↓ 아래로</button>
                    <button type="button" onClick={() => toggleNotice(n, "is_pinned")} className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11px] font-black text-ink-soft">{n.is_pinned ? "고정 풀기" : "📌 상단 고정"}</button>
                    <button type="button" onClick={() => toggleNotice(n, "is_visible")} className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11px] font-black text-ink-soft">{n.is_visible ? "🙈 숨기기" : "👁 공개하기"}</button>
                    <button type="button" onClick={() => setForm(n)} className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11px] font-black text-ink-soft">✏️ 수정</button>
                    <button type="button" onClick={() => deleteNotice(n)} className="ml-auto rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11px] font-black text-danger-tx">🗑 삭제</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        ) : tab === "send" ? (
        /* ───────── 쪽지 보내기 ───────── */
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          {/* 왼쪽: 손님 고르기 */}
          <div className={card}>
            <div className="text-sm font-black text-ink">① 받을 손님 고르기</div>
            <div className="mt-1 text-xs font-bold leading-5 text-ink-mute">닉네임 · 이름 · 전화번호 아무거나로 찾습니다.</div>
            <div className="mt-3 flex gap-2">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void searchCustomers(); }}
                placeholder="예) 루루짱  ·  임언냐  ·  01028495209"
                className="h-10 flex-1 rounded-xl border border-line bg-surface px-3 text-sm font-bold text-ink outline-none focus:border-rose-deep"
              />
              <button type="button" onClick={() => void searchCustomers()} disabled={searching}
                className="shrink-0 rounded-xl bg-rose-deep px-4 text-sm font-black text-white disabled:opacity-50">
                {searching ? "찾는 중" : "🔍 찾기"}
              </button>
            </div>

            {picked.length > 0 ? (
              <div className="mt-3 rounded-xl border border-rose-line bg-rose-soft/40 p-2.5">
                <div className="text-[11px] font-black text-ink-soft">받을 손님 {picked.length}명</div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {picked.map((c) => (
                    <button key={c.id} type="button" onClick={() => togglePick(c)}
                      className="rounded-full bg-rose-deep px-2.5 py-1 text-[11px] font-black text-white">
                      {String(c.youtube_nickname || c.customer_name || "이름없음")} ✕
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => setPicked([])} className="mt-2 text-[11px] font-black text-ink-mute underline">전부 지우기</button>
              </div>
            ) : null}

            <div className="mt-3 max-h-[340px] space-y-1.5 overflow-y-auto">
              {found.length === 0 ? (
                <div className="py-10 text-center text-xs font-bold text-ink-mute">
                  {q.trim() ? "찾은 손님이 없습니다." : "위에서 손님을 찾아주세요."}
                </div>
              ) : found.map((c) => {
                const on = picked.some((p) => p.id === c.id);
                const phone = String(c.customer_phone || "").replace(/[^0-9]/g, "");
                return (
                  <button key={c.id} type="button" onClick={() => togglePick(c)} disabled={!phone}
                    className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left transition ${on ? "border-rose-deep bg-rose-soft/60" : "border-line bg-surface"} ${!phone ? "opacity-40" : ""}`}>
                    <span className="text-sm">{on ? "☑️" : "⬜"}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-black text-ink">{String(c.youtube_nickname || c.customer_name || "이름없음")}</span>
                      <span className="block text-[11px] font-bold text-ink-mute">
                        {c.customer_name && c.youtube_nickname ? `${c.customer_name} · ` : ""}{c.customer_phone || "전화번호 없음 — 못 보냄"}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 오른쪽: 내용 쓰기 */}
          <div className={card}>
            <div className="text-sm font-black text-ink">② 보낼 내용</div>
            <div className="mt-1 text-xs font-bold leading-5 text-ink-mute">
              손님이 사이트에 들어오면 팝업으로 뜨고, 놓쳐도 쪽지함에 남습니다.
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {NOTE_PRESETS.map((pre) => (
                <button key={pre.label} type="button" onClick={() => setNoteText(pre.text)}
                  className="rounded-full border border-line bg-surface px-3 py-1.5 text-[11px] font-black text-ink-soft hover:bg-surface-2">
                  {pre.label}
                </button>
              ))}
            </div>

            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={7}
              maxLength={500}
              placeholder="자주 쓰는 문구를 누르거나 직접 쓰세요."
              className="mt-3 w-full resize-none rounded-xl border border-line bg-surface p-3 text-sm font-bold leading-relaxed text-ink outline-none focus:border-rose-deep"
            />
            <div className="mt-1 text-right text-[11px] font-bold text-ink-mute">{noteText.length} / 500자</div>

            <label className="mt-2 block">
              <span className={label}>쪽지함에 남는 기간</span>
              <select value={noteHoursSel} onChange={(e) => setNoteHoursSel(Number(e.target.value))} className={input}>
                <option value={6}>6시간</option>
                <option value={12}>12시간 (기본)</option>
                <option value={24}>24시간</option>
                <option value={48}>2일</option>
                <option value={72}>3일</option>
              </select>
            </label>

            <button type="button" onClick={() => void sendNotes()} disabled={sending || picked.length === 0 || !noteText.trim()}
              className="mt-4 h-12 w-full rounded-2xl bg-rose-deep text-[15px] font-black text-white transition disabled:opacity-40">
              {sending ? "보내는 중…" : picked.length > 0 ? `📩 ${picked.length}명에게 보내기` : "받을 손님을 먼저 고르세요"}
            </button>
            <div className="mt-2 rounded-xl border border-line bg-warn-bg px-3 py-2 text-[11px] font-bold leading-5 text-warn-tx">
              같은 손님에게 같은 내용을 <b>10분 안에 또 보내면 한 번만</b> 갑니다. 실수로 두 번 눌러도 손님에게 두 번 뜨지 않습니다.
            </div>
          </div>
        </div>
        ) : (
        /* ───────── 보낸 쪽지 ───────── */
        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-black text-ink">📤 보낸 쪽지</div>
              <div className="mt-0.5 text-xs font-bold text-ink-mute">누구에게 · 언제 · 읽었는지. 잘못 보낸 건 회수합니다.</div>
            </div>
            <button type="button" onClick={() => void loadSent()} disabled={sentLoading}
              className="shrink-0 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-black text-ink-soft disabled:opacity-50">
              {sentLoading ? "불러오는 중" : "🔄 새로고침"}
            </button>
          </div>

          {sent.length === 0 ? (
            <div className={`${card} py-14 text-center text-sm font-bold text-ink-mute`}>
              {sentLoading ? "불러오는 중…" : "보낸 쪽지가 없습니다."}
            </div>
          ) : (
            <div className="space-y-2">
              {sent.map((n) => {
                const revoked = Boolean(n.revoked_at) || (!n.is_active && !n.dismissed_at);
                const expired = new Date(n.expires_at).getTime() < Date.now();
                return (
                  <div key={n.id} className={`rounded-[18px] border p-4 ${revoked ? "border-line bg-surface-2 opacity-60" : "border-line bg-surface"}`}>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[13px] font-black text-ink">{n.customer_phone || String(n.target_session_key || "").replace(/^phone:/, "") || "대상 미상"}</span>
                      {n.seen_at
                        ? <span className="rounded-full bg-ok-bg px-2 py-0.5 text-[10px] font-black text-ok-tx">읽음</span>
                        : <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-black text-white">안 읽음</span>}
                      {revoked ? <span className="rounded-full border border-line px-2 py-0.5 text-[10px] font-black text-ink-mute">회수됨</span> : null}
                      {!revoked && expired ? <span className="rounded-full border border-line px-2 py-0.5 text-[10px] font-black text-ink-mute">기간 지남</span> : null}
                      {n.dismissed_at ? <span className="rounded-full border border-line px-2 py-0.5 text-[10px] font-black text-ink-mute">손님이 닫음</span> : null}
                    </div>
                    <p className="mt-1.5 whitespace-pre-line text-[12.5px] font-bold leading-6 text-ink-soft">{n.message}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold text-ink-mute">
                      <span>보낸 날짜 {noteTimeText(n.created_at)}</span>
                      {n.seen_at ? <span>읽은 날짜 {noteTimeText(n.seen_at)}</span> : null}
                      {n.sent_by ? <span>보낸 사람 {n.sent_by}</span> : null}
                      {!revoked ? (
                        <button type="button" onClick={() => void revokeNote(n)}
                          className="ml-auto rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11px] font-black text-danger-tx">
                          ↩︎ 회수
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        )}
      </div>

      {/* 하단 저장바 — 손님 화면 공지 탭에서만. 목록 탭은 항목마다 바로 저장된다. */}
      {tab === "customer" ? (
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line bg-surface px-5 py-3">
          <span className="text-xs font-bold text-ink-mute">
            {loading ? "불러오는 중..." : "저장하면 손님이 새로 들어올 때부터 보입니다."}
          </span>
          <button
            type="button"
            onClick={save}
            disabled={saving || loading}
            className="rounded-full bg-rose-deep px-6 py-2.5 text-sm font-black text-white transition disabled:opacity-50"
          >
            {saving ? "저장 중..." : "공지 저장"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
