"use client";

// components/customer/CustomerInfoEditBottomSheet.tsx
// 구조: 정보수정 바텀시트 → 배송지 관리 풀스크린 바텀시트 → 배송지 추가/수정 풀스크린 바텀시트
// 주소검색은 항상 최상위에서 열림 (zIndex stacking context 문제 해결)
// 주의: UI 전용. DB/API/주문/입금/정산 로직 없음.

import { useEffect, useState, type CSSProperties } from "react";
import { isOrderablePhone, isMobileOrderPhone } from "@/lib/order/phone";
// [2026-09-20] 바텀시트 «한 벌» 틀(높이·헤더·✕·닫기 5종). 세 화면(정보/배송지 목록/배송지 폼)이 한 틀 안에서 바뀐다.
import CustomerBottomSheet, { csPrimaryButtonStyle } from "@/components/customer/CustomerBottomSheet";
import { clearSavedCustomerInfo, clearCartOnLogout } from "@/lib/customer/customerSession";
import { useCustomerStageRestyle } from "@/lib/useCustomerUiStage";

type ShippingAddress = {
  name: string;
  phone: string;
  address: string;
  detailAddress: string;
  zipcode?: string;
  isDefault?: boolean;
};

type CustomerInfoEditBottomSheetProps = {
  open: boolean;
  youtubeNickname: string;
  customerName: string;
  customerPhone: string;
  youtubeNicknameError?: string;
  onYoutubeNicknameChange: (value: string) => void;
  onCustomerNameChange: (value: string) => void;
  onCustomerPhoneChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void | Promise<void>;
  shippingAddresses?: ShippingAddress[];
  onSaveShippingAddresses?: (addresses: ShippingAddress[]) => Promise<void>;
  onSelectShippingAddress?: (address: string, detailAddress: string, name?: string, phone?: string, zipcode?: string) => void;
  onOpenAddressSearchForForm?: (onPicked: (addr: string, zipcode: string) => void) => void;
  saving?: boolean;
  initialScreen?: "info" | "shipping_list" | "shipping_form";
};

const inputStyle: CSSProperties = {
  height: "48px",
  width: "100%",
  boxSizing: "border-box",
  borderRadius: "12px",
  border: "1px solid #D9C5CC",
  background: "#fff",
  padding: "0 14px",
  fontSize: "15px",
  fontWeight: 800,
  color: "#222",
  outline: "none",
};

const labelStyle: CSSProperties = {
  marginBottom: "6px",
  display: "block",
  fontSize: "12px",
  fontWeight: 800,
  color: "#888",
};

const formatKoreanPhone = (raw: string) => {
  const d = (raw || "").replace(/[^0-9]/g, "").slice(0, 11);
  if (d.length < 4) return d;
  if (d.length < 8) return d.slice(0, 3) + "-" + d.slice(3);
  return d.slice(0, 3) + "-" + d.slice(3, 7) + "-" + d.slice(7);
};

// 화면 단계: "info" | "shipping_list" | "shipping_form"
type Screen = "info" | "shipping_list" | "shipping_form";

export default function CustomerInfoEditBottomSheet({
  open,
  youtubeNickname,
  customerName,
  customerPhone,
  youtubeNicknameError,
  onYoutubeNicknameChange,
  onCustomerNameChange,
  onCustomerPhoneChange,
  onClose,
  onSave,
  shippingAddresses = [],
  onSaveShippingAddresses,
  onSelectShippingAddress,
  onOpenAddressSearchForForm,
  saving = false,
  initialScreen,
}: CustomerInfoEditBottomSheetProps) {
  // [㉜ 5단계] ?preview=s5 에서만 새 모양(로즈→흑백·13px 미만→13px·그림자 정리). 꺼지면 원래 스타일 그대로.
  const { on: v5, s: s5, c: c5 } = useCustomerStageRestyle("s5");
  const [screen, setScreen] = useState<Screen>(initialScreen ?? "info");
  const [editingAddrIndex, setEditingAddrIndex] = useState<number | null>(null);
  const [savingShipping, setSavingShipping] = useState(false);
  const [addrForm, setAddrForm] = useState<ShippingAddress>({ name: "", phone: "", address: "", detailAddress: "", zipcode: "" });

  // 시트가 열릴 때마다 initialScreen으로 진입 화면을 맞춘다.
  useEffect(() => {
    if (open) setScreen(initialScreen ?? "info");
  }, [open, initialScreen]);

  const defaultAddr = shippingAddresses.find((a) => a.isDefault) ?? shippingAddresses[0] ?? null;

  // [2026-08-30 사고수정] 손님 김지영2231 님 문의 —
  //   주문서에서 "주문하시는 분 연락처가 휴대폰이 아니라 못 냅니다" 라고 막혔는데,
  //   정작 이 「정보수정」 화면에는 주문자 전화번호를 고칠 칸이 아예 없었다.
  //   (있던 건 배송지 연락처뿐. 손님이 그걸 고쳐도 주문자 번호는 그대로라 계속 막힘.)
  //   → 여기에 주문자 휴대폰 번호 칸을 만든다. 이게 회원 식별 + 알림톡 받는 번호다.
  //   [2026-08-30] 집·사무실 전화(02·031…·070)도 주문 가능하게 열었다.
  //   단, 카드결제 링크·방송 알림톡은 휴대폰으로만 가므로 그 경우엔 노란 안내를 띄운다.
  const ordererPhoneOk = isOrderablePhone(customerPhone);
  const ordererPhoneIsMobile = isMobileOrderPhone(customerPhone);

  if (!open) return null;

  const handleClose = () => {
    setScreen("info");
    onClose();
  };

  const openAddForm = () => {
    setEditingAddrIndex(null);
    // 받는 분/연락처 기본값 = 주문자 본인(대부분 본인이 받음). 빈칸으로 두고 다른 사람으로 수정 가능.
    setAddrForm({ name: customerName || "", phone: customerPhone || "", address: "", detailAddress: "", zipcode: "" });
    setScreen("shipping_form");
  };

  const openEditForm = (index: number) => {
    const addr = shippingAddresses[index];
    setEditingAddrIndex(index);
    setAddrForm({ name: addr.name || "", phone: addr.phone || "", address: addr.address || "", detailAddress: addr.detailAddress || "", zipcode: addr.zipcode || "" });
    setScreen("shipping_form");
  };

  // 배송지 변경은 DB 저장 성공 후에만 적용한다. 실패 시 입력 화면을 유지한다.
  const persistShippingAddresses = async (next: ShippingAddress[]) => {
    if (!onSaveShippingAddresses) throw new Error("배송지 저장 기능이 연결되지 않았습니다.");
    await onSaveShippingAddresses(next);
  };
  const reportShippingSaveError = (error: unknown) => {
    console.error("배송지 저장 실패", error);
    window.alert("배송지를 저장하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.");
  };

  const handleSaveAddrForm = async () => {
    if (savingShipping) return;
    if (!addrForm.name.trim()) { window.alert("받는 분 이름을 입력해 주세요."); return; }
    if (!String(addrForm.phone || "").trim()) { window.alert("받는 분 연락처를 입력해 주세요."); return; }
    if (!addrForm.address.trim() || !/^\d{5}$/.test(String(addrForm.zipcode || ""))) {
      window.alert("주소검색 버튼으로 기본주소를 선택해 주세요.");
      return;
    }
    const nextAddresses = editingAddrIndex !== null
      ? shippingAddresses.map((a, i) => i === editingAddrIndex ? { ...addrForm } : a)
      : [...shippingAddresses, { ...addrForm, isDefault: shippingAddresses.length === 0 }];
    setSavingShipping(true);
    try {
      await persistShippingAddresses(nextAddresses);
      // 저장 완료 후에만 이번 주문의 수령 주소로 적용한다.
      const saved = editingAddrIndex !== null ? nextAddresses[editingAddrIndex] : nextAddresses[nextAddresses.length - 1];
      if (saved) onSelectShippingAddress?.(saved.address, saved.detailAddress ?? "", saved.name, saved.phone, saved.zipcode ?? "");
      setScreen("shipping_list");
      setEditingAddrIndex(null);
    } catch (error) {
      reportShippingSaveError(error);
    } finally {
      setSavingShipping(false);
    }
  };

  const handleDeleteAddr = async (index: number) => {
    if (savingShipping) return;
    const next = shippingAddresses.filter((_, i) => i !== index).map((a) => ({ ...a }));
    if (shippingAddresses[index]?.isDefault && next.length > 0) next[0].isDefault = true;
    setSavingShipping(true);
    try {
      await persistShippingAddresses(next);
      const def = next.find((a) => a.isDefault) ?? next[0];
      if (def) onSelectShippingAddress?.(def.address, def.detailAddress ?? "", def.name, def.phone, def.zipcode ?? "");
    } catch (error) {
      reportShippingSaveError(error);
    } finally {
      setSavingShipping(false);
    }
  };

  const handleSetDefault = async (index: number) => {
    if (savingShipping) return;
    const target = shippingAddresses[index];
    if (!target) return;
    const reordered = [
      { ...target, isDefault: true },
      ...shippingAddresses.filter((_, i) => i !== index).map((x) => ({ ...x, isDefault: false })),
    ];
    setSavingShipping(true);
    try {
      await persistShippingAddresses(reordered);
      onSelectShippingAddress?.(target.address, target.detailAddress, target.name, target.phone, target.zipcode);
    } catch (error) {
      reportShippingSaveError(error);
    } finally {
      setSavingShipping(false);
    }
  };

  // 주소검색 — 현재 팝업 위에서 열림 (order/page.tsx의 openAddressSearch가 최상위 zIndex로 처리)
  const handleAddressSearch = () => {
    onOpenAddressSearchForForm?.((addr, zipcode) => {
      setAddrForm((f) => ({ ...f, address: addr, zipcode: zipcode || "" }));
      window.setTimeout(() => document.getElementById("ruru-shipping-detail-address")?.focus(), 100);
    });
  };

  // [2026-09-20 사장님] 「바텀시트 전부 동일하게」 — 세 화면이 한 틀(CustomerBottomSheet)을 쓴다.
  //   · 높이·헤더·✕·배경 탭·그래버·뒤로가기·ESC 전부 틀이 맡는다.
  //   · 배송지 목록/폼 화면은 헤더 왼쪽 「‹」 로 한 단계 뒤로. ✕ 는 어느 화면에서든 시트 전체를 닫는다.
  //   · 배송지 폼 작성 중에 ✕ 를 누르면 한 번 묻는다(입력이 날아가므로). 정보 화면은 예전 「취소」와 같이 바로 닫힌다.
  //   · 푸터: 왼쪽 「취소」 삭제(✕가 대신). 주 버튼 「저장」 풀폭 1개.
  const backButton = (onBack: () => void, label: string) => (
    <button type="button" onClick={onBack} aria-label={label}
      style={s5({ width: "40px", height: "40px", borderRadius: "50%", background: "#F1ECEE", border: "none", fontSize: "22px", color: "#444", cursor: "pointer", lineHeight: 1 })}>
      ‹
    </button>
  );

  const closeGuard = () => {
    if (screen !== "shipping_form") return true;
    const typed = Boolean(addrForm.address || addrForm.detailAddress || addrForm.zipcode);
    if (!typed) return true;
    return window.confirm("작성 중인 배송지가 저장되지 않아요. 닫을까요?");
  };

  const sheetTitle =
    screen === "shipping_form" ? (editingAddrIndex !== null ? "배송지 수정" : "배송지 추가")
    : screen === "shipping_list" ? "배송지 관리"
    : "정보수정";
  const sheetSubtitle =
    screen === "info" ? "주문 전 닉네임, 연락처, 주소가 맞는지 확인해 주세요." : undefined;
  const headerLeft =
    screen === "shipping_form" ? backButton(() => setScreen("shipping_list"), "배송지 관리로")
    : screen === "shipping_list" ? backButton(() => setScreen("info"), "정보수정으로")
    : undefined;
  const footer =
    screen === "shipping_form" ? (
      <button type="button" onClick={() => { void handleSaveAddrForm(); }} disabled={savingShipping} style={s5(csPrimaryButtonStyle(!savingShipping))}>{savingShipping ? "저장 중..." : "저장"}</button>
    ) : screen === "shipping_list" ? undefined : (
      <button type="button" onClick={onSave} disabled={saving} style={s5({ ...csPrimaryButtonStyle(!saving), cursor: saving ? "default" : "pointer" })}>
        {saving ? "저장 중..." : "저장"}
      </button>
    );

  return (
    <CustomerBottomSheet tone={v5 ? "v2" : undefined}
      open
      onClose={handleClose}
      title={sheetTitle}
      subtitle={sheetSubtitle}
      headerLeft={headerLeft}
      footer={footer}
      closeGuard={closeGuard}
      closeDisabled={saving || savingShipping}
      bodyPadding={screen === "shipping_form" ? "20px 16px" : "16px"}
      bodyStyle={v5 ? { background: "#F5F5F5" } : { background: "#F7F4F1" }}
    >
      {screen === "shipping_form" ? (
        <>
            <div style={s5({ display: "flex", flexDirection: "column", gap: "12px" })}>
              <div>
                <label style={s5(labelStyle)}>받는 분</label>
                <input value={addrForm.name} onChange={(e) => setAddrForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="이름" style={s5(inputStyle)} />
              </div>
              <div>
                <label style={s5(labelStyle)}>연락처</label>
                <input value={addrForm.phone} onChange={(e) => setAddrForm((f) => ({ ...f, phone: formatKoreanPhone(e.target.value) }))}
                  placeholder="010-0000-0000" inputMode="numeric" style={s5(inputStyle)} />
              </div>
              <div>
                <label style={s5(labelStyle)}>주소</label>
                <div style={s5({ display: "flex", gap: "8px", marginBottom: "8px" })}>
                  <input value={addrForm.zipcode || ""} readOnly placeholder="우편번호"
                    style={s5({ ...inputStyle, width: "120px", flex: "none", background: "#F7F4F1", color: "#888" })} />
                  <button type="button" onClick={handleAddressSearch}
                    style={s5({ flex: 1, height: "48px", background: "#7A1E47", color: "#fff", border: "none", borderRadius: "12px", fontSize: "14px", fontWeight: 700, cursor: "pointer" })}>
                    주소검색
                  </button>
                </div>
                <input value={addrForm.address} readOnly onClick={handleAddressSearch}
                  placeholder="주소검색으로 기본주소를 선택해 주세요"
                  style={s5({ ...inputStyle, marginBottom: "8px", cursor: "pointer" })} />
                <input id="ruru-shipping-detail-address" value={addrForm.detailAddress} onChange={(e) => setAddrForm((f) => ({ ...f, detailAddress: e.target.value }))}
                  placeholder="상세 주소 (동/호수 등)" style={s5(inputStyle)} />
              </div>
            </div>
        </>
      ) : screen === "shipping_list" ? (
        <>
            <div style={s5({ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" })}>
              <div style={s5({ fontSize: "13px", fontWeight: 700, color: "#888" })}>등록한 배송지</div>
              <button type="button" onClick={openAddForm}
                style={s5({ background: "none", border: "none", fontSize: "14px", fontWeight: 700, color: "#7A1E47", cursor: "pointer", padding: "0" })}>
                + 추가
              </button>
            </div>

            {shippingAddresses.length === 0 ? (
              <div style={s5({ textAlign: "center", padding: "48px 0", color: "#6E655E", fontSize: "14px" })}>
                등록된 배송지가 없어요
              </div>
            ) : (
              <div style={s5({ display: "flex", flexDirection: "column", gap: "12px", paddingBottom: "16px" })}>
                {shippingAddresses.map((addr, index) => (
                  <div key={index} style={s5({ background: "#fff", borderRadius: "16px", padding: "16px", border: addr.isDefault ? "1.5px solid #7A1E47" : "1px solid #E8E2DD" })}>
                    <div style={s5({ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" })}>
                      <div style={s5({ display: "flex", alignItems: "center", gap: "6px" })}>
                        {addr.isDefault && (
                          <span style={s5({ background: "#7A1E47", color: "#fff", fontSize: "10px", fontWeight: 700, borderRadius: "4px", padding: "2px 7px" })}>{v5 ? "기본 배송지" : "✅ 기본 배송지"}</span>
                        )}
                        <span style={s5({ fontSize: "15px", fontWeight: 800, color: "#222" })}>{addr.name || "이름 없음"}</span>
                      </div>
                      <div style={s5({ display: "flex", gap: "6px" })}>
                        <button type="button" onClick={() => openEditForm(index)}
                          style={s5({ border: "1px solid #D9C5CC", color: "#555", background: "#fff", borderRadius: "6px", padding: "4px 10px", fontSize: "11px", fontWeight: 700, cursor: "pointer" })}>
                          수정
                        </button>
                        <button type="button" onClick={() => handleDeleteAddr(index)}
                          style={s5({ border: "1px solid #D9C5CC", color: "#e74c3c", background: "#fff", borderRadius: "6px", padding: "4px 10px", fontSize: "11px", fontWeight: 700, cursor: "pointer" })}>
                          삭제
                        </button>
                      </div>
                    </div>
                    <div style={s5({ fontSize: "13px", color: "#666", marginBottom: "2px" })}>연락처: {addr.phone || "-"}</div>
                    {addr.zipcode && <div style={s5({ fontSize: "13px", color: "#888", marginBottom: "2px" })}>({addr.zipcode})</div>}
                    <div style={s5({ fontSize: "13px", color: "#555", marginBottom: "12px" })}>{addr.address}{addr.detailAddress ? ` ${addr.detailAddress}` : ""}</div>
                    {!addr.isDefault && (
                      <button type="button" onClick={() => handleSetDefault(index)}
                        style={s5({ width: "100%", height: "38px", border: "1px solid #0F6E56", color: "#0F6E56", background: "#E7F3EE", borderRadius: "10px", fontSize: "13px", fontWeight: 700, cursor: "pointer" })}>
                        기본 배송지로 설정
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
        </>
      ) : (
        <>
          <div style={s5({ display: "flex", flexDirection: "column", gap: "12px" })}>

            {/* 유튜브 닉네임 */}
            <div style={s5({ borderRadius: "16px", background: "#fff", padding: "14px", border: "1px solid #E8E2DD" })}>
              <label style={s5(labelStyle)}>유튜브 닉네임</label>
              <input value={youtubeNickname} onChange={(e) => onYoutubeNicknameChange(e.target.value)} style={s5(inputStyle)} />
              {youtubeNicknameError ? (
                <div style={s5({ marginTop: "6px", fontSize: "12px", color: "#e74c3c", fontWeight: 600 })}>{youtubeNicknameError}</div>
              ) : (
                <div style={s5({ marginTop: "6px", fontSize: "12px", color: "#6E655E" })}>방송 채팅에 쓰는 유튜브 닉네임과 똑같이 적어 주세요.</div>
              )}
            </div>

            {/* 주문하시는 분 휴대폰 번호 — 회원 식별 + 알림톡 받는 번호 */}
            <div style={s5({ borderRadius: "16px", background: "#fff", padding: "14px", border: ordererPhoneOk ? "1px solid #E8E2DD" : "2px solid #e74c3c" })}>
              <label style={s5(labelStyle)}>{v5 ? "주문하시는 분 연락처" : "📱 주문하시는 분 연락처"}</label>
              <input
                value={customerPhone}
                onChange={(e) => onCustomerPhoneChange(e.target.value)}
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="010-1234-5678"
                style={s5({ ...inputStyle, ...(ordererPhoneOk ? {} : { borderColor: "#e74c3c", background: "#FFF5F5" }) })}
              />
              {ordererPhoneOk ? (
                ordererPhoneIsMobile ? (
                  <div style={s5({ marginTop: "6px", fontSize: "12px", color: "#6E655E" })}>{v5 ? "입금 확인·주문 조회에 쓰는 번호예요. 카드결제 링크·방송 알림톡은 휴대폰 번호로만 가요." : "배송지 연락처와 달라도 괜찮습니다. 이 번호로 주문·입금 확인이 연결됩니다."}</div>
                ) : (
                  <div style={s5({ marginTop: "6px", fontSize: "11.5px", color: "#8A6A1E", background: "#FFF8E6", border: "1px solid #F0E0B0", borderRadius: "8px", padding: "8px 10px", lineHeight: 1.7 })}>
                    {v5 ? "입금 확인·주문 조회에 쓰는 번호예요. 카드결제 링크·방송 알림톡은 휴대폰 번호로만 가요." : (
                      <>
                    <b>집·사무실 전화번호로 주문하셔도 됩니다.</b><br />
                    다만 이 번호로는 <b>카드결제 링크</b>와 <b>방송 시작 알림톡</b>을 보내드릴 수 없어요.
                      </>
                    )}
                  </div>
                )
              ) : (
                <div style={s5({ marginTop: "6px", fontSize: "12px", color: "#e74c3c", fontWeight: 700, lineHeight: 1.6 })}>
                  이 번호로는 주문서를 낼 수 없어요.<br />
                  휴대폰(010…) 또는 집·사무실 전화(02…, 031…)를 넣어주세요.
                </div>
              )}
            </div>

            {/* 기본 배송지 */}
            <div style={s5({ borderRadius: "16px", background: "#fff", padding: "14px", border: "1px solid #E8E2DD" })}>
              <div style={s5({ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" })}>
                <label style={s5({ ...labelStyle, marginBottom: 0 })}>{v5 ? "기본 배송지" : "🚚 기본 배송지"}</label>
                <button type="button" onClick={() => setScreen("shipping_list")}
                  style={s5({ background: "none", border: "none", fontSize: "13px", fontWeight: 700, color: "#7A1E47", cursor: "pointer", padding: "0", display: "flex", alignItems: "center", gap: "2px" })}>
                  배송지 관리 <span style={s5({ fontSize: "16px" })}>›</span>
                </button>
              </div>
              {defaultAddr ? (
                <button type="button" onClick={() => setScreen("shipping_list")}
                  style={s5({ width: "100%", background: "#F7F4F1", borderRadius: "12px", padding: "12px 14px", border: "none", textAlign: "left", cursor: "pointer" })}>
                  <div style={s5({ fontSize: "14px", fontWeight: 800, color: "#222", marginBottom: "3px" })}>{defaultAddr.name}</div>
                  <div style={s5({ fontSize: "12px", color: "#888", marginBottom: "2px" })}>{defaultAddr.phone}</div>
                  {defaultAddr.zipcode && <div style={s5({ fontSize: "12px", color: "#aaa", marginBottom: "2px" })}>({defaultAddr.zipcode})</div>}
                  <div style={s5({ fontSize: "12px", color: "#555" })}>{defaultAddr.address}{defaultAddr.detailAddress ? ` ${defaultAddr.detailAddress}` : ""}</div>
                </button>
              ) : (
                <button type="button" onClick={() => setScreen("shipping_list")}
                  style={s5({ width: "100%", padding: "14px", border: "1px dashed #E5E1DC", borderRadius: "12px", background: "#fff", fontSize: "13px", color: "#6E655E", cursor: "pointer" })}>
                  + 배송지 추가
                </button>
              )}
            </div>

            {/* [2026-08-31] 로그아웃 — 주문서 화면에는 로그아웃 버튼이 아예 없었다
                (함수만 있고 버튼이 연결 안 된 죽은 코드). 가족 공용 폰에서 다른 카카오
                계정으로 바꾸는 유일한 길이라 「내정보」 안에 조용히 둔다.
                clearSavedCustomerInfo 가 카카오 키까지 지운다(89f490b). */}
            <button
              type="button"
              onClick={() => {
                if (!window.confirm("로그아웃할까요?\n다시 접속하면 카카오 로그인을 새로 하게 됩니다.")) return;
                try { clearSavedCustomerInfo(); } catch { /* 저장소 접근 불가 환경 */ }
                try { clearCartOnLogout(); } catch { /* 담긴 상품·선점도 함께 정리 */ }
                window.location.href = "/";
              }}
              style={s5({ margin: "4px auto 0", display: "block", background: "none", border: "none", fontSize: "12px", fontWeight: 700, color: "#9A8F95", textDecoration: "underline", cursor: "pointer", padding: "8px" })}
            >
              로그아웃 · 다른 카카오 계정으로 바꾸기
            </button>

          </div>
        </>
      )}
    </CustomerBottomSheet>
  );
}
