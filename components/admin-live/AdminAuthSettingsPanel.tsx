"use client";

// [2026-09-07 전수감사] 관리자 보안 탭 — 화면에는 사장님이 할 수 있는 말만.
// 환경변수 이름·재배포 절차 같은 개발자용 내용은 docs/인수인계_관리자설정.md 로 옮겼다.

export default function AdminAuthSettingsPanel() {
  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <h3 className="text-base font-bold text-ink">관리자 로그인</h3>
      <p className="mt-2 text-sm leading-6 text-ink-soft">아이디·비밀번호를 바꾸려면 클로드에게 말해 주세요.</p>
    </section>
  );
}
