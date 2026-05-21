"use client";

// components/admin-v2/today/AdminTodayKakaoManualFields.tsx
// 목적: 카톡 표시명/문의유형/상품명 수동 입력
// 주의: UI 전용.

import type { KakaoIssueType } from "@/components/admin-v2/today/kakaoSupportUtils";
import { KAKAO_ISSUE_OPTIONS } from "@/components/admin-v2/today/kakaoSupportUtils";

export default function AdminTodayKakaoManualFields({
  kakaoDisplayName,
  setKakaoDisplayName,
  manualIssueType,
  setManualIssueType,
  relatedProduct,
  setRelatedProduct,
  detectedDateLabel,
}: {
  kakaoDisplayName: string;
  setKakaoDisplayName: (value: string) => void;
  manualIssueType: KakaoIssueType | "";
  setManualIssueType: (value: KakaoIssueType | "") => void;
  relatedProduct: string;
  setRelatedProduct: (value: string) => void;
  detectedDateLabel: string;
}) {
  return (
    <section className="rounded-2xl border border-neutral-100 bg-white p-3">
      <div className="mb-2 text-sm font-black text-neutral-950">수동 기록 보완</div>

      <div className="grid gap-2 lg:grid-cols-3">
        <input
          value={kakaoDisplayName}
          onChange={(event) => setKakaoDisplayName(event.target.value)}
          placeholder="카톡 이름/닉네임"
          className="h-11 rounded-xl border border-neutral-200 bg-white px-3 text-sm font-black outline-none focus:border-blue-500"
        />

        <select
          value={manualIssueType}
          onChange={(event) => setManualIssueType(event.target.value as KakaoIssueType | "")}
          className="h-11 rounded-xl border border-neutral-200 bg-white px-3 text-sm font-black outline-none focus:border-blue-500"
        >
          <option value="">자동분류 사용</option>
          {KAKAO_ISSUE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <input
          value={relatedProduct}
          onChange={(event) => setRelatedProduct(event.target.value)}
          placeholder="관련 상품명 직접 입력"
          className="h-11 rounded-xl border border-neutral-200 bg-white px-3 text-sm font-black outline-none focus:border-blue-500"
        />
      </div>

      <div className="mt-2 rounded-xl bg-neutral-50 px-3 py-2 text-xs font-bold text-neutral-500">
        날짜 인식: <span className="font-black text-neutral-800">{detectedDateLabel}</span>
      </div>
    </section>
  );
}
