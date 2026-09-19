import type { MetadataRoute } from "next";

// [2026-09-20] 손님 폰 홈 화면 설치(PWA) 설정.
//   근거: MDN 「Define your app icons」 + web app manifest 스펙 + evilmartians 「How to Favicon in 2026」(직접 확인).
//   아이콘 파일은 app/ 폴더 규칙(favicon.ico · icon.svg · apple-icon.png)으로 자동 연결되고,
//   설치 아이콘(192/512/maskable)은 예전 루루동이 로고 그대로 — 이미 설치한 손님의 아이콘이 안 바뀐다.
export default function manifest(): MetadataRoute.Manifest {
  return {
    // id 를 고정해야 start_url 을 바꿔도 «같은 앱»으로 인식돼 중복 설치가 안 생긴다(W3C manifest id)
    id: "/order",
    name: "루루동이 집구석LIVE",
    short_name: "루루동이",
    description: "루루동이 라이브 쇼핑몰 — 방송 주문·주문조회·공지",
    lang: "ko",
    dir: "ltr",
    start_url: "/order",
    // scope 를 안 적으면 start_url 의 상위 폴더로 «추정»된다 → 명시해서 모든 손님 화면을 앱 안에서 열게 한다
    scope: "/",
    display: "standalone",
    // 설치 환경이 standalone 을 못 쓰면 minimal-ui → browser 순서로 내려간다
    display_override: ["standalone", "minimal-ui"],
    // 세로 고정 — 가로로 돌아가면 폭이 넓어져 「PC 화면처럼」 보인다
    orientation: "portrait",
    background_color: "#FBEFF3",
    theme_color: "#7B2D43",
    categories: ["shopping"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // 홈 화면 아이콘을 길게 누르면 나오는 바로가기
    shortcuts: [
      { name: "주문하기", short_name: "주문", url: "/order", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "주문조회", short_name: "주문조회", url: "/myorder", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "공지·쪽지", short_name: "공지", url: "/notice", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
