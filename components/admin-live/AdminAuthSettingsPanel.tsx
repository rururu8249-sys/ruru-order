"use client";

export default function AdminAuthSettingsPanel() {
  return (
    <section className="rounded-[28px] border border-line bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-black text-ink">
              관리자 보안 설정
            </h3>
            <span className="rounded-full bg-surface-2 px-3 py-1 text-xs font-black text-ink-soft">
              Vercel 환경변수 관리
            </span>
          </div>
          <p className="mt-2 text-sm font-bold leading-6 text-ink-soft">
            관리자 아이디와 비밀번호는 홈페이지 안에서 변경하지 않습니다.
          </p>
        </div>
      </div>

      <div className="mt-5 rounded-3xl border border-warn-tx bg-warn-bg p-4">
        <div className="text-sm font-black text-amber-900">
          아이디/비밀번호 변경 기능을 제거했습니다.
        </div>
        <div className="mt-2 text-sm font-bold leading-7 text-warn-tx">
          현재 로그인 기준은 Vercel 환경변수입니다. 홈페이지 설정 화면에서
          아이디나 비밀번호를 바꾸면 Vercel 값과 자동 연동되지 않기 때문에,
          혼동을 막기 위해 변경 입력칸을 없앴습니다.
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-line bg-surface-2 p-4">
          <div className="text-xs font-black text-ink-mute">
            관리자 아이디
          </div>
          <div className="mt-1 text-sm font-black text-ink">
            RURU_ADMIN_ID
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-surface-2 p-4">
          <div className="text-xs font-black text-ink-mute">
            관리자 비밀번호
          </div>
          <div className="mt-1 text-sm font-black text-ink">
            RURU_ADMIN_PASSWORD
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-surface-2 p-4">
          <div className="text-xs font-black text-ink-mute">
            로그인 세션키
          </div>
          <div className="mt-1 text-sm font-black text-ink">
            ADMIN_SESSION_SECRET
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-3xl border border-rose-line bg-rose-soft p-4 text-sm font-bold leading-7 text-rose-deep">
        변경이 필요하면 Vercel Environment Variables에서 위 3개 값을 수정한 뒤
        Production 재배포를 진행하세요. 재배포 후에는 새 아이디/비밀번호로
        다시 로그인하면 됩니다.
      </div>
    </section>
  );
}
