"use client";

// components/admin-live/ShopInfoSettingsTab.tsx
// [2026-09-08] 설정 › 상점 정보 — 손님 문의 방식 · 카드결제(페이스터) 주소 · 손님에게 보이는 입금계좌
//
//   · 저장은 /api/admin-live/shop-info (관리자 세션 + 서비스롤). 여기서 settings 를 직접 쓰지 않는다.
//   · 계좌를 바꿀 때는 바꾸기 전/후를 확인창으로 한 번 더 보여준다.
//   · 저장 후 refreshShopInfo() → 사이드바·카드결제 팝업이 새 값으로 바뀐다.
//   · 돈 로직 없음. 입금 판정·뱅크다·정산은 이 화면과 무관.

import { useEffect, useState } from "react";
import {useSettingsDraft,type SettingsDraftProps} from "./useSettingsDraft";
import {
  CONTACT_TYPE_LABEL,
  SHOP_INFO_DEFAULTS,
  contactDesc,
  contactLabel,
  validateShopInfo,
  type ShopBankAccount,
  type ShopBankRouting,
  type ShopContactType,
  type ShopInfo,
} from "@/lib/shopInfo";
import { bankRoutingSummary } from "@/lib/bankAccountEditor";
import { refreshShopInfo } from "@/lib/useShopInfo";
import { showAdminToast } from "@/lib/adminToast";
import { showAdminConfirm } from "@/lib/adminConfirm";
import BankAccountRoutingSettings from "@/components/admin-live/BankAccountRoutingSettings";

const CONTACT_TYPES: ShopContactType[] = ["channel", "kakao_id"];

const CONTACT_HINT: Record<ShopContactType, { placeholder: string; help: string }> = {
  channel: {
    placeholder: "https://pf.kakao.com/_xxxxx",
    help: "카카오톡 채널 관리자센터 › 채널 정보 › 「채널 URL」을 그대로 붙여 넣으세요.",
  },
  kakao_id: {
    placeholder: "예: ruru_live",
    help: "카카오톡 › 설정 › 프로필 관리 › 「카카오톡 ID」. 손님이 누르면 ID가 복사되고 친구 추가 안내가 뜹니다.",
  },
};

const cardClass = "rounded-2xl border border-line bg-surface p-5";
const inputClass =
  "h-11 w-full rounded-2xl border border-line bg-surface px-4 text-sm font-bold text-ink outline-none transition focus:border-rose-deep focus:ring-4 focus:ring-rose-soft";

function Field({
  label,
  desc,
  children,
}: {
  label: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface-2 p-4">
      <div className="text-sm font-black text-ink">{label}</div>
      {desc ? <div className="mt-1 text-xs font-bold leading-5 text-ink-mute">{desc}</div> : null}
      <div className="mt-3">{children}</div>
    </div>
  );
}

function sectionTitle(title: string, desc: string) {
  return (
    <div className="mb-4">
      <h2 className="text-base font-black text-ink">{title}</h2>
      <p className="mt-1 text-xs font-bold text-ink-mute">{desc}</p>
    </div>
  );
}

export default function ShopInfoSettingsTab({onDraftStateChange,focusSection}:SettingsDraftProps & {focusSection?:"bank"|"payster"} = {}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [storedKeys, setStoredKeys] = useState(0);
  /** 서버에서 마지막으로 읽은 값 — 계좌 변경 확인창에서 "바꾸기 전" 으로 쓴다 */
  const [saved, setSaved] = useState<ShopInfo>(SHOP_INFO_DEFAULTS);

  const [contactType, setContactType] = useState<ShopContactType>(SHOP_INFO_DEFAULTS.contactType);
  const [contactValue, setContactValue] = useState(SHOP_INFO_DEFAULTS.contactValue);
  const [adminChatUrl, setAdminChatUrl] = useState(SHOP_INFO_DEFAULTS.adminChatUrl);
  const [paysterUrl, setPaysterUrl] = useState(SHOP_INFO_DEFAULTS.paysterUrl);
  const [bankAccounts, setBankAccounts] = useState<ShopBankAccount[]>(SHOP_INFO_DEFAULTS.bankAccounts);
  const [bankRouting, setBankRouting] = useState<ShopBankRouting>(SHOP_INFO_DEFAULTS.bankRouting);

  const applyInfo = (info: ShopInfo) => {
    setSaved(info);
    setContactType(info.contactType);
    setContactValue(info.contactValue);
    setAdminChatUrl(info.adminChatUrl);
    setPaysterUrl(info.paysterUrl);
    setBankAccounts(info.bankAccounts.map((account) => ({ ...account })));
    setBankRouting({
      ...info.bankRouting,
      firstOrderWindow: { ...info.bankRouting.firstOrderWindow },
    });
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/admin-live/shop-info", { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as { ok?: boolean; info?: ShopInfo; storedKeys?: number; error?: string } | null;
        if (!alive) return;
        if (!res.ok || !json?.ok || !json.info) {
          showAdminToast("상점 정보 불러오기 실패\n\n" + (json?.error || `HTTP ${res.status}`), "error");
          return;
        }
        applyInfo(json.info);
        setStoredKeys(Number(json.storedKeys || 0));
      } catch (error) {
        if (alive) showAdminToast("상점 정보 불러오기 실패\n\n" + (error instanceof Error ? error.message : String(error)), "error");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // 미리보기용 — 입력 중인 값으로 손님 화면 문구를 만든다(검사 전이라 대충이어도 됨)
  const primaryDraft = bankAccounts.find((account) => account.id === "primary") || SHOP_INFO_DEFAULTS.bankAccounts[0];
  const draft: ShopInfo = {
    contactType,
    contactValue: contactValue.trim(),
    adminChatUrl,
    paysterUrl,
    bankName: primaryDraft.bankName,
    bankAccount: primaryDraft.bankAccount,
    bankHolder: primaryDraft.bankHolder,
    bankAccounts,
    bankRouting,
  };
  const draftValidation = validateShopInfo(draft);

  const onChangeType = (next: ShopContactType) => {
    if (next === contactType) return;
    setContactType(next);
    // 방식이 바뀌면 값 칸은 비운다 — 채널 주소를 ID 칸에 남겨두면 헷갈리니까
    setContactValue("");
    if (next !== "channel") setAdminChatUrl("");
  };

  const save = async ():Promise<boolean> => {
    const checked = validateShopInfo(draft);
    if (!checked.ok) {
      showAdminToast(checked.message, "error");
      return false;
    }
    const next = checked.value;

    const bankChanged =
      JSON.stringify(next.bankAccounts) !== JSON.stringify(saved.bankAccounts) ||
      JSON.stringify(next.bankRouting) !== JSON.stringify(saved.bankRouting);
    if (bankChanged) {
      const ok = await showAdminConfirm(
        [
          "손님에게 보이는 입금계좌와 고객별 노출 방식을 바꿉니다.",
          "",
          "바꾸기 전",
          bankRoutingSummary(saved.bankAccounts, saved.bankRouting),
          "",
          "바꾼 후",
          bankRoutingSummary(next.bankAccounts, next.bankRouting),
          "",
          "이미 접수된 주문에는 주문 당시 계좌가 그대로 유지되고, 새 주문부터 변경된 기준이 적용됩니다.",
        ].join("\n"),
        { title: "입금계좌·노출방식 변경 확인", confirmText: "확인 후 저장", cancelText: "취소", tone: "danger" },
      );
      if (!ok) return false;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin-live/shop-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; info?: ShopInfo; storedKeys?: number; error?: string } | null;
      if (!res.ok || !json?.ok || !json.info) {
        showAdminToast("상점 정보 저장 실패\n\n" + (json?.error || `HTTP ${res.status}`), "error");
        return false;
      }
      applyInfo(json.info);
      setStoredKeys(Number(json.storedKeys || 0));
      await refreshShopInfo();
      showAdminToast("상점 정보를 저장했습니다. 손님 화면과 사이드바에 바로 반영됩니다.", "success");
      markSaved({contactType:json.info.contactType,contactValue:json.info.contactValue,adminChatUrl:json.info.adminChatUrl,paysterUrl:json.info.paysterUrl,bankAccounts:json.info.bankAccounts,bankRouting:json.info.bankRouting});
      return true;
    } catch (error) {
      showAdminToast("상점 정보 저장 실패\n\n" + (error instanceof Error ? error.message : String(error)), "error");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const markSaved=useSettingsDraft({value:{contactType,contactValue,adminChatUrl,paysterUrl,bankAccounts,bankRouting},loading,saving,save,onDraftStateChange});
  useEffect(()=>{if (!loading && focusSection) {const target=document.getElementById(`shop-setting-${focusSection}`);target?.scrollIntoView({block:"start"});target?.focus();}},[loading,focusSection]);
  const hint = CONTACT_HINT[contactType];

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        {storedKeys === 0 && !loading ? (
          <div className="rounded-2xl border border-line bg-surface-2 px-4 py-3 text-xs font-bold leading-5 text-ink-soft">
            아직 저장한 적이 없어 코드에 적혀 있던 값이 그대로 보이고 있습니다. 내용을 확인하고 한 번 저장해 두면 이 화면 값이 기준이 됩니다.
          </div>
        ) : null}

        {/* ── 손님 문의 방식 ── */}
        <div className={cardClass}>
          {sectionTitle("손님 문의 받는 방법", "손님 주문서·주문조회·홈 화면의 「문의하기」 버튼이 여기서 고른 방식으로 바뀝니다.")}
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-2">
              {CONTACT_TYPES.map((type) => {
                const active = type === contactType;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => onChangeType(type)}
                    className={`rounded-2xl border px-3 py-3 text-left text-sm font-black transition ${
                      active ? "border-rose-deep bg-rose-soft text-rose-deep" : "border-line bg-surface-2 text-ink-soft hover:opacity-90"
                    }`}
                  >
                    {CONTACT_TYPE_LABEL[type]}
                  </button>
                );
              })}
            </div>

            <Field label={contactType === "kakao_id" ? "카카오톡 ID" : `${CONTACT_TYPE_LABEL[contactType]} 주소`} desc={hint.help}>
              <input
                value={contactValue}
                onChange={(e) => setContactValue(e.target.value)}
                placeholder={hint.placeholder}
                spellCheck={false}
                autoComplete="off"
                className={inputClass}
              />
            </Field>

            {contactType === "channel" ? (
              <Field
                label="관리자 채팅 콘솔 주소 (선택)"
                desc="사이드바 「카톡채널」 버튼이 여는 주소입니다. 카카오 비즈니스 › 채팅 화면 주소를 넣으면 손님 채널이 아니라 관리자 채팅창이 바로 열립니다. 비우면 위 채널 주소가 열립니다."
              >
                <input
                  value={adminChatUrl}
                  onChange={(e) => setAdminChatUrl(e.target.value)}
                  placeholder="https://business.kakao.com/_xxxxx/chats"
                  spellCheck={false}
                  autoComplete="off"
                  className={inputClass}
                />
              </Field>
            ) : null}

            <div className="rounded-2xl border border-line bg-surface-2 px-4 py-3 text-xs font-bold leading-5 text-ink-soft">
              손님 화면 미리보기 — 버튼: <b className="text-ink">{contactLabel(draft, "long")}</b>
              <br />
              설명: {contactDesc(draft)}
            </div>
          </div>
        </div>

        {/* ── 카드결제(페이스터) ── */}
        <div id="shop-setting-payster" tabIndex={-1} className={cardClass}>
          {sectionTitle("카드결제(페이스터) 주소", "사이드바 「카드결제」 버튼과 주문표의 카드결제 팝업이 여는 페이스터 문자결제 페이지입니다.")}
          <Field label="페이스터 문자결제 페이지 주소">
            <input
              value={paysterUrl}
              onChange={(e) => setPaysterUrl(e.target.value)}
              placeholder="https://user.service.payster.co.kr/#/payment/smspayment"
              spellCheck={false}
              autoComplete="off"
              className={inputClass}
            />
          </Field>
        </div>

        {/* ── 입금계좌 ── */}
        <div id="shop-setting-bank" tabIndex={-1} className={cardClass}>
          {sectionTitle("무통장 입금계좌와 고객별 노출", "현재 계좌를 유지하면서 계좌 한 개를 더 등록하고, 전체 고객 또는 기존회원·첫 주문 신규회원별로 보여줄 계좌를 선택합니다.")}
          <BankAccountRoutingSettings
            accounts={bankAccounts}
            routing={bankRouting}
            onChange={(nextAccounts, nextRouting) => {
              setBankAccounts(nextAccounts);
              setBankRouting(nextRouting);
            }}
          />
        </div>
      </div>

      {/* 자체 저장바 — 하단 공통 저장바(운영값)와 분리. 이 탭은 API 로만 저장 */}
      <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
        <span className="text-xs font-bold text-ink-mute">{loading ? "불러오는 중..." : "저장 즉시 손님 화면·사이드바에 반영됩니다."}</span>
        <button
          type="button"
          onClick={save}
          disabled={saving || loading || !draftValidation.ok}
          className="rounded-2xl bg-rose-deep px-6 py-2.5 text-sm font-black text-white shadow-sm transition hover:opacity-90 disabled:cursor-wait disabled:opacity-50"
        >
          {saving ? "저장중..." : draftValidation.ok ? "상점 정보 저장" : "입력값 확인 필요"}
        </button>
      </div>
    </div>
  );
}
