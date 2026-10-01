import type { ShopBankAccount, ShopBankRouting } from "./shopInfo";
import { bankLine } from "./shopInfo";

const secondaryBlank = (): ShopBankAccount => ({
  id: "secondary",
  enabled: true,
  label: "추가 계좌",
  bankName: "",
  bankAccount: "",
  bankHolder: "",
});

export function addSecondaryBankAccount(accounts: readonly ShopBankAccount[]): ShopBankAccount[] {
  if (accounts.some((account) => account.id === "secondary")) return accounts.map((account) => ({ ...account }));
  return [...accounts.map((account) => ({ ...account })), secondaryBlank()];
}

export function removeSecondaryBankAccount(
  accounts: readonly ShopBankAccount[],
  routing: ShopBankRouting,
): { accounts: ShopBankAccount[]; routing: ShopBankRouting } {
  return {
    accounts: accounts.filter((account) => account.id === "primary").map((account) => ({ ...account })),
    routing: {
      ...routing,
      allAccountId: routing.allAccountId === "secondary" ? "primary" : routing.allAccountId,
      existingAccountId: routing.existingAccountId === "secondary" ? "primary" : routing.existingAccountId,
      firstOrderAccountId: routing.firstOrderAccountId === "secondary" ? "primary" : routing.firstOrderAccountId,
    },
  };
}

export function updateBankAccount(
  accounts: readonly ShopBankAccount[],
  id: ShopBankAccount["id"],
  patch: Partial<Pick<ShopBankAccount, "label" | "bankName" | "bankAccount" | "bankHolder">>,
): ShopBankAccount[] {
  return accounts.map((account) => (account.id === id ? { ...account, ...patch } : { ...account }));
}

function accountSummary(accounts: readonly ShopBankAccount[], id: ShopBankAccount["id"]): string {
  const account = accounts.find((item) => item.id === id);
  if (!account) return "선택한 계좌 없음";
  return `${account.label} — ${bankLine(account)}`;
}

export function bankRoutingSummary(accounts: readonly ShopBankAccount[], routing: ShopBankRouting): string {
  const assignmentLines = routing.mode === "all"
    ? [`전체 고객: ${accountSummary(accounts, routing.allAccountId)}`]
    : [
        `기존회원: ${accountSummary(accounts, routing.existingAccountId)}`,
        `첫 주문 신규회원: ${accountSummary(accounts, routing.firstOrderAccountId)}`,
      ];
  const windowLines = routing.mode === "split"
    ? routing.firstOrderWindow.enabled
      ? [`신규회원 계좌 유지기간: ${routing.firstOrderWindow.startDate} ~ ${routing.firstOrderWindow.endDate} (방송·쇼핑몰 공통)`]
      : ["신규회원 계좌 유지기간 미사용 — 같은 방송만 최초 계좌를 유지하고, 새 방송·방송 종료 후 쇼핑몰 주문은 최신 설정으로 다시 판정합니다."]
    : ["방송·쇼핑몰 공통 적용"];

  return [
    ...assignmentLines,
    ...windowLines,
    "",
    "뱅크다 자동입금확인은 뱅크다에 별도로 등록된 계좌를 사용합니다. 실제 입금 받을 모든 계좌가 뱅크다에도 등록되어 있는지 확인해 주세요.",
  ].join("\n");
}
