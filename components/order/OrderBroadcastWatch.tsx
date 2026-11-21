"use client";

import { youtubeVideoIdFromUrl } from "@/lib/liveWatch";

type Props = {
  url: string;
  orderReady: boolean;
  embeddedUsable: boolean;
  embeddedShown: boolean;
  paused: boolean;
  onWatchHere: () => void;
};

/** Viewing is available before order information is saved. Embedded ordering retains its existing gate. */
export default function OrderBroadcastWatch({ url, orderReady, embeddedUsable, embeddedShown, paused, onWatchHere }: Props) {
  const videoId = youtubeVideoIdFromUrl(url);
  if (!videoId) return <p className="mt-2 text-[13px] text-white/80">방송 주소를 준비 중이에요.</p>;
  if (orderReady && embeddedUsable && embeddedShown) return null;
  const watchHere = orderReady && embeddedUsable;
  const label = watchHere ? (paused ? "방송 영상 보면서 주문하기" : "방송 보면서 주문하기")
    : paused ? "유튜브에서 방송 영상 보기" : "유튜브로 방송 보기";
  const content = <><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>{label}</>;
  const className = "flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-white px-4 py-3 text-[15px] font-bold text-[#111111] no-underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white";
  return <div className="mt-3 mb-2">
    {watchHere ? <button type="button" className={className} onClick={onWatchHere}>{content}</button>
      : <a className={className} href={`https://www.youtube.com/watch?v=${videoId}`} target="_blank" rel="noopener noreferrer">{content}</a>}
    {!watchHere && <p className="mt-2 text-center text-[12px] leading-relaxed text-white/80">유튜브가 새 창으로 열려요. 주문서는 그대로 유지돼요.</p>}
  </div>;
}
