"use client";

// components/admin-live/ShopInfoSettingsTab.tsx
// [2026-09-08] 설정 › 상점 정보 — 손님 문의 방식 · 카드결제(페이스터) 주소 · 손님에게 보이는 입금계좌
//
//   · 저장은 /api/admin-live/shop-info (관리자 세션 + 서비스롤). 여기서 settings 를 직접 쓰지 않는다.
//   · 계좌를 바꿀 때는 바꾸기 전/후를 확인창으로 한 번 더 보여준다.
//   · 저장 후 refreshShopInfo() → 사이드바·카드결제 팝업이 새 값으로 바뀐다.
//   · 돈 로직 없음. 입금 판정·뱅크다·정산은 이 화면과 무관.

import { useEffect, useState } from "react";
import {
  CONTACT_TYPE_LABEL,
  SHOP_INFO_DEFAULTS,
  contactDesc,
  contactLabel,
  validateShopInfo,
  type ShopContactType,
  type ShopInfo,
} from "@/lib/shopInfo";
import { refreshShopInfo } from "@/lib/useShopInfo";
import { showAdminToast } from "@/lib/adminToast";
import { showAdminConfirm } from "@/lib/adminConfirm";

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

export default function ShopInfoSettingsTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [storedKeys, setStoredKeys] = useState(0);
  /** 서버에서 마지막으로 읽은 값 — 계좌 변경 확인창에서 "바꾸기 전" 으로 쓴다 */
  const [saved, setSaved] = useState<ShopInfo>(SHOP_INFO_DEFAULTS);

  const [contactType, setContactType] = useState<ShopContactType>(SHOP_INFO_DEFAULTS.contactType);
  const [contactValue, setContactValue] = useState(SHOP_INFO_DEFAULTS.contactValue);
  const [adminChatUrl, setAdminChatUrl] = useState(SHOP_INFO_DEFAULTS.adminChatUrl);
  const [paysterUrl, setPaysterUrl] = useState(SHOP_INFO_DEFAULTS.paysterUrl);
  const [bankName, setBankName] = useState(SHOP_INFO_DEFAULTS.bankName);
  const [bankAccount, setBankAccount] = useState(SHOP_INFO_DEFAULTS.bankAccount);
  const [bankHolder, setBankHolder] = useState(SHOP_INFO_DEFAULTS.bankHolder);

  const applyInfo = (info: ShopInfo) => {
    setSaved(info);
    setContactType(info.contactType);
    setContactValue(info.contactValue);
    setAdminChatUrl(info.adminChatUrl);
    setPaysterUrl(info.paysterUrl);
    setBankName(info.bankName);
    setBankAccount(info.bankAccount);
    setBankHolder(info.bankHolder);
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
  const draft: ShopInfo = { contactType, contactValue: contactValue.trim(), adminChatUrl, paysterUrl, bankName, bankAccount, bankHolder };

  const onChangeType = (next: ShopContactType) => {
    if (next === contactType) return;
    setContactType(next);
    // 방식이 바뀌면 값 칸은 비운다 — 채널 주소를 ID 칸에 남겨두면 헷갈리니까
    setContactValue("");
    if (next !== "channel") setAdminChatUrl("");
  };

  const save = async () => {
    const checked = validateShopInfo(draft);
    if (!checked.ok) {
      showAdminToast(checked.message, "error");
      return;
    }
    const next = checked.value;

    const bankChanged =
      next.bankName !== saved.bankName || next.bankAccount !== saved.bankAccount || next.bankHolder !== saved.bankHolder;
    if (bankChanged) {
      const ok = await showAdminConfirm(
        [
          "손님에게 보이는 입금계좌를 바꿉니다. 저장 즉시 주문서·주문조회 화면에 새 계좌가 나갑니다.",
          "",
          `바꾸기 전: ${saved.bankName} ${saved.bankAccount} (${saved.bankHolder})`,
          `바꾼 후:   ${next.bankName} ${next.bankAccount} (${next.bankHolder})`,
          "",
          "뱅크다 자동입금확인에 등록된 계좌와 다르면 입금이 자동으로 확인되지 않습니다. 뱅크다 쪽도 같은 계좌인지 꼭 확인하세요.",
        ].join("\n"),
        { title: "입금계좌 변경 확인", confirmText: "계좌 바꾸기", cancelText: "취소", tone: "danger" },
      );
      if (!ok) return;
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
        return;
      }
      applyInfo(json.info);
      setStoredKeys(Number(json.storedKeys || 0));
      await refreshShopInfo();
      showAdminToast("상점 정보를 저장했습니다. 손님 화면과 사이드바에 바로 반영됩니다.", "success");
    } catch (error) {
      showAdminToast("상점 정보 저장 실패\n\n" + (error instanceof Error ? error.message : String(error)), "error");
    } finally {
      setSaving(false);
    }
  };

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
        <div className={cardClass}>
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
        <div className={cardClass}>
          {sectionTitle("무통장 입금계좌 (손님에게 보이는 계좌)", "주문완료 화면과 주문조회 「입금 계좌 보기」에 나가고, 「계좌번호 복사」로 복사되는 값입니다.")}
          <div className="mb-3 rounded-2xl border border-line bg-danger-bg px-4 py-3 text-xs font-bold leading-5 text-danger-tx">
            뱅크다 자동입금확인은 뱅크다에 등록한 계좌로 돌아갑니다. 여기 계좌를 바꾸면 뱅크다에 등록된 계좌도 같은 계좌인지 꼭 확인하세요. 다르면 손님이 입금해도 자동으로 확인되지 않습니다.
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="은행">
              <input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="예: 새마을금고" className={inputClass} />
            </Field>
            <Field label="계좌번호" desc="숫자만(하이픈 가능). 손님이 복사하는 값 그대로.">
              <input
                value={bankAccount}
                onChange={(e) => setBankAccount(e.target.value.replace(/[^0-9-]/g, ""))}
                inputMode="numeric"
                placeholder="예: 9002186993725"
                className={inputClass}
              />
            </Field>
            <Field label="예금주">
              <input value={bankHolder} onChange={(e) => setBankHolder(e.target.value)} placeholder="예: 홍길동" className={inputClass} />
            </Field>
          </div>
          <div className="mt-3 rounded-2xl border border-line bg-surface-2 px-4 py-3 text-xs font-bold leading-5 text-ink-soft">
            손님 화면 미리보기 — <b className="text-ink">{bankName || "은행"} {bankAccount || "계좌번호"} ({bankHolder || "예금주"})</b>
          </div>
        </div>
      </div>

      {/* 자체 저장바 — 하단 공통 저장바(운영값)와 분리. 이 탭은 API 로만 저장 */}
      <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
        <span className="text-xs font-bold text-ink-mute">{loading ? "불러오는 중..." : "저장 즉시 손님 화면·사이드바에 반영됩니다."}</span>
        <button
          type="button"
          onClick={save}
          disabled={saving || loading}
          className="rounded-2xl bg-rose-deep px-6 py-2.5 text-sm font-black text-white shadow-sm transition hover:opacity-90 disabled:cursor-wait disabled:opacity-50"
        >
          {saving ? "저장중..." : "상점 정보 저장"}
        </button>
      </div>
    </div>
  );
}
