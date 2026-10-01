"use client";

import {
  addSecondaryBankAccount,
  bankRoutingSummary,
  removeSecondaryBankAccount,
  updateBankAccount,
} from "@/lib/bankAccountEditor";
import type { ShopBankAccount, ShopBankAccountId, ShopBankRouting } from "@/lib/shopInfo";

type Props = {
  accounts: ShopBankAccount[];
  routing: ShopBankRouting;
  onChange: (accounts: ShopBankAccount[], routing: ShopBankRouting) => void;
};

const inputClass =
  "h-11 w-full rounded-2xl border border-line bg-surface px-4 text-sm font-bold text-ink outline-none transition focus:border-rose-deep focus:ring-4 focus:ring-rose-soft";

function AccountSelect({
  label,
  value,
  accounts,
  onChange,
}: {
  label: string;
  value: ShopBankAccountId;
  accounts: ShopBankAccount[];
  onChange: (id: ShopBankAccountId) => void;
}) {
  return (
    <label className="rounded-2xl border border-line bg-surface-2 p-4">
      <span className="block text-sm font-black text-ink">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value as ShopBankAccountId)}
        className={`${inputClass} mt-3`}
      >
        {accounts.filter((account) => account.enabled).map((account) => (
          <option key={account.id} value={account.id}>
            {account.label} · {account.bankName || "은행 미입력"} {account.bankAccount || "계좌번호 미입력"}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function BankAccountRoutingSettings({ accounts, routing, onChange }: Props) {
  const secondaryExists = accounts.some((account) => account.id === "secondary");
  const updateRouting = (patch: Partial<ShopBankRouting>) => onChange(accounts, { ...routing, ...patch });

  return (
    <div className="grid gap-4">
      <div className="rounded-2xl border border-line bg-danger-bg px-4 py-3 text-xs font-bold leading-5 text-danger-tx">
        뱅크다 자동입금확인은 뱅크다에 별도로 등록한 계좌로 돌아갑니다. 손님에게 노출할 모든 계좌가 뱅크다에도 등록되어 있는지 꼭 확인해 주세요.
      </div>

      <div className="grid gap-3">
        {accounts.map((account, index) => (
          <section key={account.id} className="rounded-2xl border border-line bg-surface-2 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-black text-ink">계좌 {index + 1} · {account.id === "primary" ? "기존 계좌" : "추가 계좌"}</div>
                <div className="mt-1 text-xs font-bold text-ink-mute">
                  {account.id === "primary" ? "항상 유지되는 기본 계좌입니다." : "필요할 때 삭제할 수 있는 두 번째 계좌입니다."}
                </div>
              </div>
              {account.id === "secondary" ? (
                <button
                  type="button"
                  onClick={() => {
                    const removed = removeSecondaryBankAccount(accounts, routing);
                    onChange(removed.accounts, removed.routing);
                  }}
                  className="rounded-xl border border-danger-tx px-3 py-2 text-xs font-black text-danger-tx"
                >
                  추가 계좌 삭제
                </button>
              ) : null}
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <label>
                <span className="mb-2 block text-xs font-black text-ink-soft">관리용 이름</span>
                <input
                  aria-label={`${account.id === "primary" ? "기존" : "추가"} 계좌 관리용 이름`}
                  value={account.label}
                  onChange={(event) => onChange(updateBankAccount(accounts, account.id, { label: event.target.value }), routing)}
                  placeholder={account.id === "primary" ? "기존 계좌" : "추가 계좌"}
                  className={inputClass}
                />
              </label>
              <label>
                <span className="mb-2 block text-xs font-black text-ink-soft">은행</span>
                <input
                  aria-label={`${account.label} 은행`}
                  value={account.bankName}
                  onChange={(event) => onChange(updateBankAccount(accounts, account.id, { bankName: event.target.value }), routing)}
                  placeholder="예: 새마을금고"
                  className={inputClass}
                />
              </label>
              <label>
                <span className="mb-2 block text-xs font-black text-ink-soft">계좌번호</span>
                <input
                  aria-label={`${account.label} 계좌번호`}
                  value={account.bankAccount}
                  onChange={(event) => onChange(updateBankAccount(accounts, account.id, { bankAccount: event.target.value.replace(/[^0-9-]/g, "") }), routing)}
                  inputMode="numeric"
                  placeholder="숫자 또는 하이픈"
                  className={inputClass}
                />
              </label>
              <label>
                <span className="mb-2 block text-xs font-black text-ink-soft">예금주</span>
                <input
                  aria-label={`${account.label} 예금주`}
                  value={account.bankHolder}
                  onChange={(event) => onChange(updateBankAccount(accounts, account.id, { bankHolder: event.target.value }), routing)}
                  placeholder="예금주 이름"
                  className={inputClass}
                />
              </label>
            </div>

            <div className="mt-3 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-bold text-ink-soft">
              손님 표시 미리보기 — <b className="text-ink">{account.bankName || "은행"} {account.bankAccount || "계좌번호"} ({account.bankHolder || "예금주"})</b>
            </div>
          </section>
        ))}
      </div>

      {!secondaryExists ? (
        <button
          type="button"
          onClick={() => onChange(addSecondaryBankAccount(accounts), routing)}
          className="min-h-11 rounded-2xl border border-rose-deep bg-rose-soft px-4 text-sm font-black text-rose-deep"
        >
          + 계좌 한 개 더 추가
        </button>
      ) : null}

      <section className="rounded-2xl border border-line bg-surface-2 p-4">
        <h3 className="text-sm font-black text-ink">고객별 계좌 노출 방식</h3>
        <p className="mt-1 text-xs font-bold leading-5 text-ink-mute">첫 주문 여부는 삭제·취소·환불·테스트 주문을 제외한 실제 주문 이력으로 서버가 판단합니다.</p>

        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <button
            type="button"
            onClick={() => updateRouting({ mode: "all" })}
            className={`rounded-2xl border px-4 py-3 text-left text-sm font-black ${routing.mode === "all" ? "border-rose-deep bg-rose-soft text-rose-deep" : "border-line bg-surface text-ink-soft"}`}
          >
            전체 고객 동일 계좌
          </button>
          <button
            type="button"
            onClick={() => updateRouting({ mode: "split" })}
            className={`rounded-2xl border px-4 py-3 text-left text-sm font-black ${routing.mode === "split" ? "border-rose-deep bg-rose-soft text-rose-deep" : "border-line bg-surface text-ink-soft"}`}
          >
            기존회원 · 첫 주문 신규회원 구분
          </button>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {routing.mode === "all" ? (
            <AccountSelect
              label="전체 고객에게 보여줄 계좌"
              value={routing.allAccountId}
              accounts={accounts}
              onChange={(allAccountId) => updateRouting({ allAccountId })}
            />
          ) : (
            <>
              <AccountSelect
                label="기존회원에게 보여줄 계좌"
                value={routing.existingAccountId}
                accounts={accounts}
                onChange={(existingAccountId) => updateRouting({ existingAccountId })}
              />
              <AccountSelect
                label="첫 주문 신규회원에게 보여줄 계좌"
                value={routing.firstOrderAccountId}
                accounts={accounts}
                onChange={(firstOrderAccountId) => updateRouting({ firstOrderAccountId })}
              />
            </>
          )}
        </div>
      </section>

      <div className="whitespace-pre-line rounded-2xl border border-line bg-surface-2 px-4 py-3 text-xs font-bold leading-5 text-ink-soft">
        저장 결과 미리보기
        {"\n"}{bankRoutingSummary(accounts, routing).split("\n\n")[0]}
      </div>
    </div>
  );
}
