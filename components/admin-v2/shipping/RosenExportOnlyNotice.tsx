"use client";

export default function RosenExportOnlyNotice() {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[12px] font-bold text-amber-900">
      <div className="text-[14px] font-black text-amber-950">
        로젠 송장 기준
      </div>

      <div className="mt-1 leading-relaxed">
        사이트에서는 송장을 합치지 않고, DB 주문행 1개를 로젠 엑셀 1줄로 그대로 내보냅니다.
        같은 고객/전화/주소/닉네임이어도 사이트에서 합치지 않습니다.
        로젠 프로그램의 동일 수하인 자동합배송 기능에 맡깁니다.
      </div>

      <div className="mt-2 grid gap-1 text-[11px]">
        <div>• 수하인명: 닉네임</div>
        <div>• 주소: 주소 + 상세주소 + /닉네임</div>
        <div>• 품목명: 상품명(옵션) x수량개</div>
        <div>• 송장 업로드/재업로드/사이트 반영 흐름은 사용하지 않습니다.</div>
      </div>
    </div>
  );
}
