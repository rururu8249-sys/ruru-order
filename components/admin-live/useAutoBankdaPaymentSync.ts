"use client";

import { useCallback, useEffect, useRef } from "react";

const AUTO_BANKDA_SYNC_INTERVAL_MS = 60_000;
const AUTO_BANKDA_SYNC_BROWSER_LOCK_KEY = "ruru-admin-live-auto-bankda-sync-lock";
const AUTO_BANKDA_SYNC_LOCK_TTL_MS = 55_000;

type LockPayload = {
  token: string;
  expiresAt: number;
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

export function useAutoBankdaPaymentSync() {
  const inFlightRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runAutoBankdaSync = useCallback(async (reason: "mount" | "interval" = "interval") => {
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

      if (successCount > 0) {
        console.info("[admin-live] 자동입금 자동처리 완료", {
          reason,
          successCount,
          result,
        });
      }

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("ruru-admin-live-auto-bankda-synced", {
            detail: {
              reason,
              successCount,
              result,
            },
          })
        );
      }
    } catch (error) {
      console.warn("[admin-live] 자동입금 자동조회 오류", error);
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
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
  }, [runAutoBankdaSync]);
}
