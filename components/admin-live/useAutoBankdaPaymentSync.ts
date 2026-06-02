"use client";

import { useCallback, useEffect, useRef } from "react";

const AUTO_BANKDA_SYNC_INTERVAL_MS = 60_000;
const AUTO_BANKDA_SYNC_BROWSER_LOCK_KEY = "ruru-admin-live-auto-bankda-sync-lock";
const AUTO_BANKDA_SYNC_LOCK_TTL_MS = 55_000;

type LockPayload = {
  token: string;
  expiresAt: number;
};

type AutoBankdaSyncReason = "mount" | "interval";

type AutoBankdaSyncDetail = {
  reason: AutoBankdaSyncReason;
  successCount: number;
  result: any;
};

type UseAutoBankdaPaymentSyncOptions = {
  enabled?: boolean;
  onSynced?: (detail: AutoBankdaSyncDetail) => void | Promise<void>;
};

function createLockToken() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function claimBrowserLock() {
  if (typeof window === "undefined") return null;

  const now = Date.now();

  try {
    const raw = window.localStorage.getItem(AUTO_BANKDA_SYNC_BROWSER_LOCK_KEY);
    const current = raw ? (JSON.parse(raw) as LockPayload) : null;

    if (current?.expiresAt && current.expiresAt > now) {
      return null;
    }

    const token = createLockToken();

    window.localStorage.setItem(
      AUTO_BANKDA_SYNC_BROWSER_LOCK_KEY,
      JSON.stringify({
        token,
        expiresAt: now + AUTO_BANKDA_SYNC_LOCK_TTL_MS,
      })
    );

    return token;
  } catch {
    return createLockToken();
  }
}

function getAutoMatchSuccessCount(result: any) {
  return Number(result?.autoMatchSummary?.success_count || result?.autoMatch?.summary?.success_count || 0);
}

export function useAutoBankdaPaymentSync(options: UseAutoBankdaPaymentSyncOptions = {}) {
  const enabled = options.enabled ?? true;
  const onSyncedRef = useRef(options.onSynced);
  const inFlightRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    onSyncedRef.current = options.onSynced;
  }, [options.onSynced]);

  const runAutoBankdaSync = useCallback(
    async (reason: AutoBankdaSyncReason = "interval") => {
      if (!enabled) return;
      if (inFlightRef.current) return;

      const lockToken = claimBrowserLock();

      if (!lockToken) return;

      inFlightRef.current = true;

      try {
        const response = await fetch("/api/bankda/sync-and-auto-match", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
        });

        const result = await response.json().catch(() => null);

        if (!response.ok || result?.ok === false) {
          console.warn("[admin-live] 자동입금 자동조회 실패", {
            reason,
            result,
          });
          return;
        }

        const successCount = getAutoMatchSuccessCount(result);
        const detail: AutoBankdaSyncDetail = {
          reason,
          successCount,
          result,
        };

        if (successCount > 0) {
          console.info("[admin-live] 자동입금 자동처리 완료", {
            reason,
            successCount,
            result,
          });
        }

        await onSyncedRef.current?.(detail);

        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("ruru-admin-live-auto-bankda-synced", {
              detail,
            })
          );

          try {
            window.localStorage.setItem(
              "ruru-admin-live-auto-bankda-synced-at",
              JSON.stringify({
                at: Date.now(),
                reason,
                successCount,
              })
            );
          } catch {
            // 다른 탭 알림 실패는 자동동기화 자체를 막지 않습니다.
          }
        }
      } catch (error) {
        console.warn("[admin-live] 자동입금 자동조회 오류", error);
      } finally {
        inFlightRef.current = false;
      }
    },
    [enabled]
  );

  useEffect(() => {
    if (!enabled) return undefined;

    void runAutoBankdaSync("mount");

    timerRef.current = setInterval(() => {
      void runAutoBankdaSync("interval");
    }, AUTO_BANKDA_SYNC_INTERVAL_MS);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [enabled, runAutoBankdaSync]);
}
