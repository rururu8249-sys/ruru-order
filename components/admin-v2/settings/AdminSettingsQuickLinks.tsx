// components/admin-v2/settings/AdminSettingsQuickLinks.tsx
// 목적: 관리자 설정 화면에서 운영 관련 설정 페이지로 빠르게 이동
// 주의: UI 전용. 주문금액, 배송비 계산, 입금매칭, Supabase 저장 로직 없음.

export default function AdminSettingsQuickLinks() {
  return (
    <section className="mb-6 rounded-[24px] border border-blue-100 bg-white p-5 shadow-[0_10px_24px_rgba(37,99,235,0.06)]">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="text-[13px] font-black text-blue-600">운영 설정</div>
          <h3 className="mt-1 text-[22px] font-black tracking-[-0.05em] text-slate-950">
            방송/합배송 설정
          </h3>
          <p className="mt-1 text-[13px] font-bold leading-relaxed text-slate-500">
            방송 날짜가 넘어가는 경우에도 합배송 기준 시간을 직접 조정할 수 있습니다.
          </p>
        </div>

        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-[24px] ring-1 ring-blue-100">
          📦
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4 opacity-80">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[17px] font-black text-slate-700">
                합배송 시간 설정 사용중단
              </div>
              <div className="mt-1 text-[13px] font-bold leading-relaxed text-slate-500">
                현재는 방송 ON 기준 자동합배송을 사용합니다. 직접 시간지정 설정은 사용하지 않습니다.
              </div>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm ring-1 ring-slate-100">
              중단
            </div>
          </div>
        </div>

        <div className="rounded-[20px] border border-slate-100 bg-slate-50 p-4">
          <div className="text-[17px] font-black text-slate-950">
            방송관리 v2
          </div>
          <div className="mt-1 text-[13px] font-bold leading-relaxed text-slate-500">
            방송 생성/수정/종료 기능은 다음 단계에서 분리 이식 예정
          </div>
        </div>
      </div>
    </section>
  );
}
