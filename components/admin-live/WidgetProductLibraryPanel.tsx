"use client";

import { useMemo, useState } from "react";

import {
  filterAndSortWidgetHistory,
  selectableWidgetTargets,
  widgetRotationDraftChanged,
  widgetTargetKey,
  type WidgetHistoryEntry,
  type WidgetHistorySort,
  type WidgetProductTarget,
  type WidgetRotationConfig,
} from "@/lib/widgetProductLibrary";

import styles from "./WidgetProductLibraryPanel.module.css";

export type WidgetProductLibraryItem = WidgetHistoryEntry & {
  image: string;
  priceLabel: string;
  available: boolean;
  inBroadcast: boolean;
  unavailableReason?: string;
};

type Props = {
  items: WidgetProductLibraryItem[];
  rotation: WidgetRotationConfig;
  selectedKeys: Set<string>;
  draftMode: WidgetRotationConfig["mode"];
  manualPinLabel?: string;
  loading?: boolean;
  busyKey?: string;
  canManageRotation: boolean;
  onPreview: (image: string) => void;
  onPin: (item: WidgetProductLibraryItem) => void;
  onRemove: (target: WidgetProductTarget) => void;
  onToggleSelected: (target: WidgetProductTarget) => void;
  onDraftModeChange: (mode: WidgetRotationConfig["mode"]) => void;
  onReplaceSelected: (targets: WidgetProductTarget[]) => void;
  onDiscardDraft: () => void;
  onApplyDraft: (mode: WidgetRotationConfig["mode"]) => void;
  onTogglePause: () => void;
};

export default function WidgetProductLibraryPanel({
  items,
  rotation,
  selectedKeys,
  draftMode,
  manualPinLabel = "",
  loading = false,
  busyKey = "",
  canManageRotation,
  onPreview,
  onPin,
  onRemove,
  onToggleSelected,
  onDraftModeChange,
  onReplaceSelected,
  onDiscardDraft,
  onApplyDraft,
  onTogglePause,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<WidgetHistorySort>("recent");
  const filtered = useMemo(() => filterAndSortWidgetHistory(items, search, sort), [items, search, sort]);
  const selectableTargets = useMemo(() => selectableWidgetTargets(items), [items]);
  const filteredSelectableTargets = useMemo(() => selectableWidgetTargets(filtered), [filtered]);
  const selectableKeys = useMemo(() => new Set(selectableTargets.map(widgetTargetKey)), [selectableTargets]);
  const selectedCount = useMemo(
    () => [...selectedKeys].filter((key) => selectableKeys.has(key)).length,
    [selectableKeys, selectedKeys],
  );
  const dirty = widgetRotationDraftChanged(rotation, draftMode, selectedKeys);
  const selectedModeEmpty = draftMode === "selected" && selectedCount === 0;
  const searching = Boolean(search.trim());

  const selectBulkTargets = () => {
    if (!searching) {
      onReplaceSelected(selectableTargets);
      return;
    }
    const filteredKeys = new Set(filteredSelectableTargets.map(widgetTargetKey));
    onReplaceSelected(selectableTargets.filter((target) => selectedKeys.has(widgetTargetKey(target)) || filteredKeys.has(widgetTargetKey(target))));
  };

  const liveStatusTitle = !canManageRotation
    ? manualPinLabel
      ? `📌 ${manualPinLabel} 고정 기록`
      : rotation.mode === "selected"
        ? `저장된 위젯 설정 · 선택한 상품 ${rotation.targets.length}개 순환`
        : "저장된 위젯 설정 · 전체 진열상품 순환"
    : manualPinLabel
      ? `방송화면 위젯 · ${manualPinLabel} 고정 표시 중`
      : rotation.mode === "selected"
        ? rotation.paused
          ? `방송화면 위젯 · 선택한 상품 ${rotation.targets.length}개 순환 일시정지`
          : `방송화면 위젯 · 선택한 상품 ${rotation.targets.length}개 순환 중`
        : rotation.paused
          ? "방송화면 위젯 · 전체 진열상품 순환 일시정지"
          : "방송화면 위젯 · 전체 진열상품 순환 중";
  const waitingStatus = rotation.mode === "selected"
    ? `선택한 상품 ${rotation.targets.length}개 순환 대기 · 고정 해제 시 자동 재개`
    : "전체 진열상품 순환 대기 · 고정 해제 시 자동 재개";

  return (
    <section className={styles.panel} aria-label="자주 사용한 상품 위젯">
      <div className={styles.header}>
        <div className={styles.headingWrap}>
          <strong className={styles.title}>📌 자주 사용한 상품 위젯</strong>
          <span className={styles.count}>{items.length}개</span>
        </div>
        {items.length > 0 ? (
          <button
            type="button"
            className={styles.ghostButton}
            aria-label={editing ? "순환 상품 선택·변경 닫기" : "순환 상품 선택·변경"}
            onClick={() => setEditing((value) => !value)}
          >
            {editing ? "설정 닫기" : "순환 상품 선택·변경"}
          </button>
        ) : null}
      </div>

      <div className={`${styles.liveStatus} ${manualPinLabel ? styles.pinnedStatus : ""}`}>
        <div className={styles.liveStatusText} role="status">
          <strong>{liveStatusTitle}</strong>
          <span>
            {!canManageRotation
              ? "진행 중인 방송을 선택하면 이 설정을 변경할 수 있습니다."
              : manualPinLabel
                ? waitingStatus
                : "방송 화면 오른쪽 상품 카드에 적용된 상태입니다."}
          </span>
        </div>
        {!manualPinLabel && canManageRotation ? (
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={!canManageRotation || (rotation.mode === "selected" && rotation.targets.length === 0)}
            onClick={onTogglePause}
          >
            {rotation.paused ? "▶ 순환 재개" : "Ⅱ 일시정지"}
          </button>
        ) : null}
      </div>

      <div className={styles.toolbar}>
        <input
          className={styles.search}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="상품명·상품번호 검색"
          aria-label="자주 사용한 상품 검색"
        />
        <select className={styles.sort} value={sort} onChange={(event) => setSort(event.target.value as WidgetHistorySort)} aria-label="자주 사용한 상품 정렬">
          <option value="recent">최근 사용순</option>
          <option value="frequent">많이 사용한 순</option>
          <option value="name">상품명순</option>
        </select>
      </div>

      {editing ? (
        <>
          <div className={styles.modeSection}>
            <strong className={styles.sectionLabel}>순환 방식</strong>
            <div className={styles.modeGroup} role="radiogroup" aria-label="순환 방식">
              <label className={`${styles.modeOption} ${draftMode === "all" ? styles.modeOptionActive : ""}`}>
                <input
                  type="radio"
                  name="widget-rotation-mode"
                  aria-label="전체 진열상품 순환"
                  checked={draftMode === "all"}
                  disabled={!canManageRotation}
                  onChange={() => onDraftModeChange("all")}
                />
                <span><strong>전체 진열상품</strong><small>현재 방송에 진열된 상품을 차례로 표시</small></span>
              </label>
              <label className={`${styles.modeOption} ${draftMode === "selected" ? styles.modeOptionActive : ""}`}>
                <input
                  type="radio"
                  name="widget-rotation-mode"
                  aria-label="원하는 상품만 순환"
                  checked={draftMode === "selected"}
                  disabled={!canManageRotation}
                  onChange={() => onDraftModeChange("selected")}
                />
                <span><strong>원하는 상품만 순환</strong><small>아래 목록에서 고른 상품만 반복 표시</small></span>
              </label>
            </div>
          </div>

          <div className={styles.selectionToolbar}>
            <span className={styles.selectionCount}>선택 {selectedCount}개</span>
            <div className={styles.selectionActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                aria-label={searching ? `검색 결과 ${filteredSelectableTargets.length}개 선택` : "순환 가능 상품 전체 선택"}
                disabled={draftMode !== "selected" || !canManageRotation || (searching ? filteredSelectableTargets.length === 0 : selectableTargets.length === 0)}
                onClick={selectBulkTargets}
              >
                {searching ? `검색 결과 ${filteredSelectableTargets.length}개 선택` : `순환 가능 ${selectableTargets.length}개 전체 선택`}
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                aria-label="선택 상품 모두 해제"
                disabled={draftMode !== "selected" || !canManageRotation || selectedCount === 0}
                onClick={() => onReplaceSelected([])}
              >
                선택 모두 해제
              </button>
            </div>
          </div>
        </>
      ) : null}

      {!loading && items.length > 0 ? (
        <div className={styles.listMeta}>
          <strong>{searching ? `검색 결과 ${filtered.length}개` : `전체 ${items.length}개`}</strong>
          <span>목록 안에서 위아래로 스크롤해 모두 볼 수 있습니다.</span>
        </div>
      ) : null}

      {loading ? (
        <div className={styles.empty}>자주 사용한 상품을 불러오는 중…</div>
      ) : items.length === 0 ? (
        <div className={styles.empty}>상품을 한 번이라도 고정하면 이곳에 계속 보관됩니다.</div>
      ) : filtered.length === 0 ? (
        <div className={styles.empty}>검색 결과가 없습니다.</div>
      ) : (
        <div className={`${styles.grid} ${styles.historyGrid}`}>
          {filtered.map((item) => {
            const key = widgetTargetKey(item);
            const selected = selectedKeys.has(key);
            const busy = busyKey === key;
            const selectable = item.available && item.inBroadcast;
            return (
              <article key={key} className={`${styles.card} ${editing && selected ? styles.selectedCard : ""} ${!item.available ? styles.unavailableCard : ""}`}>
                {editing ? (
                  <label className={styles.checkWrap} title={draftMode === "selected" ? "자동 순환에 포함" : "원하는 상품만 순환에서 사용할 수 있습니다"}>
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={draftMode !== "selected" || !selectable || !canManageRotation}
                      onChange={() => onToggleSelected(item)}
                    />
                    <span className={styles.checkText}>순환</span>
                  </label>
                ) : null}
                <button type="button" className={styles.imageButton} onClick={() => item.image && onPreview(item.image)} disabled={!item.image} aria-label={`${item.label} 사진 크게 보기`}>
                  {item.image ? (
                    // 상품 이미지는 Supabase·외부 URL이 섞여 있어 기존 관리자 목록과 같은 원본 URL을 사용한다.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.image} alt="" />
                  ) : <span aria-hidden>🖼</span>}
                </button>
                <div className={styles.info}>
                  <div className={styles.name} title={item.label}>{item.label}</div>
                  <div className={styles.price}>{item.priceLabel || "가격 확인 필요"}</div>
                  <div className={styles.meta}>
                    <span>고정 {item.count}회</span>
                    {!item.inBroadcast ? <span className={styles.warning}>현재 방송 미진열</span> : !item.available ? <span className={styles.warning}>{item.unavailableReason || "사용 불가"}</span> : null}
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.pinButton}
                  disabled={!selectable || busy}
                  onClick={() => onPin(item)}
                  title={!item.inBroadcast ? "현재 방송에 먼저 상품을 담아주세요" : "고정·채팅 지정·문구 복사"}
                >
                  {busy ? "처리 중" : "▶ 방송"}
                </button>
                <button type="button" className={styles.removeButton} onClick={() => onRemove(item)} aria-label={`${item.label} 사용 목록에서 삭제`}>×</button>
              </article>
            );
          })}
        </div>
      )}

      {editing && dirty ? (
        <div className={styles.saveBar} aria-label="순환 설정 변경사항">
          <div className={styles.saveMessage}>
            <strong>변경사항이 아직 방송에 적용되지 않았습니다.</strong>
            {selectedModeEmpty ? <span className={styles.validation}>선택 상품은 한 개 이상 선택해주세요.</span> : null}
          </div>
          <div className={styles.actionButtons}>
            <button type="button" className={styles.secondaryButton} onClick={onDiscardDraft}>변경 취소</button>
            <button
              type="button"
              className={styles.primaryButton}
              aria-label="순환 설정 적용"
              disabled={!canManageRotation || selectedModeEmpty}
              onClick={() => onApplyDraft(draftMode)}
            >
              {draftMode === "all"
                ? "전체 진열상품으로 적용"
                : manualPinLabel
                  ? `선택 ${selectedCount}개 순환 예약`
                  : `선택 ${selectedCount}개로 순환 적용`}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
