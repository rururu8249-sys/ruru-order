"use client";

import { useMemo, useState } from "react";

import {
  filterAndSortWidgetHistory,
  visibleWidgetHistory,
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
  loading?: boolean;
  busyKey?: string;
  canManageRotation: boolean;
  onPreview: (image: string) => void;
  onPin: (item: WidgetProductLibraryItem) => void;
  onRemove: (target: WidgetProductTarget) => void;
  onToggleSelected: (target: WidgetProductTarget) => void;
  onStartRotation: () => void;
  onTogglePause: () => void;
  onResetRotation: () => void;
};

export default function WidgetProductLibraryPanel({
  items,
  rotation,
  selectedKeys,
  loading = false,
  busyKey = "",
  canManageRotation,
  onPreview,
  onPin,
  onRemove,
  onToggleSelected,
  onStartRotation,
  onTogglePause,
  onResetRotation,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<WidgetHistorySort>("recent");
  const filtered = useMemo(() => filterAndSortWidgetHistory(items, search, sort), [items, search, sort]);
  const visible = visibleWidgetHistory(filtered, expanded, 4);
  const selectedCount = selectedKeys.size;
  const rotationCount = rotation.mode === "selected" ? rotation.targets.length : 0;

  return (
    <section className={styles.panel} aria-label="자주 사용한 상품 위젯">
      <div className={styles.header}>
        <div className={styles.headingWrap}>
          <strong className={styles.title}>📌 자주 사용한 상품 위젯</strong>
          <span className={styles.count}>{items.length}개</span>
          {rotation.mode === "selected" ? (
            <span className={`${styles.status} ${rotation.paused ? styles.paused : ""}`}>
              {rotation.paused ? "순환 일시정지" : `${rotationCount}개 순환 중`}
            </span>
          ) : null}
        </div>
        <div className={styles.headerActions}>
          {items.length > 4 ? (
            <button type="button" className={styles.ghostButton} onClick={() => setExpanded((value) => !value)}>
              {expanded ? "▲ 접기" : `전체 ${items.length}개 보기`}
            </button>
          ) : null}
        </div>
      </div>

      {expanded ? (
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
      ) : null}

      {loading ? (
        <div className={styles.empty}>자주 사용한 상품을 불러오는 중…</div>
      ) : items.length === 0 ? (
        <div className={styles.empty}>상품을 한 번이라도 고정하면 이곳에 계속 보관됩니다.</div>
      ) : visible.length === 0 ? (
        <div className={styles.empty}>검색 결과가 없습니다.</div>
      ) : (
        <div className={`${styles.grid} ${expanded ? styles.expandedGrid : ""}`}>
          {visible.map((item) => {
            const key = widgetTargetKey(item);
            const selected = selectedKeys.has(key);
            const busy = busyKey === key;
            return (
              <article key={key} className={`${styles.card} ${selected ? styles.selectedCard : ""} ${!item.available ? styles.unavailableCard : ""}`}>
                <label className={styles.checkWrap} title="자동 순환에 포함">
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={!item.available || !item.inBroadcast || !canManageRotation}
                    onChange={() => onToggleSelected(item)}
                  />
                  <span className={styles.checkText}>순환</span>
                </label>
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
                  disabled={!item.available || !item.inBroadcast || busy}
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

      {(selectedCount > 0 || rotation.mode === "selected") ? (
        <div className={styles.actionBar}>
          <span className={styles.actionSummary}>{selectedCount > 0 ? `${selectedCount}개 선택됨` : "선택 상품 없음"}</span>
          <div className={styles.actionButtons}>
            {rotation.mode === "selected" ? (
              <button type="button" className={styles.secondaryButton} disabled={!canManageRotation} onClick={onTogglePause}>
                {rotation.paused ? "▶ 순환 재개" : "Ⅱ 일시정지"}
              </button>
            ) : null}
            <button type="button" className={styles.primaryButton} disabled={!canManageRotation || selectedCount === 0} onClick={onStartRotation}>
              선택 상품 순환 시작
            </button>
            {rotation.mode === "selected" ? (
              <button type="button" className={styles.ghostButton} disabled={!canManageRotation} onClick={onResetRotation}>전체 상품 순환</button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
