"use client";

// components/customer/CustomerInfoEditBottomSheet.tsx
// 구조: 정보수정 바텀시트 → 배송지 관리 풀스크린 바텀시트 → 배송지 추가/수정 풀스크린 바텀시트
// 주소검색은 항상 최상위에서 열림 (zIndex stacking context 문제 해결)
// 주의: UI 전용. DB/API/주문/입금/정산 로직 없음.

import { useState, type CSSProperties } from "react";

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
}: CustomerInfoEditBottomSheetProps) {
  const [screen, setScreen] = useState<Screen>("info");
  const [editingAddrIndex, setEditingAddrIndex] = useState<number | null>(null);
  const [addrForm, setAddrForm] = useState<ShippingAddress>({ name: "", phone: "", address: "", detailAddress: "", zipcode: "" });

  const defaultAddr = shippingAddresses.find((a) => a.isDefault) ?? shippingAddresses[0] ?? null;

  if (!open) return null;

  const handleClose = () => {
    setScreen("info");
    onClose();
  };

  const openAddForm = () => {
    setEditingAddrIndex(null);
    setAddrForm({ name: "", phone: "", address: "", detailAddress: "", zipcode: "" });
    setScreen("shipping_form");
  };

  const openEditForm = (index: number) => {
    const addr = shippingAddresses[index];
    setEditingAddrIndex(index);
    setAddrForm({ name: addr.name || "", phone: addr.phone || "", address: addr.address || "", detailAddress: addr.detailAddress || "", zipcode: addr.zipcode || "" });
    setScreen("shipping_form");
  };

  const handleSaveAddrForm = () => {
    if (editingAddrIndex !== null) {
      onSaveShippingAddresses?.(shippingAddresses.map((a, i) => i === editingAddrIndex ? { ...addrForm } : a));
    } else {
      onSaveShippingAddresses?.([...shippingAddresses, { ...addrForm, isDefault: shippingAddresses.length === 0 }]);
    }
    setScreen("shipping_list");
    setEditingAddrIndex(null);
  };

  const handleDeleteAddr = (index: number) => {
    const next = shippingAddresses.filter((_, i) => i !== index);
    if (shippingAddresses[index].isDefault && next.length > 0) next[0].isDefault = true;
    onSaveShippingAddresses?.(next);
  };

  const handleSetDefault = (index: number) => {
    onSaveShippingAddresses?.(shippingAddresses.map((x, i) => ({ ...x, isDefault: i === index })));
  };

  const handleSelectAddr = (addr: ShippingAddress) => {
    onSelectShippingAddress?.(addr.address, addr.detailAddress, addr.name, addr.phone, addr.zipcode);
    setScreen("info");
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
    padding: "0 12px",
  };

  const panelStyle: CSSProperties = {
    width: "100%",
    maxWidth: "480px",
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
              <div style={{ textAlign: "center", padding: "48px 0", color: "#ABA5A0", fontSize: "14px" }}>
                등록된 배송지가 없어요
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", paddingBottom: "16px" }}>
                {shippingAddresses.map((addr, index) => (
                  <div key={index} style={{ background: "#fff", borderRadius: "16px", padding: "16px", border: addr.isDefault ? "1.5px solid #7A1E47" : "1px solid #E8E2DD" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        {addr.isDefault && (
                          <span style={{ background: "#7A1E47", color: "#fff", fontSize: "10px", fontWeight: 700, borderRadius: "4px", padding: "2px 7px" }}>기본</span>
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
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button type="button" onClick={() => handleSelectAddr(addr)}
                        style={{ flex: 1, height: "38px", border: "1.5px solid #7A1E47", color: "#7A1E47", background: "#FDF4F7", borderRadius: "10px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
                        이 주소로 배송
                      </button>
                      {!addr.isDefault && (
                        <button type="button" onClick={() => handleSetDefault(index)}
                          style={{ flex: 1, height: "38px", border: "1px solid #0F6E56", color: "#0F6E56", background: "#E7F3EE", borderRadius: "10px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
                          기본으로 설정
                        </button>
                      )}
                    </div>
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
      <div style={panelStyle}>
        {/* 핸들 */}
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 0", background: "#fff" }}>
          <div style={{ width: "36px", height: "4px", borderRadius: "2px", background: "#D9C5CC" }} />
        </div>

        {/* 헤더 */}
        <div style={{ padding: "12px 20px 10px", borderBottom: "1px solid #F0EBE6", background: "#fff", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
            <span style={{ fontSize: "20px", fontWeight: 800, color: "#7A1E47" }}>정보수정</span>
            <span style={{ fontSize: "13px", color: "#ABA5A0", fontWeight: 600 }}>배송정보 확인</span>
          </div>
          <div style={{ fontSize: "12px", color: "#ABA5A0", marginTop: "4px" }}>주문 전 닉네임, 연락처, 주소가 맞는지 확인해주세요.</div>
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
                <div style={{ marginTop: "6px", fontSize: "12px", color: "#ABA5A0" }}>현재 보이는 닉네임과 다르면 주문 누락이 생길 수 있습니다.</div>
              )}
            </div>

            {/* 이름 + 전화번호 */}
            <div style={{ borderRadius: "16px", background: "#fff", padding: "14px", border: "1px solid #E8E2DD" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={labelStyle}>이름</label>
                  <input value={customerName} onChange={(e) => onCustomerNameChange(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>전화번호</label>
                  <input value={customerPhone} onChange={(e) => onCustomerPhoneChange(formatKoreanPhone(e.target.value))} inputMode="numeric" style={inputStyle} />
                </div>
              </div>
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
                  style={{ width: "100%", padding: "14px", border: "1px dashed #E5E1DC", borderRadius: "12px", background: "#fff", fontSize: "13px", color: "#ABA5A0", cursor: "pointer" }}>
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
