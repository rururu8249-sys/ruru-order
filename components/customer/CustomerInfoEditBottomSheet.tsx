"use client";

// components/customer/CustomerInfoEditBottomSheet.tsx
// 목적: 주문서 화면 안에서 사용하는 고객 정보수정 바텀시트
// 주의: UI 전용. DB, API, 주문저장, 입금매칭, 정산, 배송 로직 없음. (시안 딥로즈 #7B2D43 인라인)

import { useEffect, useRef, type CSSProperties } from "react";

type CustomerInfoEditBottomSheetProps = {
  open: boolean;

  youtubeNickname: string;
  customerName: string;
  customerPhone: string;
  address: string;
  detailAddress: string;

  youtubeNicknameError?: string;

  onYoutubeNicknameChange: (value: string) => void;
  onCustomerNameChange: (value: string) => void;
  onCustomerPhoneChange: (value: string) => void;
  onAddressChange: (value: string) => void;
  onDetailAddressChange: (value: string) => void;

  onOpenAddressSearch: () => void;
  onClose: () => void;
  onSave: () => void | Promise<void>;

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

const textareaStyle: CSSProperties = {
  minHeight: "48px",
  maxHeight: "96px",
  width: "100%",
  boxSizing: "border-box",
  resize: "none",
  overflow: "hidden",
  borderRadius: "12px",
  border: "1px solid #D9C5CC",
  background: "#fff",
  padding: "12px 14px",
  fontSize: "15px",
  fontWeight: 800,
  lineHeight: 1.45,
  color: "#222",
  outline: "none",
};

const labelStyle: CSSProperties = { marginBottom: "6px", display: "block", fontSize: "12px", fontWeight: 800, color: "#888" };
const fieldBoxStyle: CSSProperties = { borderRadius: "16px", background: "#fff", padding: "12px", border: "1px solid #E8E2DD" };

const resizeTextareaHeight = (textarea: HTMLTextAreaElement | null) => {
  if (!textarea) return;

  textarea.style.height = "auto";
  textarea.style.height = `${Math.min(textarea.scrollHeight, 96)}px`;
};

export default function CustomerInfoEditBottomSheet({
  open,
  youtubeNickname,
  customerName,
  customerPhone,
  address,
  detailAddress,
  youtubeNicknameError,
  onYoutubeNicknameChange,
  onCustomerNameChange,
  onCustomerPhoneChange,
  onAddressChange,
  onDetailAddressChange,
  onOpenAddressSearch,
  onClose,
  onSave,
  saving = false,
}: CustomerInfoEditBottomSheetProps) {
  const addressTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!open) return;
    resizeTextareaHeight(addressTextareaRef.current);
  }, [open, address]);

  if (!open) return null;

  return (
    <div
      data-ruru-customer-info-edit-sheet="shell-v2"
      style={{ position: "fixed", inset: 0, zIndex: 90, display: "flex", alignItems: "flex-end", justifyContent: "center", background: "rgba(15,23,42,0.45)", padding: "0 12px" }}
      role="dialog"
      aria-modal="true"
      aria-label="정보수정"
    >
      <section style={{ width: "100%", maxWidth: "430px", overflow: "hidden", borderTopLeftRadius: "28px", borderTopRightRadius: "28px", background: "#fff", boxShadow: "0 -22px 70px rgba(15,23,42,0.22)" }}>
        <div style={{ margin: "12px auto 0", height: "5px", width: "52px", borderRadius: "3px", background: "#E8E2DD" }} />

        <div style={{ display: "flex", maxHeight: "88dvh", flexDirection: "column" }}>
          <header style={{ flexShrink: 0, padding: "20px 16px 12px" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: "8px", whiteSpace: "nowrap" }}>
              <h2 style={{ fontSize: "26px", fontWeight: 800, lineHeight: 1, letterSpacing: "-0.08em", color: "#7B2D43" }}>정보수정</h2>
              <span style={{ fontSize: "12px", fontWeight: 800, color: "#999" }}>배송정보 확인</span>
            </div>
            <p style={{ marginTop: "8px", fontSize: "12px", fontWeight: 700, lineHeight: 1.6, color: "#999" }}>
              주문 전 닉네임, 연락처, 주소가 맞는지 확인해주세요.
            </p>
          </header>

          <div style={{ minHeight: 0, flex: 1, overflowY: "auto", padding: "0 16px 12px" }}>
            <div style={{ display: "grid", gap: "12px" }}>
              <div style={fieldBoxStyle}>
                <label style={labelStyle} htmlFor="customerInfoEditNickname">유튜브 닉네임</label>
                <input
                  id="customerInfoEditNickname"
                  value={youtubeNickname}
                  onChange={(event) => onYoutubeNicknameChange(event.target.value)}
                  style={inputStyle}
                  placeholder="채팅창에 보이는 닉네임"
                  autoComplete="nickname"
                />
                {youtubeNicknameError ? (
                  <p style={{ marginTop: "6px", fontSize: "11px", fontWeight: 700, color: "#C0392B" }}>{youtubeNicknameError}</p>
                ) : (
                  <p style={{ marginTop: "6px", fontSize: "11px", fontWeight: 700, color: "#999" }}>현재 보이는 닉네임과 다르면 주문 누락이 생길 수 있습니다.</p>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "0.78fr 1.22fr", gap: "8px" }}>
                <div style={fieldBoxStyle}>
                  <label style={labelStyle} htmlFor="customerInfoEditName">이름</label>
                  <input
                    id="customerInfoEditName"
                    value={customerName}
                    onChange={(event) => onCustomerNameChange(event.target.value)}
                    style={inputStyle}
                    placeholder="이름"
                    autoComplete="name"
                  />
                </div>

                <div style={fieldBoxStyle}>
                  <label style={labelStyle} htmlFor="customerInfoEditPhone">전화번호</label>
                  <input
                    id="customerInfoEditPhone"
                    value={customerPhone}
                    onChange={(event) => onCustomerPhoneChange(event.target.value)}
                    style={{ ...inputStyle, padding: "0 12px", fontSize: "14px" }}
                    placeholder="01012345678"
                    inputMode="numeric"
                    autoComplete="tel"
                  />
                </div>
              </div>

              <div style={fieldBoxStyle}>
                <div style={{ marginBottom: "6px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 800, color: "#888" }} htmlFor="customerInfoEditAddress">주소</label>
                  <button
                    type="button"
                    onClick={onOpenAddressSearch}
                    style={{ borderRadius: "999px", border: "none", background: "#7B2D43", padding: "6px 14px", fontSize: "11px", fontWeight: 800, color: "#fff", cursor: "pointer" }}
                  >
                    주소검색
                  </button>
                </div>

                <textarea
                  id="customerInfoEditAddress"
                  ref={addressTextareaRef}
                  rows={1}
                  value={address}
                  onChange={(event) => {
                    onAddressChange(event.target.value);
                    resizeTextareaHeight(event.currentTarget);
                  }}
                  onInput={(event) => resizeTextareaHeight(event.currentTarget)}
                  style={textareaStyle}
                  placeholder="주소검색을 눌러 주소를 입력해주세요"
                  autoComplete="street-address"
                />

                <input
                  value={detailAddress}
                  onChange={(event) => onDetailAddressChange(event.target.value)}
                  style={{ ...inputStyle, marginTop: "8px" }}
                  placeholder="상세주소를 입력해주세요"
                  autoComplete="address-line2"
                />
              </div>
            </div>
          </div>

          <footer style={{ display: "grid", flexShrink: 0, gridTemplateColumns: "0.78fr 1.22fr", gap: "8px", borderTop: "1px solid #E8E2DD", background: "#fff", padding: "12px 16px calc(14px + env(safe-area-inset-bottom))" }}>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={{ display: "flex", minHeight: "50px", alignItems: "center", justifyContent: "center", borderRadius: "14px", border: "1px solid #D9C5CC", background: "#fff", padding: "0 12px", fontSize: "15px", fontWeight: 800, color: "#666", cursor: saving ? "default" : "pointer", opacity: saving ? 0.45 : 1 }}
            >
              취소
            </button>

            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              style={{ display: "flex", minHeight: "50px", alignItems: "center", justifyContent: "center", borderRadius: "14px", border: "none", background: saving ? "#cbd5e1" : "#7B2D43", padding: "0 12px", fontSize: "15px", fontWeight: 800, color: "#fff", cursor: saving ? "default" : "pointer" }}
            >
              {saving ? "저장 중..." : "저장"}
            </button>
          </footer>
        </div>
      </section>
    </div>
  );
}
