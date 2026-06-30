import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "루루동이",
    short_name: "루루동이",
    description: "루루동이 라이브 쇼핑몰",
    start_url: "/order",
    display: "standalone",
    background_color: "#FBEFF3",
    theme_color: "#7B2D43",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
