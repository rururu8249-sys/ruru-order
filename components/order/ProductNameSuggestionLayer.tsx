"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Suggestion = {
  name: string;
  keywords?: string[];
};

type InputTarget = HTMLInputElement | HTMLTextAreaElement;

const BLOCKED_FIELD_WORDS = [
  "색상",
  "사이즈",
  "수량",
  "금액",
  "가격",
  "전화",
  "연락처",
  "주소",
  "성함",
  "이름",
  "닉네임",
  "메모",
  "배송",
  "비밀번호",
  "핀",
  "pin",
  "color",
  "size",
  "qty",
  "quantity",
  "price",
  "phone",
  "address",
  "name",
  "memo",
];

function normalizeText(value: string) {
  return value.replace(/\s+/g, "").toLowerCase();
}

function getFieldContext(element: InputTarget) {
  const id = element.getAttribute("id") || "";
  const name = element.getAttribute("name") || "";
  const placeholder = element.getAttribute("placeholder") || "";
  const ariaLabel = element.getAttribute("aria-label") || "";
  const title = element.getAttribute("title") || "";
  const autocomplete = element.getAttribute("autocomplete") || "";

  const labelText = id
    ? Array.from(document.querySelectorAll(`label[for="${CSS.escape(id)}"]`))
        .map((label) => label.textContent || "")
        .join(" ")
    : "";

  const parentText = element.closest("label, div, section, fieldset")?.textContent || "";

  return [
    id,
    name,
    placeholder,
    ariaLabel,
    title,
    autocomplete,
    labelText,
    parentText.slice(0, 160),
  ].join(" ");
}

function isProductNameField(element: EventTarget | null): element is InputTarget {
  if (!(element instanceof HTMLInputElement) && !(element instanceof HTMLTextAreaElement)) {
    return false;
  }

  if (element instanceof HTMLInputElement) {
    const type = (element.getAttribute("type") || "text").toLowerCase();

    if (!["text", "search", ""].includes(type)) {
      return false;
    }
  }

  const context = getFieldContext(element);
  const normalizedContext = normalizeText(context);

  const looksLikeProductName =
    normalizedContext.includes("상품명") ||
    normalizedContext.includes("상품이름") ||
    normalizedContext.includes("상품입력") ||
    normalizedContext.includes("주문상품") ||
    normalizedContext.includes("productname") ||
    normalizedContext.includes("product_name") ||
    normalizedContext.includes("itemname") ||
    normalizedContext.includes("item_name");

  if (!looksLikeProductName) {
    return false;
  }

  const blocked = BLOCKED_FIELD_WORDS.some((word) => {
    const normalizedWord = normalizeText(word);

    if (["name", "itemname", "productname"].includes(normalizedWord)) {
      return false;
    }

    return normalizedContext.includes(normalizedWord);
  });

  return !blocked;
}

function setNativeValue(element: InputTarget, value: string) {
  const prototype =
    element instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;

  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");

  if (descriptor?.set) {
    descriptor.set.call(element, value);
  } else {
    element.value = value;
  }

  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

export default function ProductNameSuggestionLayer() {
  const [activeInput, setActiveInput] = useState<InputTarget | null>(null);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 0 });
  const abortRef = useRef<AbortController | null>(null);

  const trimmedQuery = query.trim();

  const visibleSuggestions = useMemo(() => {
    if (!trimmedQuery) return [];
    return suggestions.slice(0, 8);
  }, [suggestions, trimmedQuery]);

  useEffect(() => {
    function updatePosition(input: InputTarget | null) {
      if (!input) return;

      const rect = input.getBoundingClientRect();

      setPosition({
        left: Math.max(12, rect.left + window.scrollX),
        top: rect.bottom + window.scrollY + 6,
        width: Math.max(220, rect.width),
      });
    }

    function handleFocusIn(event: FocusEvent) {
      if (!isProductNameField(event.target)) {
        return;
      }

      const input = event.target;
      setActiveInput(input);
      setQuery(input.value || "");
      updatePosition(input);
      setIsOpen(Boolean((input.value || "").trim()));
    }

    function handleInput(event: Event) {
      if (!isProductNameField(event.target)) {
        return;
      }

      const input = event.target;
      setActiveInput(input);
      setQuery(input.value || "");
      updatePosition(input);
      setIsOpen(Boolean((input.value || "").trim()));
    }

    function handleScrollOrResize() {
      updatePosition(activeInput);
    }

    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("input", handleInput);
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);

    return () => {
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("input", handleInput);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [activeInput]);

  useEffect(() => {
    abortRef.current?.abort();

    if (!activeInput || trimmedQuery.length < 1) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    const timer = window.setTimeout(() => {
      fetch(`/api/order/product-name-suggestions?q=${encodeURIComponent(trimmedQuery)}`, {
        signal: controller.signal,
        cache: "no-store",
      })
        .then((response) => response.json())
        .then((payload: { suggestions?: Suggestion[] }) => {
          const nextSuggestions = Array.isArray(payload.suggestions) ? payload.suggestions : [];
          setSuggestions(nextSuggestions);
          setIsOpen(nextSuggestions.length > 0);
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setSuggestions([]);
            setIsOpen(false);
          }
        });
    }, 140);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [activeInput, trimmedQuery]);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const target = event.target;

      if (!(target instanceof HTMLElement)) {
        return;
      }

      if (target.closest("[data-ruru-product-suggestion-layer]")) {
        return;
      }

      if (target === activeInput) {
        return;
      }

      setIsOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [activeInput]);

  if (!isOpen || !activeInput || visibleSuggestions.length === 0) {
    return null;
  }

  return (
    <div
      data-ruru-product-suggestion-layer
      className="z-[9999] rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl"
      style={{
        position: "absolute",
        left: position.left,
        top: position.top,
        width: position.width,
      }}
    >
      <div className="mb-1 px-2 text-[10px] font-black text-slate-400">
        상품명 자동추천
      </div>

      <div className="max-h-64 overflow-y-auto">
        {visibleSuggestions.map((suggestion) => (
          <button
            key={suggestion.name}
            type="button"
            className="block w-full rounded-xl px-3 py-2 text-left hover:bg-blue-50"
            onMouseDown={(event) => {
              event.preventDefault();
              setNativeValue(activeInput, suggestion.name);
              setQuery(suggestion.name);
              setIsOpen(false);
              activeInput.focus();
            }}
          >
            <div className="truncate text-sm font-black text-slate-900">
              {suggestion.name}
            </div>
            {Array.isArray(suggestion.keywords) && suggestion.keywords.length > 0 ? (
              <div className="mt-0.5 truncate text-[11px] font-bold text-slate-400">
                {suggestion.keywords.slice(0, 5).join(", ")}
              </div>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
