"use client";

// components/customer/CustomerInfoEditBottomSheet.tsx
// 목적: 주문서 화면 안에서 사용하는 고객 정보수정 바텀시트
// 구조: 닉네임/이름/전화 + 기본배송지 요약 → 배송지 관리 오버레이 분리
// 주의: UI 전용. DB, API, 주문저장, 입금매칭, 정산, 배송 로직 없음. (시안 딥로즈 #7B2D43 인라인)

import { useState, type CSSProperties } from "react";

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

  shippingAddresses?: any[];
  onSaveShippingAddresses?: (addresses: any[]) => Promise<void>;
  onSelectShippingAddress?: (address: string, detailAddress: string, name?: string, phone?: string) => void;
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
  // 배송지 관리 오버레이
  const [shippingMgmtOpen, setShippingMgmtOpen] = useState(false);
  // 배송지 추가/수정 폼
  const [addrFormOpen, setAddrFormOpen] = useState(false);
  const [editingAddrIndex, setEditingAddrIndex] = useState<number | null>(null);
  const [addrForm, setAddrForm] = useState({ name: "", phone: "", address: "", detailAddress: "" });

  const defaultAddr = shippingAddresses.find((a) => a.isDefault) ?? shippingAddresses[0] ?? null;

  if (!open) return null;

  return (
    <>
      {/* ── 배송지 추가/수정 폼 (zIndex 110) ── */}
      {addrFormOpen ? (
        <div style={{ position: "fixed", inset: 0, zIndex: 110, display: "flex", alignItems: "flex-end", justifyContent: "center", background: "rgba(15,23,42,0.45)", padding: "0 12px" }}>
          <section style={{ width: "100%", maxWidth: "480px", background: "#fff", borderRadius: "20px 20px 0 0", overflow: "hidden", paddingBottom: "env(safe-area-inset-bottom)" }}>
            <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid #F0EBE6" }}>
              <div style={{ fontSize: "18px", fontWeight: 800, color: "#7A1E47" }}>
                {editingAddrIndex !== null ? "배송지 수정" : "배송지 추가"}
              </div>
            </div>
            <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: "8px" }}>
              <input
                value={addrForm.name}
                onChange={(e) => setAddrForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="이름"
                style={{ ...inputStyle, height: "44px", fontSize: "14px" }}
              />
              <input
                value={addrForm.phone}
                onChange={(e) => setAddrForm((f) => ({ ...f, phone: formatKoreanPhone(e.target.value) }))}
                placeholder="전화번호"
                inputMode="numeric"
                style={{ ...inputStyle, height: "44px", fontSize: "14px" }}
              />
              <div style={{ display: "flex", gap: "6px", alignItems: "flex-end" }}>
                <input
                  value={addrForm.address}
                  onChange={(e) => setAddrForm((f) => ({ ...f, address: e.target.value }))}
                  placeholder="주소"
                  style={{ ...inputStyle, flex: 1, height: "44px", fontSize: "14px" }}
                />
                <button
                  type="button"
                  onClick={() => onOpenAddressSearchForForm?.((addr) => setAddrForm((f) => ({ ...f, address: addr })))}
                  style={{ padding: "0 14px", height: "44px", background: "#7A1E47", color: "white", border: "none", borderRadius: "8px", fontSize: "12px", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
                >주소검색</button>
              </div>
              <input
                value={addrForm.detailAddress}
                onChange={(e) => setAddrForm((f) => ({ ...f, detailAddress: e.target.value }))}
                placeholder="상세주소"
                style={{ ...inputStyle, height: "44px", fontSize: "14px" }}
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "0.78fr 1.22fr", gap: "8px", borderTop: "1px solid #E8E2DD", background: "#fff", padding: "12px 16px calc(14px + env(safe-area-inset-bottom))" }}>
              <button
                type="button"
                onClick={() => { setAddrFormOpen(false); setEditingAddrIndex(null); }}
                style={{ display: "flex", minHeight: "50px", alignItems: "center", justifyContent: "center", borderRadius: "14px", border: "1px solid #D9C5CC", background: "#fff", fontSize: "15px", fontWeight: 800, color: "#666", cursor: "pointer" }}
              >취소</button>
              <button
                type="button"
                onClick={() => {
                  if (editingAddrIndex !== null) {
                    onSaveShippingAddresses?.(shippingAddresses.map((a, i) => (i === editingAddrIndex ? { ...addrForm } : a)));
                  } else {
                    onSaveShippingAddresses?.([...shippingAddresses, { ...addrForm, isDefault: shippingAddresses.length === 0 }]);
                  }
                  setAddrFormOpen(false);
                  setEditingAddrIndex(null);
                }}
                style={{ display: "flex", minHeight: "50px", alignItems: "center", justifyContent: "center", borderRadius: "14px", border: "none", background: "#7A1E47", color: "#fff", fontSize: "15px", fontWeight: 800, cursor: "pointer" }}
              >저장</button>
            </div>
          </section>
        </div>
      ) : null}

      {/* ── 배송지 관리 오버레이 (zIndex 100) ── */}
      {shippingMgmtOpen ? (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center", background: "rgba(15,23,42,0.45)", padding: "0 12px" }}>
          <section style={{ width: "100%", maxWidth: "480px", background: "#F7F4F1", borderRadius: "20px 20px 0 0", overflow: "hidden", maxHeight: "80vh", display: "flex", flexDirection: "column" }}>
            {/* 헤더 */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px 12px", borderBottom: "1px solid #F0EBE6", background: "#fff", flexShrink: 0 }}>
              <div style={{ fontSize: "18px", fontWeight: 800, color: "#7A1E47" }}>배송지 관리</div>
              <button
                type="button"
                onClick={() => setShippingMgmtOpen(false)}
                style={{ background: "none", border: "none", fontSize: "22px", color: "#888", cursor: "pointer", padding: "0 4px", lineHeight: 1 }}
              >×</button>
            </div>

            {/* 목록 */}
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 0" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                <div style={{ fontSize: "13px", fontWeight: 700, color: "#888" }}>등록한 배송지</div>
                <button
                  type="button"
                  onClick={() => { setAddrFormOpen(true); setEditingAddrIndex(null); setAddrForm({ name: "", phone: "", address: "", detailAddress: "" }); }}
                  style={{ background: "none", border: "none", fontSize: "13px", fontWeight: 700, color: "#7A1E47", cursor: "pointer", padding: "0" }}
                >+ 추가</button>
              </div>

              {shippingAddresses.length === 0 ? (
                <div style={{ textAlign: "center", padding: "32px 0", color: "#ABA5A0", fontSize: "14px" }}>
                  등록된 배송지가 없어요
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", paddingBottom: "16px" }}>
                  {shippingAddresses.map((addr, index) => (
                    <div key={index} style={{ background: "#fff", borderRadius: "14px", padding: "14px 16px", border: addr.isDefault ? "1.5px solid #7A1E47" : "1px solid #E8E2DD" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "6px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          {addr.isDefault && (
                            <span style={{ background: "#7A1E47", color: "#fff", fontSize: "10px", fontWeight: 700, borderRadius: "4px", padding: "2px 6px" }}>기본</span>
                          )}
                          <span style={{ fontSize: "14px", fontWeight: 800, color: "#222" }}>{addr.name || "이름 없음"}</span>
                        </div>
                      </div>
                      <div style={{ fontSize: "13px", color: "#555", marginBottom: "2px" }}>연락처: {addr.phone || "-"}</div>
                      <div style={{ fontSize: "13px", color: "#555", marginBottom: "10px" }}>{addr.address}{addr.detailAddress ? ` ${addr.detailAddress}` : ""}</div>
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={() => {
                            onSelectShippingAddress?.(addr.address, addr.detailAddress, addr.name, addr.phone);
                            setShippingMgmtOpen(false);
                          }}
                          style={{ border: "1px solid #7A1E47", color: "#7A1E47", background: "#FDF4F7", borderRadius: "6px", padding: "4px 10px", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}
                        >이 주소로 배송</button>
                        <button
                          type="button"
                          onClick={() => { setEditingAddrIndex(index); setAddrForm({ name: addr.name || "", phone: addr.phone || "", address: addr.address || "", detailAddress: addr.detailAddress || "" }); setAddrFormOpen(true); }}
                          style={{ border: "1px solid #D9C5CC", color: "#555", background: "#fff", borderRadius: "6px", padding: "4px 10px", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}
                        >수정</button>
                        <button
                          type="button"
                          onClick={() => {
                            const next = shippingAddresses.filter((_, i) => i !== index);
                            if (addr.isDefault && next.length > 0) next[0].isDefault = true;
                            onSaveShippingAddresses?.(next);
                          }}
                          style={{ border: "1px solid #D9C5CC", color: "#e74c3c", background: "#fff", borderRadius: "6px", padding: "4px 10px", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}
                        >삭제</button>
                        {!addr.isDefault && (
                          <button
                            type="button"
                            onClick={() => onSaveShippingAddresses?.(shippingAddresses.map((x, i) => ({ ...x, isDefault: i === index })))}
                            style={{ border: "1px solid #0F6E56", color: "#0F6E56", background: "#E7F3EE", borderRadius: "6px", padding: "4px 10px", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}
                          >기본으로 설정</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {/* ── 정보수정 시트 (zIndex 90) ── */}
      <div
        data-ruru-customer-info-edit-sheet="shell-v2"
        style={{ position: "fixed", inset: 0, zIndex: 90, display: "flex", alignItems: "flex-end", justifyContent: "center", background: "rgba(15,23,42,0.45)", padding: "0 12px" }}
        role="dialog"
        aria-modal="true"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <section style={{ width: "100%", maxWidth: "480px", background: "#F7F4F1", borderRadius: "20px 20px 0 0", overflow: "hidden", maxHeight: "88vh", display: "flex", flexDirection: "column" }}>
          {/* 핸들 */}
          <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 0" }}>
            <div style={{ width: "36px", height: "4px", borderRadius: "2px", background: "#D9C5CC" }} />
          </div>

          {/* 헤더 */}
          <div style={{ padding: "12px 20px 10px", borderBottom: "1px solid #F0EBE6" }}>
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
              <div style={{ borderRadius: "16px", background: "#fff", padding: "12px", border: "1px solid #E8E2DD" }}>
                <label style={labelStyle}>유튜브 닉네임</label>
                <input
                  value={youtubeNickname}
                  onChange={(e) => onYoutubeNicknameChange(e.target.value)}
                  style={inputStyle}
                />
                {youtubeNicknameError ? (
                  <div style={{ marginTop: "6px", fontSize: "12px", color: "#e74c3c", fontWeight: 600 }}>{youtubeNicknameError}</div>
                ) : (
                  <div style={{ marginTop: "6px", fontSize: "12px", color: "#ABA5A0" }}>현재 보이는 닉네임과 다르면 주문 누락이 생길 수 있습니다.</div>
                )}
              </div>

              {/* 이름 + 전화번호 */}
              <div style={{ borderRadius: "16px", background: "#fff", padding: "12px", border: "1px solid #E8E2DD" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <div>
                    <label style={labelStyle}>이름</label>
                    <input
                      value={customerName}
                      onChange={(e) => onCustomerNameChange(e.target.value)}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>전화번호</label>
                    <input
                      value={customerPhone}
                      onChange={(e) => onCustomerPhoneChange(formatKoreanPhone(e.target.value))}
                      inputMode="numeric"
                      style={inputStyle}
                    />
                  </div>
                </div>
              </div>

              {/* 기본 배송지 요약 + 배송지 관리 버튼 */}
              <div style={{ borderRadius: "16px", background: "#fff", padding: "12px", border: "1px solid #E8E2DD" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                  <label style={{ ...labelStyle, marginBottom: 0 }}>🚚 기본 배송지</label>
                  <button
                    type="button"
                    onClick={() => setShippingMgmtOpen(true)}
                    style={{ background: "none", border: "none", fontSize: "13px", fontWeight: 700, color: "#7A1E47", cursor: "pointer", padding: "0", display: "flex", alignItems: "center", gap: "2px" }}
                  >배송지 관리 <span style={{ fontSize: "15px" }}>›</span></button>
                </div>
                {defaultAddr ? (
                  <div style={{ background: "#F7F4F1", borderRadius: "10px", padding: "10px 12px" }}>
                    <div style={{ fontSize: "14px", fontWeight: 800, color: "#222", marginBottom: "2px" }}>{defaultAddr.name}</div>
                    <div style={{ fontSize: "12px", color: "#888", marginBottom: "2px" }}>{defaultAddr.phone}</div>
                    <div style={{ fontSize: "12px", color: "#555" }}>{defaultAddr.address}{defaultAddr.detailAddress ? ` ${defaultAddr.detailAddress}` : ""}</div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShippingMgmtOpen(true)}
                    style={{ width: "100%", padding: "11px", border: "1px dashed #E5E1DC", borderRadius: "10px", background: "#fff", fontSize: "13px", color: "#ABA5A0", cursor: "pointer" }}
                  >+ 배송지 추가</button>
                )}
              </div>

            </div>
          </div>

          {/* footer */}
          <footer style={{ display: "grid", flexShrink: 0, gridTemplateColumns: "0.78fr 1.22fr", gap: "8px", borderTop: "1px solid #E8E2DD", background: "#fff", padding: "12px 16px calc(14px + env(safe-area-inset-bottom))" }}>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={{ display: "flex", minHeight: "50px", alignItems: "center", justifyContent: "center", borderRadius: "14px", border: "1px solid #D9C5CC", background: "#fff", padding: "0 12px", fontSize: "15px", fontWeight: 800, color: "#666", cursor: saving ? "default" : "pointer", opacity: saving ? 0.45 : 1 }}
            >취소</button>
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              style={{ display: "flex", minHeight: "50px", alignItems: "center", justifyContent: "center", borderRadius: "14px", border: "none", background: saving ? "#cbd5e1" : "#7A1E47", padding: "0 12px", fontSize: "15px", fontWeight: 800, color: "#fff", cursor: saving ? "default" : "pointer" }}
            >{saving ? "저장 중..." : "저장"}</button>
          </footer>
        </section>
      </div>
    </>
  );
}
