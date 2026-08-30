"use client";

// components/customer/CustomerInfoEditBottomSheet.tsx
// 구조: 정보수정 바텀시트 → 배송지 관리 풀스크린 바텀시트 → 배송지 추가/수정 풀스크린 바텀시트
// 주소검색은 항상 최상위에서 열림 (zIndex stacking context 문제 해결)
// 주의: UI 전용. DB/API/주문/입금/정산 로직 없음.

import { useEffect, useState, type CSSProperties } from "react";
import { isOrderablePhone, isMobileOrderPhone } from "@/lib/order/phone";
import SheetGrabber from "@/components/customer/SheetGrabber";

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
  const [screen, setScreen] = useState<Screen>(initialScreen ?? "info");
  const [editingAddrIndex, setEditingAddrIndex] = useState<number | null>(null);
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

  const handleSaveAddrForm = () => {
    // [2026-08-31 전수조사 수정 · 오배송 위험] 빈 주소도 저장되고,
    //   새 주소를 "추가"해도 주문은 옛 기본배송지로 나갔다(방금 만든 주소가 적용 안 됨).
    //   손님은 새 주소로 갈 거라 믿는데 택배는 옛 집으로 가는 구조였다.
    if (!addrForm.name.trim()) { window.alert("받는 분 이름을 입력해 주세요."); return; }
    if (!String(addrForm.phone || "").trim()) { window.alert("받는 분 연락처를 입력해 주세요."); return; }
    if (!addrForm.address.trim()) { window.alert("주소를 입력해 주세요. (주소검색 버튼을 눌러주세요)"); return; }

    const nextAddresses = editingAddrIndex !== null
      ? shippingAddresses.map((a, i) => i === editingAddrIndex ? { ...addrForm } : a)
      : [...shippingAddresses, { ...addrForm, isDefault: shippingAddresses.length === 0 }];
    onSaveShippingAddresses?.(nextAddresses);
    // 방금 저장한 주소(추가든 수정이든)를 이번 주문에 바로 적용한다.
    //   방금 입력한 주소 = 손님이 지금 쓰려는 주소다. 기본배송지 별표는 그대로 둔다.
    const saved = editingAddrIndex !== null ? nextAddresses[editingAddrIndex] : nextAddresses[nextAddresses.length - 1];
    if (saved) onSelectShippingAddress?.(saved.address, saved.detailAddress ?? "", saved.name, saved.phone, saved.zipcode ?? "");
    setScreen("shipping_list");
    setEditingAddrIndex(null);
  };

  const handleDeleteAddr = (index: number) => {
    const next = shippingAddresses.filter((_, i) => i !== index);
    if (shippingAddresses[index].isDefault && next.length > 0) next[0].isDefault = true;
    onSaveShippingAddresses?.(next);
    // 삭제 후 결과 배열의 기본배송지를 주문 단일 state에 즉시 동기화.
    const def = next.find((a) => a.isDefault) ?? next[0];
    if (def) onSelectShippingAddress?.(def.address, def.detailAddress ?? "", def.name, def.phone, def.zipcode ?? "");
  };

  const handleSetDefault = (index: number) => {
    const target = shippingAddresses[index];
    if (!target) return;
    // 기본 배송지로 설정한 항목을 배열 맨 앞으로 이동하고 isDefault 갱신.
    const reordered = [
      { ...target, isDefault: true },
      ...shippingAddresses.filter((_, i) => i !== index).map((x) => ({ ...x, isDefault: false })),
    ];
    onSaveShippingAddresses?.(reordered);
    // 기본 배송지로 설정하면 곧 주문 주소로도 적용한다.
    onSelectShippingAddress?.(target.address, target.detailAddress, target.name, target.phone, target.zipcode);
  };

  // 주소검색 — 현재 팝업 위에서 열림 (order/page.tsx의 openAddressSearch가 최상위 zIndex로 처리)
  const handleAddressSearch = () => {
    onOpenAddressSearchForForm?.((addr, zipcode) => {
      setAddrForm((f) => ({ ...f, address: addr, zipcode: zipcode || "" }));
    });
  };

  const sheetStyle: CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: 90,
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    background: "rgba(15,23,42,0.45)",
  };

  const panelStyle: CSSProperties = {
    width: "100%",
    maxWidth: "560px",
    margin: "0 auto",
    background: "#F7F4F1",
    borderRadius: "20px 20px 0 0",
    overflow: "hidden",
    maxHeight: "92vh",
    display: "flex",
    flexDirection: "column",
  };

  const headerStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 20px 12px",
    borderBottom: "1px solid #F0EBE6",
    background: "#fff",
    flexShrink: 0,
  };

  // ── 배송지 추가/수정 폼 화면 ──
  if (screen === "shipping_form") {
    return (
      <div style={sheetStyle} role="dialog" aria-modal="true">
        <div style={panelStyle}>
          {/* 헤더 */}
          <div style={headerStyle}>
            <button type="button" onClick={() => setScreen("shipping_list")}
              style={{ background: "none", border: "none", fontSize: "22px", color: "#555", cursor: "pointer", padding: "0 4px", lineHeight: 1 }}>
              ‹
            </button>
            <div style={{ fontSize: "17px", fontWeight: 800, color: "#7A1E47" }}>
              {editingAddrIndex !== null ? "배송지 수정" : "배송지 추가"}
            </div>
            <div style={{ width: "32px" }} />
          </div>

          {/* 폼 */}
          <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label style={labelStyle}>받는 분</label>
                <input value={addrForm.name} onChange={(e) => setAddrForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="이름" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>연락처</label>
                <input value={addrForm.phone} onChange={(e) => setAddrForm((f) => ({ ...f, phone: formatKoreanPhone(e.target.value) }))}
                  placeholder="010-0000-0000" inputMode="numeric" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>주소</label>
                <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                  <input value={addrForm.zipcode || ""} readOnly placeholder="우편번호"
                    style={{ ...inputStyle, width: "120px", flex: "none", background: "#F7F4F1", color: "#888" }} />
                  <button type="button" onClick={handleAddressSearch}
                    style={{ flex: 1, height: "48px", background: "#7A1E47", color: "#fff", border: "none", borderRadius: "12px", fontSize: "14px", fontWeight: 700, cursor: "pointer" }}>
                    주소검색
                  </button>
                </div>
                <input value={addrForm.address} onChange={(e) => setAddrForm((f) => ({ ...f, address: e.target.value }))}
                  placeholder="기본 주소" style={{ ...inputStyle, marginBottom: "8px" }} />
                <input value={addrForm.detailAddress} onChange={(e) => setAddrForm((f) => ({ ...f, detailAddress: e.target.value }))}
                  placeholder="상세 주소 (동/호수 등)" style={inputStyle} />
              </div>
            </div>
          </div>

          {/* 저장 버튼 */}
          <div style={{ display: "grid", gridTemplateColumns: "0.78fr 1.22fr", gap: "8px", borderTop: "1px solid #E8E2DD", background: "#fff", padding: "12px 16px calc(14px + env(safe-area-inset-bottom))", flexShrink: 0 }}>
            <button type="button" onClick={() => setScreen("shipping_list")}
              style={{ display: "flex", minHeight: "50px", alignItems: "center", justifyContent: "center", borderRadius: "14px", border: "1px solid #D9C5CC", background: "#fff", fontSize: "15px", fontWeight: 800, color: "#666", cursor: "pointer" }}>
              취소
            </button>
            <button type="button" onClick={handleSaveAddrForm}
              style={{ display: "flex", minHeight: "50px", alignItems: "center", justifyContent: "center", borderRadius: "14px", border: "none", background: "#7A1E47", color: "#fff", fontSize: "15px", fontWeight: 800, cursor: "pointer" }}>
              저장
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── 배송지 관리 화면 ──
  if (screen === "shipping_list") {
    return (
      <div style={sheetStyle} role="dialog" aria-modal="true">
        <div style={panelStyle}>
          {/* 헤더 */}
          <div style={headerStyle}>
            <button type="button" onClick={() => setScreen("info")}
              style={{ background: "none", border: "none", fontSize: "22px", color: "#555", cursor: "pointer", padding: "0 4px", lineHeight: 1 }}>
              ‹
            </button>
            <div style={{ fontSize: "17px", fontWeight: 800, color: "#7A1E47" }}>배송지 관리</div>
            <button type="button" onClick={handleClose}
              style={{ background: "none", border: "none", fontSize: "22px", color: "#888", cursor: "pointer", padding: "0 4px", lineHeight: 1 }}>
              ×
            </button>
          </div>

          {/* 목록 */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#888" }}>등록한 배송지</div>
              <button type="button" onClick={openAddForm}
                style={{ background: "none", border: "none", fontSize: "14px", fontWeight: 700, color: "#7A1E47", cursor: "pointer", padding: "0" }}>
                + 추가
              </button>
            </div>

            {shippingAddresses.length === 0 ? (
              <div style={{ textAlign: "center", padding: "48px 0", color: "#7B736D", fontSize: "14px" }}>
                등록된 배송지가 없어요
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", paddingBottom: "16px" }}>
                {shippingAddresses.map((addr, index) => (
                  <div key={index} style={{ background: "#fff", borderRadius: "16px", padding: "16px", border: addr.isDefault ? "1.5px solid #7A1E47" : "1px solid #E8E2DD" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        {addr.isDefault && (
                          <span style={{ background: "#7A1E47", color: "#fff", fontSize: "10px", fontWeight: 700, borderRadius: "4px", padding: "2px 7px" }}>✅ 기본 배송지</span>
                        )}
                        <span style={{ fontSize: "15px", fontWeight: 800, color: "#222" }}>{addr.name || "이름 없음"}</span>
                      </div>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button type="button" onClick={() => openEditForm(index)}
                          style={{ border: "1px solid #D9C5CC", color: "#555", background: "#fff", borderRadius: "6px", padding: "4px 10px", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>
                          수정
                        </button>
                        <button type="button" onClick={() => handleDeleteAddr(index)}
                          style={{ border: "1px solid #D9C5CC", color: "#e74c3c", background: "#fff", borderRadius: "6px", padding: "4px 10px", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>
                          삭제
                        </button>
                      </div>
                    </div>
                    <div style={{ fontSize: "13px", color: "#666", marginBottom: "2px" }}>연락처: {addr.phone || "-"}</div>
                    {addr.zipcode && <div style={{ fontSize: "13px", color: "#888", marginBottom: "2px" }}>({addr.zipcode})</div>}
                    <div style={{ fontSize: "13px", color: "#555", marginBottom: "12px" }}>{addr.address}{addr.detailAddress ? ` ${addr.detailAddress}` : ""}</div>
                    {!addr.isDefault && (
                      <button type="button" onClick={() => handleSetDefault(index)}
                        style={{ width: "100%", height: "38px", border: "1px solid #0F6E56", color: "#0F6E56", background: "#E7F3EE", borderRadius: "10px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
                        기본 배송지로 설정
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── 정보수정 시트 (기본 화면) ──
  return (
    <div style={sheetStyle} role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
      <div data-sheet style={panelStyle}>
        {/* 핸들 */}
        <SheetGrabber onClose={handleClose} style={{ paddingTop: "8px", paddingBottom: 0, background: "#fff" }} />

        {/* 헤더 */}
        <div style={{ padding: "12px 20px 10px", borderBottom: "1px solid #F0EBE6", background: "#fff", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
            <span style={{ fontSize: "20px", fontWeight: 800, color: "#7A1E47" }}>정보수정</span>
            <span style={{ fontSize: "13px", color: "#7B736D", fontWeight: 600 }}>배송정보 확인</span>
          </div>
          <div style={{ fontSize: "12px", color: "#7B736D", marginTop: "4px" }}>주문 전 닉네임, 연락처, 주소가 맞는지 확인해 주세요.</div>
        </div>

        {/* 본문 */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>

            {/* 유튜브 닉네임 */}
            <div style={{ borderRadius: "16px", background: "#fff", padding: "14px", border: "1px solid #E8E2DD" }}>
              <label style={labelStyle}>유튜브 닉네임</label>
              <input value={youtubeNickname} onChange={(e) => onYoutubeNicknameChange(e.target.value)} style={inputStyle} />
              {youtubeNicknameError ? (
                <div style={{ marginTop: "6px", fontSize: "12px", color: "#e74c3c", fontWeight: 600 }}>{youtubeNicknameError}</div>
              ) : (
                <div style={{ marginTop: "6px", fontSize: "12px", color: "#7B736D" }}>현재 보이는 닉네임과 다르면 주문 누락이 생길 수 있습니다.</div>
              )}
            </div>

            {/* 주문하시는 분 휴대폰 번호 — 회원 식별 + 알림톡 받는 번호 */}
            <div style={{ borderRadius: "16px", background: "#fff", padding: "14px", border: ordererPhoneOk ? "1px solid #E8E2DD" : "2px solid #e74c3c" }}>
              <label style={labelStyle}>📱 주문하시는 분 연락처</label>
              <input
                value={customerPhone}
                onChange={(e) => onCustomerPhoneChange(e.target.value)}
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="010-1234-5678"
                style={{ ...inputStyle, ...(ordererPhoneOk ? {} : { borderColor: "#e74c3c", background: "#FFF5F5" }) }}
              />
              {ordererPhoneOk ? (
                ordererPhoneIsMobile ? (
                  <div style={{ marginTop: "6px", fontSize: "12px", color: "#7B736D" }}>배송지 연락처와 달라도 괜찮습니다. 이 번호로 주문·입금 확인이 연결됩니다.</div>
                ) : (
                  <div style={{ marginTop: "6px", fontSize: "11.5px", color: "#8A6A1E", background: "#FFF8E6", border: "1px solid #F0E0B0", borderRadius: "8px", padding: "8px 10px", lineHeight: 1.7 }}>
                    <b>집·사무실 전화번호로 주문하셔도 됩니다.</b><br />
                    다만 이 번호로는 <b>카드결제 링크</b>와 <b>방송 시작 알림톡</b>을 보내드릴 수 없어요.
                  </div>
                )
              ) : (
                <div style={{ marginTop: "6px", fontSize: "12px", color: "#e74c3c", fontWeight: 700, lineHeight: 1.6 }}>
                  이 번호로는 주문서를 낼 수 없어요.<br />
                  휴대폰(010…) 또는 집·사무실 전화(02…, 031…)를 넣어주세요.
                </div>
              )}
            </div>

            {/* 기본 배송지 */}
            <div style={{ borderRadius: "16px", background: "#fff", padding: "14px", border: "1px solid #E8E2DD" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                <label style={{ ...labelStyle, marginBottom: 0 }}>🚚 기본 배송지</label>
                <button type="button" onClick={() => setScreen("shipping_list")}
                  style={{ background: "none", border: "none", fontSize: "13px", fontWeight: 700, color: "#7A1E47", cursor: "pointer", padding: "0", display: "flex", alignItems: "center", gap: "2px" }}>
                  배송지 관리 <span style={{ fontSize: "16px" }}>›</span>
                </button>
              </div>
              {defaultAddr ? (
                <button type="button" onClick={() => setScreen("shipping_list")}
                  style={{ width: "100%", background: "#F7F4F1", borderRadius: "12px", padding: "12px 14px", border: "none", textAlign: "left", cursor: "pointer" }}>
                  <div style={{ fontSize: "14px", fontWeight: 800, color: "#222", marginBottom: "3px" }}>{defaultAddr.name}</div>
                  <div style={{ fontSize: "12px", color: "#888", marginBottom: "2px" }}>{defaultAddr.phone}</div>
                  {defaultAddr.zipcode && <div style={{ fontSize: "12px", color: "#aaa", marginBottom: "2px" }}>({defaultAddr.zipcode})</div>}
                  <div style={{ fontSize: "12px", color: "#555" }}>{defaultAddr.address}{defaultAddr.detailAddress ? ` ${defaultAddr.detailAddress}` : ""}</div>
                </button>
              ) : (
                <button type="button" onClick={() => setScreen("shipping_list")}
                  style={{ width: "100%", padding: "14px", border: "1px dashed #E5E1DC", borderRadius: "12px", background: "#fff", fontSize: "13px", color: "#7B736D", cursor: "pointer" }}>
                  + 배송지 추가
                </button>
              )}
            </div>

          </div>
        </div>

        {/* footer */}
        <footer style={{ display: "grid", flexShrink: 0, gridTemplateColumns: "0.78fr 1.22fr", gap: "8px", borderTop: "1px solid #E8E2DD", background: "#fff", padding: "12px 16px calc(14px + env(safe-area-inset-bottom))" }}>
          <button type="button" onClick={handleClose} disabled={saving}
            style={{ display: "flex", minHeight: "50px", alignItems: "center", justifyContent: "center", borderRadius: "14px", border: "1px solid #D9C5CC", background: "#fff", fontSize: "15px", fontWeight: 800, color: "#666", cursor: saving ? "default" : "pointer", opacity: saving ? 0.45 : 1 }}>
            취소
          </button>
          <button type="button" onClick={onSave} disabled={saving}
            style={{ display: "flex", minHeight: "50px", alignItems: "center", justifyContent: "center", borderRadius: "14px", border: "none", background: saving ? "#cbd5e1" : "#7A1E47", fontSize: "15px", fontWeight: 800, color: "#fff", cursor: saving ? "default" : "pointer" }}>
            {saving ? "저장 중..." : "저장"}
          </button>
        </footer>
      </div>
    </div>
  );
}
