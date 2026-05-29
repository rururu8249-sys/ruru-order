"use client";

import { useEffect } from "react";

const RELOAD_SESSION_KEY = "ruru-deploy-chunk-reload-at";
const RELOAD_COOLDOWN_MS = 30_000;

function textFromUnknown(value: unknown) {
  if (!value) return "";

  if (typeof value === "string") return value;

  if (value instanceof Error) {
    return [value.name, value.message, value.stack].filter(Boolean).join("\n");
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function isNextAssetUrl(value: string) {
  return value.includes("/_next/static/") || value.includes("/_next/");
}

function isChunkLoadLikeError(message: string) {
  const normalized = message.toLowerCase();

  return (
    normalized.includes("chunkloaderror") ||
    normalized.includes("loading chunk") ||
    normalized.includes("loading css chunk") ||
    normalized.includes("failed to fetch dynamically imported module") ||
    normalized.includes("dynamically imported module") ||
    normalized.includes("importing a module script failed") ||
    normalized.includes("unable to preload css") ||
    isNextAssetUrl(normalized)
  );
}

function getEventAssetUrl(event: Event) {
  const target = event.target;

  if (target instanceof HTMLScriptElement) {
    return target.src || "";
  }

  if (target instanceof HTMLLinkElement) {
    return target.href || "";
  }

  return "";
}

function reloadOnceForFreshDeploy() {
  try {
    const now = Date.now();
    const lastReloadAt = Number(window.sessionStorage.getItem(RELOAD_SESSION_KEY) || "0");

    if (lastReloadAt && now - lastReloadAt < RELOAD_COOLDOWN_MS) {
      return;
    }

    window.sessionStorage.setItem(RELOAD_SESSION_KEY, String(now));
  } catch {
    // sessionStorage가 막힌 환경이어도 새로고침 자체는 1회 시도합니다.
  }

  window.location.reload();
}

export default function DeployChunkReloadGuard() {
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      const assetUrl = getEventAssetUrl(event);
      const errorText = [
        event.message,
        textFromUnknown(event.error),
        assetUrl,
      ]
        .filter(Boolean)
        .join("\n");

      if (isChunkLoadLikeError(errorText)) {
        reloadOnceForFreshDeploy();
      }
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const errorText = textFromUnknown(event.reason);

      if (isChunkLoadLikeError(errorText)) {
        reloadOnceForFreshDeploy();
      }
    };

    window.addEventListener("error", handleError, true);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener("error", handleError, true);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  return null;
}
