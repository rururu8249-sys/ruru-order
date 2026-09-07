"use client";

// [2026-09-07 전수감사] 관리자 보안 탭 — 화면에는 사장님이 할 수 있는 말만.
// 환경변수 이름·재배포 절차 같은 개발자용 내용은 docs/인수인계_관리자설정.md 로 옮겼다.

export default function AdminAuthSettingsPanel() {
  return (
    <section className="rounded-[28px] border border-line bg-surface p-5 shadow-sm">
      <h3 className="text-base font-black text-ink">관리자 로그인</h3>
      <p className="mt-2 text-sm font-bold leading-6 text-ink-soft">
        관리자 아이디와 비밀번호는 이 화면에서 바꾸지 않습니다. 서버 설정에서만 바뀝니다.
      </p>

      <div className="mt-4 rounded-2xl border border-line bg-surface-2 p-4 text-sm font-bold leading-7 text-ink-soft">
        아이디나 비밀번호를 바꾸고 싶으면 <b className="text-ink">개발자에게 요청</b>하세요.
        바뀐 뒤에는 새 아이디·비밀번호로 다시 로그인하면 됩니다.
      </div>

      <div className="mt-3 text-xs font-bold text-ink-mute">
        개발자용 절차는 저장소의 <span className="font-black">docs/인수인계_관리자설정.md</span> 에 있습니다.
      </div>
    </section>
  );
}
