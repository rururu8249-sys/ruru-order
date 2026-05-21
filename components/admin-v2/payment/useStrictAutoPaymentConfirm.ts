"use client";

import { useEffect, useMemo, useRef } from "react";

type AutoPreviewCandidate = {
  order_id?: string | number | null;
  order_group_id?: string | number | null;
  order_nickname?: string | null;
  order_amount?: number | string | null;
  deposit_id?: string | number | null;
  deposit_depositor?: string | null;
  deposit_amount?: number | string | null;
};

type AutoPreviewResult = {
  ok?: boolean;
  candidates?: AutoPreviewCandidate[];
  summary?: {
    auto_match_preview_count?: number;
  };
};

type AutoRunResult = {
  ok?: boolean;
  message?: string;
  summary?: {
    success_count?: number;
    failed_count?: number;
    candidates?: number;
  };
};

type UseStrictAutoPaymentConfirmProps = {
  enabled: boolean;
  previewResult: AutoPreviewResult | null;
  autoRunLoading: boolean;
  onMessage: (message: string) => void;
  onStart?: () => void;
  onFinish?: () => void;
  onAfterSuccess?: (result: AutoRunResult) => Promise<void> | void;
};

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function cleanAmount(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function getExactCandidates(previewResult: AutoPreviewResult | null) {
  if (!previewResult?.ok) return [];
  if (!Array.isArray(previewResult.candidates)) return [];

  return previewResult.candidates.filter((candidate) => {
    const orderNickname = cleanText(candidate.order_nickname);
    const depositName = cleanText(candidate.deposit_depositor);
    const orderAmount = cleanAmount(candidate.order_amount);
    const depositAmount = cleanAmount(candidate.deposit_amount);
    const orderId = cleanText(candidate.order_id || candidate.order_group_id);
    const depositId = cleanText(candidate.deposit_id);

    return Boolean(
      orderId &&
        depositId &&
        orderNickname &&
        depositName &&
        orderNickname === depositName &&
        orderAmount > 0 &&
        depositAmount > 0 &&
        orderAmount === depositAmount
    );
  });
}

function buildSignature(candidates: AutoPreviewCandidate[]) {
  return candidates
    .map((candidate) => {
      return [
        cleanText(candidate.order_id || candidate.order_group_id),
        cleanText(candidate.order_nickname),
        cleanAmount(candidate.order_amount),
        cleanText(candidate.deposit_id),
        cleanText(candidate.deposit_depositor),
        cleanAmount(candidate.deposit_amount),
      ].join("::");
    })
    .sort()
    .join("||");
}

function successCountOf(result: AutoRunResult | null) {
  return Number(result?.summary?.success_count ?? 0);
}

export default function useStrictAutoPaymentConfirm({
  enabled,
  previewResult,
  autoRunLoading,
  onMessage,
  onStart,
  onFinish,
  onAfterSuccess,
}: UseStrictAutoPaymentConfirmProps) {
  const inFlightRef = useRef(false);
  const lastSignatureRef = useRef("");

  const exactCandidates = useMemo(() => getExactCandidates(previewResult), [previewResult]);
  const signature = useMemo(() => buildSignature(exactCandidates), [exactCandidates]);

  useEffect(() => {
    if (!enabled) return;
    if (!signature) return;
    if (autoRunLoading) return;
    if (inFlightRef.current) return;
    if (lastSignatureRef.current === signature) return;

    lastSignatureRef.current = signature;

    const timer = window.setTimeout(async () => {
      inFlightRef.current = true;
      onStart?.();
      onMessage(`자동 ON: 닉네임+금액 완전일치 1:1 후보 ${exactCandidates.length}건 자동확인 중`);

      try {
        const response = await fetch("/api/admin-v2/auto-payment-match/run", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
          body: JSON.stringify({
            confirm: "RUN_AUTO_MATCH",
            source: "admin-v2-auto-on-strict-exact-match",
          }),
        });

        const result = (await response.json().catch(() => null)) as AutoRunResult | null;

        if (!response.ok || !result?.ok) {
          onMessage(`자동입금확인 실패: ${result?.message || "알 수 없는 오류"}`);
          return;
        }

        const successCount = successCountOf(result);

        if (successCount > 0) {
          onMessage(`자동입금확인 완료: ${successCount.toLocaleString()}건`);
          await onAfterSuccess?.(result);
          return;
        }

        onMessage("자동 ON: 새 자동확인 대상 없음");
      } catch (error) {
        onMessage(
          `자동입금확인 오류: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      } finally {
        inFlightRef.current = false;
        onFinish?.();
      }
    }, 1200);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    autoRunLoading,
    enabled,
    exactCandidates.length,
    onAfterSuccess,
    onFinish,
    onMessage,
    onStart,
    signature,
  ]);
}
