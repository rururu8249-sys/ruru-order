"use client";

import { showAdminConfirm } from "@/lib/adminConfirm";
import { showAdminToast } from "@/lib/adminToast";

// app/admin/notice/page.tsx
// 전체 교체용
// 파일 위치:
// /Users/ruru/Desktop/ruru-order-app/app/admin/notice/page.tsx
//
// 기능:
// - 관리자 공지관리
// - 공지사항 등록/수정/삭제
// - 공지 공개/숨김
// - 상단고정 설정
// - 팝업공지 수정
// - 팝업 ON/OFF
// - 팝업 크기 조절: 작게 / 보통 / 크게
// - 공지 순서변경: 위로 / 아래로
//
// 수정:
// - 관리자 공지관리 글씨 대비 강화
// - 입력칸/카드/버튼 글씨 진하게 표시


import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const ADMIN_PASSWORD = "8249";

type Notice = {
  id: number;
  title: string;
  content: string;
  category: string;
  is_pinned: boolean;
  is_visible: boolean;
  sort_order: number;
};

type PopupNotice = {
  id: number;
  title: string;
  content: string;
  is_enabled: boolean;
  popup_size?: "compact" | "normal" | "large";
};

const emptyNotice = {
  id: 0,
  title: "",
  content: "",
  category: "공지",
  is_pinned: false,
  is_visible: true,
  sort_order: 0,
};

export default function AdminNoticePage() {
  const [isAuthed, setIsAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [notices, setNotices] = useState<Notice[]>([]);
  const [noticeForm, setNoticeForm] = useState<Notice>(emptyNotice);
  const [popup, setPopup] = useState<PopupNotice>({
    id: 1,
    title: "주문 전 필수 확인",
    content: "",
    is_enabled: true,
    popup_size: "compact",
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.body.classList.remove("customer-security-lock");

    const saved = sessionStorage.getItem("ruru_admin_login");

    if (saved === "Y") {
      setIsAuthed(true);
      loadAll();
    }
  }, []);

  const login = () => {
    if (password !== ADMIN_PASSWORD) {
      showAdminToast("관리자 비밀번호가 틀렸습니다.");
      return;
    }

    sessionStorage.setItem("ruru_admin_login", "Y");
    setIsAuthed(true);
    loadAll();
  };

  const loadAll = async () => {
    setLoading(true);
    await Promise.all([loadNotices(), loadPopup()]);
    setLoading(false);
  };

  const normalizeNoticeSortOrder = async (list: Notice[]) => {
    const needsNormalize = list.some((notice, index) => {
      return !notice.sort_order || notice.sort_order === 0 || notice.sort_order !== index + 1;
    });

    if (!needsNormalize) return list;

    const updates = list.map((notice, index) =>
      supabase
        .from("notices")
        .update({ sort_order: index + 1 })
        .eq("id", notice.id)
    );

    await Promise.all(updates);

    return list.map((notice, index) => ({
      ...notice,
      sort_order: index + 1,
    }));
  };

  const loadNotices = async () => {
    const { data, error } = await supabase
      .from("notices")
      .select("*")
      .order("is_pinned", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) {
      showAdminToast("공지 불러오기 실패\n" + error.message);
      return;
    }

    const sorted = data || [];
    const normalized = await normalizeNoticeSortOrder(sorted);

    setNotices(normalized);
  };

  const loadPopup = async () => {
    const { data, error } = await supabase
      .from("popup_notice")
      .select("*")
      .eq("id", 1)
      .single();

    if (error) return;

    if (data) {
      setPopup({
        ...data,
        popup_size: data.popup_size || "compact",
      });
    }
  };

  const saveNotice = async () => {
    if (!noticeForm.title.trim()) {
      showAdminToast("공지 제목을 입력해주세요.");
      return;
    }

    if (!noticeForm.content.trim()) {
      showAdminToast("공지 내용을 입력해주세요.");
      return;
    }

    const nextSortOrder =
      noticeForm.id
        ? Number(noticeForm.sort_order || 0)
        : Math.max(0, ...notices.map((notice) => Number(notice.sort_order || 0))) + 1;

    const payload = {
      title: noticeForm.title.trim(),
      content: noticeForm.content.trim(),
      category: noticeForm.category.trim() || "공지",
      is_pinned: noticeForm.is_pinned,
      is_visible: noticeForm.is_visible,
      sort_order: nextSortOrder,
      updated_at: new Date().toISOString(),
    };

    if (noticeForm.id) {
      const { error } = await supabase
        .from("notices")
        .update(payload)
        .eq("id", noticeForm.id);

      if (error) {
        showAdminToast("공지 수정 실패\n" + error.message);
        return;
      }

      showAdminToast("공지 수정 완료");
    } else {
      const { error } = await supabase.from("notices").insert(payload);

      if (error) {
        showAdminToast("공지 등록 실패\n" + error.message);
        return;
      }

      showAdminToast("공지 등록 완료");
    }

    setNoticeForm(emptyNotice);
    loadNotices();
  };

  const editNotice = (notice: Notice) => {
    setNoticeForm(notice);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteNotice = async (id: number) => {
    if (!(await showAdminConfirm("공지글을 삭제할까요?"))) return;

    const { error } = await supabase.from("notices").delete().eq("id", id);

    if (error) {
      showAdminToast("공지 삭제 실패\n" + error.message);
      return;
    }

    loadNotices();
  };

  const moveNotice = async (notice: Notice, direction: "up" | "down") => {
    const currentIndex = notices.findIndex((item) => item.id === notice.id);

    if (currentIndex < 0) return;

    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

    if (targetIndex < 0 || targetIndex >= notices.length) return;

    const targetNotice = notices[targetIndex];

    const currentSortOrder = Number(notice.sort_order || currentIndex + 1);
    const targetSortOrder = Number(targetNotice.sort_order || targetIndex + 1);

    const { error: currentError } = await supabase
      .from("notices")
      .update({ sort_order: targetSortOrder })
      .eq("id", notice.id);

    if (currentError) {
      showAdminToast("순서 변경 실패\n" + currentError.message);
      return;
    }

    const { error: targetError } = await supabase
      .from("notices")
      .update({ sort_order: currentSortOrder })
      .eq("id", targetNotice.id);

    if (targetError) {
      showAdminToast("순서 변경 실패\n" + targetError.message);
      return;
    }

    await loadNotices();
  };

  const savePopup = async () => {
    if (!popup.title.trim()) {
      showAdminToast("팝업 제목을 입력해주세요.");
      return;
    }

    if (!popup.content.trim()) {
      showAdminToast("팝업 내용을 입력해주세요.");
      return;
    }

    const { error } = await supabase
      .from("popup_notice")
      .upsert({
        id: 1,
        title: popup.title.trim(),
        content: popup.content.trim(),
        is_enabled: popup.is_enabled,
        popup_size: popup.popup_size || "compact",
        updated_at: new Date().toISOString(),
      });

    if (error) {
      showAdminToast("팝업 저장 실패\n" + error.message);
      return;
    }

    showAdminToast("팝업 공지 저장 완료");
  };

  const inputClass =
    "w-full border border-gray-300 rounded-2xl p-4 font-bold text-gray-950 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black";

  const textareaClass =
    "w-full border border-gray-300 rounded-2xl p-4 font-bold text-gray-950 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black";

  if (!isAuthed) {
    return (
      <main className="min-h-screen bg-gray-100 flex items-center justify-center p-5 text-gray-950">
        <section className="w-full max-w-sm bg-white rounded-3xl p-6 border border-gray-300 shadow-sm">
          <h1 className="text-3xl font-extrabold mb-5 text-gray-950">
            공지관리 로그인
          </h1>

          <input
            type="password"
            placeholder="관리자 비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") login();
            }}
            className={inputClass}
          />

          <button
            onClick={login}
            className="w-full bg-black text-white rounded-2xl p-4 font-extrabold mt-4"
          >
            로그인
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-100 p-5 text-gray-950">
      <div className="max-w-6xl mx-auto">

        <div className="mb-5 flex flex-col md:flex-row md:items-end md:justify-between gap-3">
          <div>
            <div className="text-sm font-extrabold text-gray-600">
              RURU ADMIN
            </div>
            <h1 className="text-4xl font-extrabold text-gray-950">
              공지관리
            </h1>
          </div>

          <a
            href="/admin"
            className="inline-flex justify-center rounded-2xl bg-white border border-gray-300 px-5 py-3 font-extrabold text-gray-950 hover:bg-black hover:text-white transition"
          >
            관리자 홈
          </a>
        </div>

        {loading && (
          <div className="rounded-3xl bg-white border border-gray-300 p-6 font-bold mb-5 text-gray-950">
            불러오는 중...
          </div>
        )}

        <section className="grid lg:grid-cols-2 gap-5 mb-5">

          <div className="bg-white rounded-3xl border border-gray-300 p-5 shadow-sm">
            <h2 className="text-2xl font-extrabold mb-4 text-gray-950">
              공지사항 등록/수정
            </h2>

            <div className="grid gap-3">
              <input
                value={noticeForm.title}
                onChange={(e) =>
                  setNoticeForm({ ...noticeForm, title: e.target.value })
                }
                placeholder="공지 제목"
                className={inputClass}
              />

              <input
                value={noticeForm.category}
                onChange={(e) =>
                  setNoticeForm({ ...noticeForm, category: e.target.value })
                }
                placeholder="카테고리 예) 주문공지, 배송공지"
                className={inputClass}
              />

              <textarea
                value={noticeForm.content}
                onChange={(e) =>
                  setNoticeForm({ ...noticeForm, content: e.target.value })
                }
                placeholder="공지 내용"
                className={`${textareaClass} min-h-[180px]`}
              />

              <div className="rounded-2xl bg-gray-50 border border-gray-200 p-4">
                <div className="text-sm font-extrabold text-gray-950">
                  정렬순서
                </div>

                <div className="text-sm text-gray-600 font-bold mt-1">
                  아래 등록된 공지에서 ↑ 위로 / ↓ 아래로 버튼으로 순서를 바꾸는 방식을 추천합니다.
                </div>

                <input
                  type="number"
                  value={noticeForm.sort_order}
                  onChange={(e) =>
                    setNoticeForm({
                      ...noticeForm,
                      sort_order: Number(e.target.value || 0),
                    })
                  }
                  placeholder="정렬순서"
                  className={`${inputClass} mt-3`}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-2xl p-4 font-extrabold text-gray-950">
                  <input
                    type="checkbox"
                    checked={noticeForm.is_pinned}
                    onChange={(e) =>
                      setNoticeForm({
                        ...noticeForm,
                        is_pinned: e.target.checked,
                      })
                    }
                  />
                  상단고정
                </label>

                <label className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-2xl p-4 font-extrabold text-gray-950">
                  <input
                    type="checkbox"
                    checked={noticeForm.is_visible}
                    onChange={(e) =>
                      setNoticeForm({
                        ...noticeForm,
                        is_visible: e.target.checked,
                      })
                    }
                  />
                  공개
                </label>
              </div>

              <button
                onClick={saveNotice}
                className="bg-black text-white rounded-2xl p-4 font-extrabold"
              >
                {noticeForm.id ? "공지 수정 저장" : "공지 등록"}
              </button>

              {noticeForm.id !== 0 && (
                <button
                  onClick={() => setNoticeForm(emptyNotice)}
                  className="bg-gray-200 text-gray-950 rounded-2xl p-4 font-extrabold"
                >
                  새 공지 작성으로 초기화
                </button>
              )}
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-gray-300 p-5 shadow-sm">
            <h2 className="text-2xl font-extrabold mb-4 text-gray-950">
              팝업공지 수정
            </h2>

            <div className="grid gap-3">
              <label className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-2xl p-4 font-extrabold text-gray-950">
                <input
                  type="checkbox"
                  checked={popup.is_enabled}
                  onChange={(e) =>
                    setPopup({ ...popup, is_enabled: e.target.checked })
                  }
                />
                팝업 사용
              </label>

              <div>
                <div className="text-sm font-extrabold mb-2 text-gray-950">
                  팝업 크기
                </div>

                <select
                  value={popup.popup_size || "compact"}
                  onChange={(e) =>
                    setPopup({
                      ...popup,
                      popup_size: e.target.value as "compact" | "normal" | "large",
                    })
                  }
                  className={inputClass}
                >
                  <option value="compact">작게</option>
                  <option value="normal">보통</option>
                  <option value="large">크게</option>
                </select>
              </div>

              <input
                value={popup.title}
                onChange={(e) =>
                  setPopup({ ...popup, title: e.target.value })
                }
                placeholder="팝업 제목"
                className={inputClass}
              />

              <textarea
                value={popup.content}
                onChange={(e) =>
                  setPopup({ ...popup, content: e.target.value })
                }
                placeholder="팝업 내용"
                className={`${textareaClass} min-h-[240px]`}
              />

              <button
                onClick={savePopup}
                className="bg-black text-white rounded-2xl p-4 font-extrabold"
              >
                팝업공지 저장
              </button>

              <div className="text-xs text-gray-600 font-bold leading-5">
                팝업 내용을 수정하면 고객 화면 팝업에 바로 반영됩니다.
                고객이 오늘 하루 닫기를 누른 경우에는 다음날 다시 보입니다.
              </div>
            </div>
          </div>

        </section>

        <section className="bg-white rounded-3xl border border-gray-300 p-5 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
            <div>
              <h2 className="text-2xl font-extrabold text-gray-950">
                등록된 공지
              </h2>

              <div className="text-sm text-gray-600 font-bold mt-1">
                위로/아래로 버튼으로 고객 공지 노출 순서를 바꿀 수 있습니다.
              </div>
            </div>

            <button
              onClick={loadNotices}
              className="rounded-2xl bg-gray-100 border border-gray-300 px-5 py-3 font-extrabold text-gray-950 hover:bg-black hover:text-white transition"
            >
              순서 새로고침
            </button>
          </div>

          <div className="grid gap-3">
            {notices.map((notice, index) => (
              <article
                key={notice.id}
                className="rounded-2xl border border-gray-300 bg-gray-50 p-4 text-gray-950"
              >
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="bg-black text-white rounded-full px-3 py-1 text-xs font-extrabold">
                        순서 {index + 1}
                      </span>

                      {notice.is_pinned && (
                        <span className="bg-black text-white rounded-full px-3 py-1 text-xs font-extrabold">
                          상단고정
                        </span>
                      )}

                      <span className="bg-white border border-gray-300 rounded-full px-3 py-1 text-xs font-extrabold text-gray-950">
                        {notice.category}
                      </span>

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-extrabold ${
                          notice.is_visible
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-200 text-gray-700"
                        }`}
                      >
                        {notice.is_visible ? "공개" : "숨김"}
                      </span>
                    </div>

                    <div className="font-extrabold text-lg text-gray-950">
                      {notice.title}
                    </div>

                    <div className="text-gray-800 font-semibold mt-2 whitespace-pre-line line-clamp-3">
                      {notice.content}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-1 gap-2 shrink-0 md:w-[110px]">
                    <button
                      onClick={() => moveNotice(notice, "up")}
                      disabled={index === 0}
                      className="bg-white border border-gray-300 text-gray-950 rounded-xl px-3 py-2 font-extrabold disabled:opacity-35"
                    >
                      ↑ 위로
                    </button>

                    <button
                      onClick={() => moveNotice(notice, "down")}
                      disabled={index === notices.length - 1}
                      className="bg-white border border-gray-300 text-gray-950 rounded-xl px-3 py-2 font-extrabold disabled:opacity-35"
                    >
                      ↓ 아래
                    </button>

                    <button
                      onClick={() => editNotice(notice)}
                      className="bg-black text-white rounded-xl px-3 py-2 font-bold"
                    >
                      수정
                    </button>

                    <button
                      onClick={() => deleteNotice(notice.id)}
                      className="bg-red-500 text-white rounded-xl px-3 py-2 font-bold"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              </article>
            ))}

            {notices.length === 0 && (
              <div className="rounded-2xl border border-gray-300 bg-gray-50 p-5 text-center font-bold text-gray-700">
                등록된 공지가 없습니다.
              </div>
            )}
          </div>
        </section>

      </div>
    </main>
  );
}
