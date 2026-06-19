"use client";

export default function AdminLiveLogoutButton() {
  const handleAdminLogout = async () => {
    try {
      await fetch("/api/admin-logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // 로그아웃 요청 실패 여부와 무관하게 로그인 화면으로 이동합니다.
    } finally {
      window.location.href = "/admin-login";
    }
  };

  return (
    <button
      type="button"
      onClick={handleAdminLogout}
      className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-100 bg-rose-soft px-4 py-3 text-[13px] font-black text-rose-deep transition hover:bg-rose-soft"
    >
      <span>↩</span>
      <span>관리자 로그아웃</span>
    </button>
  );
}
