"use client";

// [2026-08-29 사장님 요청] "같은 디자인인데 색상 때문에 상품번호가 다른 것"을 한 박스로 묶는 관리자 화면
//
// 왜 필요한가
//   BB-401M 블랙 / BB-402M 브라운 처럼 같은 옷이 상품코드만 달라 따로따로 나열되면
//   손님은 같은 옷인 줄 모르고, 색상을 고르려고 목록을 위아래로 헤맨다.
//   고객 주문서에는 묶음 UI(resolveDesignGroups)가 이미 있고, 비어 있는 것은 데이터뿐이다.
//   이 화면이 그 데이터(product_note.design_groups)를 사장님이 직접 만들게 해준다.
//
// 안전 원칙
//   · 자동으로 묶지 않는다. 후보만 계산해 보여주고, 체크한 것만 묶는다(인계서 「색상 추정 금지」).
//   · 색상이 저장되지 않은 후보는 "확인 필요"로 따로 분리해 경고를 붙인다.
//   · 저장은 이 화면이 하지 않는다. 상품 수정폼의 [저장] 버튼을 눌러야 DB에 반영된다.
//   · 금액·재고·주문·입금·배송 데이터를 만지지 않는다. product_note.design_groups 만 다룬다.

import { type CSSProperties, useMemo, useState } from "react";
import { showAdminToast } from "@/lib/adminToast";
import {
  appendDesignGroups,
  suggestDesignGroups,
  type DesignGroupCandidate,
  type DesignGroupRecord,
  type DesignGroupSuggestInput,
} from "@/lib/designGroupSuggest";

type Props = {
  details: DesignGroupSuggestInput[];
  groups: DesignGroupRecord[];
  photoOf?: (detailName: string) => string;
  isMobile?: boolean;
  onChange: (next: DesignGroupRecord[]) => void;
  onClose: () => void;
};

const chip = (active: boolean): CSSProperties => ({
  flexShrink: 0,
  border: `1px solid ${active ? "#7B2D43" : "#E1D5D9"}`,
  borderRadius: "999px",
  padding: "5px 11px",
  background: active ? "#7B2D43" : "#fff",
  color: active ? "#fff" : "var(--color-ink-soft)",
  fontSize: "11.5px",
  fontWeight: 800,
  cursor: "pointer",
});

const won = (value: number) => `${Math.max(0, Math.floor(Number(value) || 0)).toLocaleString("ko-KR")}원`;

export default function DesignGroupPanel({ details, groups, photoOf, isMobile, onChange, onClose }: Props) {
  const [tab, setTab] = useState<"suggest" | "manual">("suggest");
  const [checkedCandidates, setCheckedCandidates] = useState<string[]>([]);
  const [manualPicked, setManualPicked] = useState<string[]>([]);
  const [manualSearch, setManualSearch] = useState("");

  const groupedMembers = useMemo(
    () => new Set(groups.flatMap((group) => group.members || [])),
    [groups],
  );

  const suggestion = useMemo(
    () => suggestDesignGroups(details, [...groupedMembers]),
    [details, groupedMembers],
  );

  const candidateById = useMemo(() => {
    const map = new Map<string, DesignGroupCandidate>();
    for (const candidate of [...suggestion.confident, ...suggestion.needsColor]) map.set(candidate.id, candidate);
    return map;
  }, [suggestion]);

  const ungrouped = useMemo(
    () => details.filter((detail) => !groupedMembers.has(detail.detailName)),
    [details, groupedMembers],
  );

  const manualList = useMemo(() => {
    const keyword = manualSearch.trim().toLowerCase();
    if (!keyword) return ungrouped;
    return ungrouped.filter((detail) => detail.detailName.toLowerCase().includes(keyword));
  }, [ungrouped, manualSearch]);

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

  const applyGroups = (chosen: Array<{ id?: string; title?: string; members: string[] }>) => {
    try {
      const next = appendDesignGroups(groups, chosen);
      onChange(next);
      showAdminToast(
        `${chosen.length}개 묶음을 편집화면에 반영했습니다.\n상품 수정창 아래의 [저장]을 눌러야 손님 화면에 보입니다.`,
        "warning",
      );
      setCheckedCandidates([]);
      setManualPicked([]);
    } catch (error) {
      showAdminToast(error instanceof Error ? error.message : "묶기에 실패했어요.", "error");
    }
  };

  const applyChecked = () => {
    const chosen = checkedCandidates
      .map((id) => candidateById.get(id))
      .filter(Boolean)
      .map((candidate) => ({
        id: (candidate as DesignGroupCandidate).id,
        members: (candidate as DesignGroupCandidate).members,
      }));
    if (chosen.length === 0) {
      showAdminToast("묶을 후보를 먼저 체크해주세요.", "error");
      return;
    }
    applyGroups(chosen);
  };

  const applyManual = () => {
    if (manualPicked.length < 2) {
      showAdminToast("2개 이상 골라야 묶을 수 있어요.", "error");
      return;
    }
    applyGroups([{ id: `design-manual-${Date.now()}`, members: manualPicked }]);
  };

  const removeGroup = (id: string) => {
    onChange(groups.filter((group) => group.id !== id));
    showAdminToast("묶음을 풀었습니다.\n상품 수정창 아래의 [저장]을 눌러야 최종 반영됩니다.", "warning");
  };

  const renderCandidate = (candidate: DesignGroupCandidate, warn: boolean) => {
    const checked = checkedCandidates.includes(candidate.id);
    return (
      <label
        key={candidate.id}
        style={{
          display: "grid",
          gridTemplateColumns: "20px minmax(0, 1fr)",
          gap: "9px",
          alignItems: "start",
          padding: "9px 11px",
          border: `1px solid ${checked ? "#7B2D43" : warn ? "#F0D28A" : "#E8E2DD"}`,
          background: checked ? "#FCF6F8" : warn ? "#FFFDF6" : "var(--color-surface)",
          borderRadius: "9px",
          cursor: "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={() => setCheckedCandidates((prev) => toggle(prev, candidate.id))}
          style={{ width: "17px", height: "17px", marginTop: "1px", accentColor: "#7B2D43", cursor: "pointer" }}
        />
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", fontSize: "12.5px", fontWeight: 900, color: "var(--color-ink)" }}>
            {candidate.baseDescription || candidate.members[0]}
          </span>
          <span style={{ display: "block", marginTop: "2px", fontSize: "11px", color: "var(--color-ink-soft)" }}>
            {candidate.members.length}개 · {won(candidate.price)}
            {candidate.sizes.length > 0 ? ` · ${candidate.sizes.join("/")}` : ""}
            {candidate.colors.length > 0 ? ` · ${candidate.colors.join("/")}` : ""}
          </span>
          <span style={{ display: "flex", flexWrap: "wrap", gap: "5px", marginTop: "6px" }}>
            {candidate.members.map((member) => {
              const photo = photoOf?.(member) || "";
              return (
                <span
                  key={member}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    border: "1px solid #E8E2DD",
                    borderRadius: "999px",
                    padding: "3px 8px 3px 3px",
                    background: "#fff",
                    fontSize: "10.5px",
                    fontWeight: 700,
                    color: "var(--color-ink-soft)",
                    maxWidth: "100%",
                  }}
                >
                  {photo ? (
                    <img src={photo} alt="" style={{ width: "20px", height: "20px", borderRadius: "999px", objectFit: "cover" }} />
                  ) : (
                    <span style={{ width: "20px", height: "20px", borderRadius: "999px", background: "#F1ECE8" }} />
                  )}
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "220px" }}>{member}</span>
                </span>
              );
            })}
          </span>
          {warn ? (
            <span style={{ display: "block", marginTop: "6px", fontSize: "10.5px", fontWeight: 800, color: "#8A5A00" }}>
              ⚠ 색상명이 없거나 겹칩니다. 정말 같은 디자인인지 사진으로 확인한 뒤 체크해주세요.
            </span>
          ) : null}
        </span>
      </label>
    );
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100002, background: "rgba(39,28,33,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: "18px" }}>
      <div role="dialog" aria-modal="true" aria-label="같은 디자인 묶기" style={{ width: "min(680px, 95vw)", maxHeight: "88vh", display: "flex", flexDirection: "column", borderRadius: "14px", overflow: "hidden", background: "var(--color-surface)", boxShadow: "0 22px 70px rgba(0,0,0,0.28)" }}>
        <div style={{ padding: "13px 16px", borderBottom: "1px solid #E8E2DD", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#F7F5F3" }}>
          <span style={{ fontSize: "14px", fontWeight: 900, color: "var(--color-ink)" }}>같은 디자인 묶기</span>
          <button type="button" onClick={onClose} aria-label="닫기" style={{ border: "none", background: "transparent", fontSize: "20px", color: "var(--color-ink-mute)", cursor: "pointer" }}>×</button>
        </div>

        <div style={{ padding: "10px 16px 0", fontSize: "11.5px", color: "var(--color-ink-soft)", lineHeight: 1.6 }}>
          색상만 다른 상품을 하나로 묶으면 손님 주문서에서 한 박스 안에서 색상을 고를 수 있어요.
          <b style={{ color: "#7B2D43" }}> 여기서 묶은 뒤 상품 수정창 아래의 [저장]을 눌러야 실제로 반영됩니다.</b>
        </div>

        <div style={{ display: "flex", gap: "6px", padding: "10px 16px" }}>
          <button type="button" onClick={() => setTab("suggest")} style={chip(tab === "suggest")}>
            추천 {suggestion.confident.length + suggestion.needsColor.length}건
          </button>
          <button type="button" onClick={() => setTab("manual")} style={chip(tab === "manual")}>
            직접 고르기
          </button>
        </div>

        <div style={{ overflowY: "auto", padding: "0 16px 14px", display: "flex", flexDirection: "column", gap: "8px" }}>
          {groups.length > 0 ? (
            <div style={{ border: "1px solid #E8E2DD", borderRadius: "10px", padding: "10px 12px", background: "#F7F5F3" }}>
              <div style={{ fontSize: "11.5px", fontWeight: 900, color: "var(--color-ink)", marginBottom: "7px" }}>
                지금 묶여 있는 것 {groups.length}개
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {groups.map((group) => (
                  <div key={group.id} style={{ display: "flex", alignItems: "center", gap: "8px", background: "#fff", border: "1px solid #E8E2DD", borderRadius: "8px", padding: "7px 10px" }}>
                    <span style={{ minWidth: 0, flex: 1, fontSize: "11px", color: "var(--color-ink-soft)" }}>
                      <b style={{ color: "var(--color-ink)" }}>{group.members.length}개</b> · {group.members.join(" / ")}
                    </span>
                    <button type="button" onClick={() => removeGroup(group.id)} style={{ flexShrink: 0, border: "1px solid #E1D5D9", borderRadius: "7px", background: "#fff", color: "#C0392B", padding: "4px 9px", fontSize: "10.5px", fontWeight: 800, cursor: "pointer" }}>
                      묶음 풀기
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {tab === "suggest" ? (
            suggestion.confident.length + suggestion.needsColor.length === 0 ? (
              <div style={{ padding: "22px 12px", textAlign: "center", fontSize: "11.5px", color: "var(--color-ink-mute)", border: "1px dashed #D9C5CC", borderRadius: "9px", lineHeight: 1.7 }}>
                자동으로 찾은 후보가 없습니다.
                <br />
                상품명·가격·사이즈가 서로 다르면 후보로 잡지 않아요. [직접 고르기]에서 손으로 묶을 수 있습니다.
              </div>
            ) : (
              <>
                {suggestion.confident.length > 0 ? (
                  <>
                    <div style={{ fontSize: "11.5px", fontWeight: 900, color: "#0F6E56" }}>색상까지 확인된 후보 {suggestion.confident.length}건</div>
                    {suggestion.confident.map((candidate) => renderCandidate(candidate, false))}
                  </>
                ) : null}
                {suggestion.needsColor.length > 0 ? (
                  <>
                    <div style={{ marginTop: "4px", fontSize: "11.5px", fontWeight: 900, color: "#8A5A00" }}>사장님 확인이 필요한 후보 {suggestion.needsColor.length}건</div>
                    {suggestion.needsColor.map((candidate) => renderCandidate(candidate, true))}
                  </>
                ) : null}
              </>
            )
          ) : (
            <>
              <input
                aria-label="세부상품 검색"
                value={manualSearch}
                onChange={(event) => setManualSearch(event.target.value)}
                placeholder="상품코드·상품명 검색"
                style={{ width: "100%", border: "1px solid #B08794", borderRadius: "8px", padding: "8px 10px", fontSize: "12px", color: "var(--color-ink)", background: "#fff" }}
              />
              <div style={{ fontSize: "11px", color: "var(--color-ink-mute)" }}>
                묶을 상품을 2개 이상 고르세요. 이미 묶인 상품은 목록에 나오지 않습니다.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: "6px" }}>
                {manualList.map((detail) => {
                  const picked = manualPicked.includes(detail.detailName);
                  const photo = photoOf?.(detail.detailName) || "";
                  return (
                    <label
                      key={detail.detailName}
                      style={{ display: "grid", gridTemplateColumns: "18px 36px minmax(0, 1fr)", gap: "8px", alignItems: "center", padding: "6px 8px", border: `1px solid ${picked ? "#7B2D43" : "#E8E2DD"}`, background: picked ? "#FCF6F8" : "var(--color-surface)", borderRadius: "8px", cursor: "pointer" }}
                    >
                      <input
                        type="checkbox"
                        checked={picked}
                        onChange={() => setManualPicked((prev) => toggle(prev, detail.detailName))}
                        style={{ width: "16px", height: "16px", accentColor: "#7B2D43", cursor: "pointer" }}
                      />
                      {photo ? (
                        <img src={photo} alt="" style={{ width: "36px", height: "36px", borderRadius: "6px", objectFit: "cover" }} />
                      ) : (
                        <span style={{ width: "36px", height: "36px", borderRadius: "6px", background: "#F1ECE8" }} />
                      )}
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: "11.5px", fontWeight: 800, color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{detail.detailName}</span>
                        <span style={{ display: "block", fontSize: "10.5px", color: "var(--color-ink-mute)" }}>
                          {[won(detail.price), detail.colors.filter(Boolean).join("/"), detail.sizes.filter(Boolean).join("/")].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                    </label>
                  );
                })}
                {manualList.length === 0 ? (
                  <div style={{ gridColumn: "1 / -1", padding: "18px 10px", textAlign: "center", color: "var(--color-ink-mute)", fontSize: "11.5px", border: "1px dashed #D9C5CC", borderRadius: "8px" }}>
                    고를 수 있는 세부상품이 없습니다.
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>

        <div style={{ marginTop: "auto", padding: "11px 16px", borderTop: "1px solid #E8E2DD", display: "flex", alignItems: "center", gap: "8px", background: "#F7F5F3" }}>
          <span style={{ fontSize: "11px", color: "var(--color-ink-mute)" }}>
            {tab === "suggest" ? `${checkedCandidates.length}개 후보 선택됨` : `${manualPicked.length}개 선택됨`}
          </span>
          <button type="button" onClick={onClose} style={{ marginLeft: "auto", border: "1px solid #E1D5D9", borderRadius: "8px", background: "#fff", color: "var(--color-ink-soft)", padding: "8px 14px", fontSize: "12px", fontWeight: 800, cursor: "pointer" }}>
            닫기
          </button>
          <button
            type="button"
            onClick={tab === "suggest" ? applyChecked : applyManual}
            style={{ border: "none", borderRadius: "8px", background: "#7B2D43", color: "#fff", padding: "8px 16px", fontSize: "12px", fontWeight: 900, cursor: "pointer" }}
          >
            {tab === "suggest" ? "선택한 후보 묶기" : "선택한 것 하나로 묶기"}
          </button>
        </div>
      </div>
    </div>
  );
}
