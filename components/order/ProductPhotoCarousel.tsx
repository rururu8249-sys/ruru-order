"use client";

import { useEffect, useMemo, useRef } from "react";

type ProductPhotoCarouselProps = {
  images: string[];
  selectedPhoto: string;
  alt: string;
  onPhotoChange: (photo: string) => void;
  onOpen: (photo: string) => void;
};

const reducedMotionBehavior = (): ScrollBehavior => {
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    return "auto";
  }
  return "smooth";
};

export default function ProductPhotoCarousel({
  images,
  selectedPhoto,
  alt,
  onPhotoChange,
  onOpen,
}: ProductPhotoCarouselProps) {
  const photos = useMemo(() => {
    const ordered = Array.from(new Set(images.map((photo) => String(photo || "").trim()).filter(Boolean)));
    const selected = String(selectedPhoto || "").trim();
    return selected && !ordered.includes(selected) ? [selected, ...ordered] : ordered;
  }, [images, selectedPhoto]);
  const selectedIndex = Math.max(0, photos.indexOf(selectedPhoto));
  const activeIndex = selectedIndex;
  const trackRef = useRef<HTMLDivElement | null>(null);
  const scrollingRef = useRef(false);
  const scrollingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastInternalPhotoRef = useRef("");
  const photoSignature = photos.join("\u0000");

  const scrollToIndex = (index: number, notify = true) => {
    const nextIndex = Math.max(0, Math.min(index, photos.length - 1));
    const photo = photos[nextIndex];
    if (!photo) return;

    if (notify) {
      lastInternalPhotoRef.current = photo;
      onPhotoChange(photo);
    }

    const track = trackRef.current;
    if (track) {
      track.scrollTo({
        left: nextIndex * track.clientWidth,
        behavior: reducedMotionBehavior(),
      });
    }
  };

  useEffect(() => {
    if (lastInternalPhotoRef.current === selectedPhoto) {
      lastInternalPhotoRef.current = "";
      return;
    }

    const track = trackRef.current;
    if (!track) return;
    const targetLeft = selectedIndex * track.clientWidth;
    if (Math.abs(track.scrollLeft - targetLeft) < 2) return;
    track.scrollTo({ left: targetLeft, behavior: reducedMotionBehavior() });
  }, [photoSignature, selectedIndex, selectedPhoto]);

  useEffect(() => () => {
    if (scrollingTimerRef.current) clearTimeout(scrollingTimerRef.current);
  }, []);

  if (photos.length === 0) return null;

  return (
    <div
      className="ru-photo-stage"
      style={{
        position: "relative",
        width: "100%",
        height: "clamp(220px, 62vw, 280px)",
        borderRadius: "14px",
        overflow: "hidden",
        background: "#F0EBE8",
      }}
    >
      <div
        ref={trackRef}
        data-photo-carousel-track
        onScroll={(event) => {
          const track = event.currentTarget;
          if (track.clientWidth < 1) return;
          const nextIndex = Math.max(0, Math.min(Math.round(track.scrollLeft / track.clientWidth), photos.length - 1));

          scrollingRef.current = true;
          if (scrollingTimerRef.current) clearTimeout(scrollingTimerRef.current);
          scrollingTimerRef.current = setTimeout(() => { scrollingRef.current = false; }, 100);

          if (nextIndex !== activeIndex) {
            lastInternalPhotoRef.current = photos[nextIndex];
            onPhotoChange(photos[nextIndex]);
          }
        }}
        className="ru-photo-track"
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          overflowX: "auto",
          overflowY: "hidden",
          scrollSnapType: "x mandatory",
          scrollbarWidth: "none",
          WebkitOverflowScrolling: "touch",
          overscrollBehaviorX: "contain",
        }}
      >
        {photos.map((photo, index) => (
          <button
            key={photo}
            type="button"
            data-photo-carousel-slide
            aria-label={`${alt} ${index + 1}번째 사진 크게 보기`}
            onClick={() => {
              if (scrollingRef.current) return;
              onOpen(photo);
            }}
            style={{
              flex: "0 0 100%",
              width: "100%",
              height: "100%",
              padding: 0,
              border: 0,
              background: "transparent",
              scrollSnapAlign: "start",
              scrollSnapStop: "always",
              cursor: "zoom-in",
            }}
          >
            {/* 상품 사진은 운영 DB·스토리지의 가변 외부 URL이라 next/image 도메인 고정 목록을 쓸 수 없다. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo}
              alt={`${alt} ${index + 1}번째 사진`}
              draggable={false}
              style={{ display: "block", width: "100%", height: "100%", objectFit: "contain", userSelect: "none" }}
            />
          </button>
        ))}
      </div>

      {photos.length > 1 ? (
        <>
          <button
            type="button"
            data-photo-carousel-nav
            className="ru-photo-nav ru-photo-nav-prev"
            aria-label="이전 사진"
            disabled={activeIndex === 0}
            onClick={() => scrollToIndex(activeIndex - 1)}
            style={{ zIndex: 2, opacity: activeIndex === 0 ? 0.28 : 1 }}
          >‹</button>
          <button
            type="button"
            data-photo-carousel-nav
            className="ru-photo-nav ru-photo-nav-next"
            aria-label="다음 사진"
            disabled={activeIndex === photos.length - 1}
            onClick={() => scrollToIndex(activeIndex + 1)}
            style={{ zIndex: 2, opacity: activeIndex === photos.length - 1 ? 0.28 : 1 }}
          >›</button>

          <div
            aria-label={`상품 사진 ${activeIndex + 1}/${photos.length}`}
            style={{
              position: "absolute",
              zIndex: 2,
              left: "50%",
              bottom: "9px",
              display: "flex",
              alignItems: "center",
              gap: "1px",
              transform: "translateX(-50%)",
              borderRadius: "999px",
              background: "rgba(0,0,0,0.34)",
              padding: "3px 5px",
              backdropFilter: "blur(2px)",
            }}
          >
            {photos.map((photo, index) => (
              <button
                key={`dot-${photo}`}
                type="button"
                data-photo-carousel-dot
                aria-label={`${index + 1}번째 사진 보기`}
                aria-current={index === activeIndex ? "true" : undefined}
                onClick={() => scrollToIndex(index)}
                style={{
                  display: "grid",
                  placeItems: "center",
                  width: "16px",
                  height: "16px",
                  padding: 0,
                  border: 0,
                  background: "transparent",
                  cursor: "pointer",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: "6px",
                    height: "6px",
                    borderRadius: "999px",
                    background: "#fff",
                    opacity: index === activeIndex ? 1 : 0.5,
                    transform: index === activeIndex ? "scale(1.2)" : "scale(1)",
                    transition: "opacity 180ms ease, transform 180ms ease",
                  }}
                />
              </button>
            ))}
          </div>
        </>
      ) : null}

      <span style={{ position: "absolute", zIndex: 2, right: "8px", bottom: "8px", borderRadius: "999px", background: "rgba(0,0,0,0.72)", padding: "4px 9px", color: "#fff", fontSize: "11px", fontWeight: 900, lineHeight: 1, pointerEvents: "none" }}>🔍 크게</span>
    </div>
  );
}
