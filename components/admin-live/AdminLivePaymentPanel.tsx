"use client";

import { useEffect, useRef } from "react";

import PaymentMatchPanel from "@/components/admin-v2/payment/PaymentMatchPanel";
import type { DepositRow, OrderGroup } from "@/lib/admin-v2/types";

// [2026-08-06 부하개선] 이 패널의 자동 동기화 주기.
// syncBankdaAndRefresh 는 /api/admin-v2/deposits(=deposits 전체 + orders 전체 조회)를 부르므로
// 60초마다 돌리면 DB 부하가 상시로 걸린다. Bankda 입금 동기화 자체는
// Vercel cron(/api/cron/bankda-sync, 1분)과 useAutoBankdaPaymentSync(60초)가 이미 담당하므로
// 이 패널 주기는 화면 최신화 용도로만 남긴다. 되돌리려면 이 숫자만 60_000 으로.
const PAYMENT_PANEL_SYNC_INTERVAL_MS = 180_000;

type BankdaSyncResult = {
  fetchedCount?: number;
  insertedCount?: number;
  skippedCount?: number;
  rawCount?: number;
  bankdaDescription?: string;
};

type Props = {
  deposits: DepositRow[];
  orderGroups: OrderGroup[];
  onRefresh?: () => Promise<void> | void;
  onBankdaSync?: () => Promise<BankdaSyncResult | void> | void;
  onOpenManualMatch: (orderGroup: OrderGroup) => void;
};

export default function AdminLivePaymentPanel({
  deposits,
  orderGroups,
  onRefresh,
  onBankdaSync,
  onOpenManualMatch,
}: Props) {
  const syncBankdaAndRefresh = async () => {
    if (onBankdaSync) {
      await onBankdaSync();
    }

    if (onRefresh) {
      await onRefresh();
    }
  };

  const autoBankdaSyncInFlightRef = useRef(false);

  useEffect(() => {
    let alive = true;

    const runPaymentPanelBankdaSync = async () => {
      if (!alive) return;
      if (autoBankdaSyncInFlightRef.current) return;
      // [2026-08-06 부하개선] 탭이 화면에 보이지 않으면 건너뛴다(전체 조회라 부하가 큼).
      // 다시 화면에 돌아오면 아래 visibilitychange 에서 즉시 1회 실행하므로 최신화는 유지된다.
      if (typeof document !== "undefined" && document.hidden) return;

      autoBankdaSyncInFlightRef.current = true;

      try {
        // 입금관리 패널 실제 Bankda 자동동기화
        // 수동 [입금내역 새로고침]과 같은 부모 동기화 함수를 사용합니다.
        await syncBankdaAndRefresh();
      } catch (error) {
        console.warn("[admin-live] 입금관리 자동 Bankda 동기화 실패", error);
      } finally {
        autoBankdaSyncInFlightRef.current = false;
      }
    };

    void runPaymentPanelBankdaSync();

    const timer = window.setInterval(() => {
      void runPaymentPanelBankdaSync();
    }, PAYMENT_PANEL_SYNC_INTERVAL_MS);

    // [2026-08-06 부하개선] 숨겨져 있던 탭이 다시 보이면 즉시 1회 최신화.
    const handleVisibility = () => {
      if (typeof document !== "undefined" && !document.hidden) {
        void runPaymentPanelBankdaSync();
      }
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibility);
    }

    return () => {
      alive = false;
      window.clearInterval(timer);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibility);
      }
    };
    // 입금관리 패널이 열려 있는 동안만 동작합니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  return (
    <PaymentMatchPanel
      deposits={deposits}
      orderGroups={orderGroups}
      onOpenManualMatch={onOpenManualMatch}
      onSyncBankdaDeposits={syncBankdaAndRefresh}
      variant="admin-live"
    />
  );
}
