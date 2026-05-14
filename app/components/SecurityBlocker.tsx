"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export default function SecurityBlocker() {
  const pathname = usePathname();

  useEffect(() => {
    const isAdminPage = pathname?.startsWith("/admin");

    const isEditableElement = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;

      const tagName = target.tagName.toLowerCase();

      return (
        tagName === "input" ||
        tagName === "textarea" ||
        target.isContentEditable
      );
    };

    const allowCopyForAdmin = () => {
      document.body.style.setProperty("user-select", "text");
      document.body.style.setProperty("-webkit-user-select", "text");
      document.body.style.setProperty("-moz-user-select", "text");
      document.body.style.setProperty("-ms-user-select", "text");
      document.body.style.setProperty("-webkit-touch-callout", "default");
    };

    const clearSecurityStyles = () => {
      document.body.style.removeProperty("user-select");
      document.body.style.removeProperty("-webkit-user-select");
      document.body.style.removeProperty("-moz-user-select");
      document.body.style.removeProperty("-ms-user-select");
      document.body.style.removeProperty("-webkit-touch-callout");
    };

    if (isAdminPage) {
      allowCopyForAdmin();

      return () => {
        clearSecurityStyles();
      };
    }

    const preventContextMenu = (event: MouseEvent) => {
      if (isEditableElement(event.target)) return;
      event.preventDefault();
    };

    const preventSelectStart = (event: Event) => {
      if (isEditableElement(event.target)) return;
      event.preventDefault();
    };

    const preventCopy = (event: ClipboardEvent) => {
      if (isEditableElement(event.target)) return;
      event.preventDefault();
    };

    const preventCut = (event: ClipboardEvent) => {
      if (isEditableElement(event.target)) return;
      event.preventDefault();
    };

    const preventPaste = (event: ClipboardEvent) => {
      if (isEditableElement(event.target)) return;
      event.preventDefault();
    };

    const preventKeyDown = (event: KeyboardEvent) => {
      if (isEditableElement(event.target)) return;

      const key = event.key.toLowerCase();

      if (
        (event.ctrlKey || event.metaKey) &&
        ["c", "x", "u", "s", "a", "p"].includes(key)
      ) {
        event.preventDefault();
      }

      if (event.key === "F12") {
        event.preventDefault();
      }
    };

    document.addEventListener("contextmenu", preventContextMenu);
    document.addEventListener("selectstart", preventSelectStart);
    document.addEventListener("copy", preventCopy);
    document.addEventListener("cut", preventCut);
    document.addEventListener("paste", preventPaste);
    document.addEventListener("keydown", preventKeyDown);

    document.body.style.setProperty("user-select", "none");
    document.body.style.setProperty("-webkit-user-select", "none");
    document.body.style.setProperty("-moz-user-select", "none");
    document.body.style.setProperty("-ms-user-select", "none");
    document.body.style.setProperty("-webkit-touch-callout", "none");

    return () => {
      document.removeEventListener("contextmenu", preventContextMenu);
      document.removeEventListener("selectstart", preventSelectStart);
      document.removeEventListener("copy", preventCopy);
      document.removeEventListener("cut", preventCut);
      document.removeEventListener("paste", preventPaste);
      document.removeEventListener("keydown", preventKeyDown);

      clearSecurityStyles();
    };
  }, [pathname]);

  return null;
}
