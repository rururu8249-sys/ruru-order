import type { ReactNode } from "react";
import type { Viewport } from "next";
import KakaoExternalOpen from "@/components/customer/KakaoExternalOpen";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};


export default function OrderLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <KakaoExternalOpen />
      {children}
    </>
  );
}
