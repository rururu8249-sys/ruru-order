"use client";
// [2026-11-13 사장님 12:04 「이모티콘 여러 개·글 사이에 바로」] 채팅 입력칸 — 유튜브처럼 이모티콘 그림이 글자 사이에 들어가는 한 줄 입력칸.
//   안쪽 값은 지금과 같은 글(«:이름:» 표식) — 보내기·서버·5개 제한·추천 낱말 계산은 그대로 쓴다.
//   한글 조합 중엔 DOM 을 다시 그리지 않음(밖에서 값이 «다르게» 바뀔 때만 — 보낸 뒤 비우기·실패 되돌리기).
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from "react";

type EmojiLite = { id: string; name: string; url: string };

export type ChatRichInputHandle = {
  focus: () => void;
  blur: () => void;
  /** 커서(또는 마지막으로 기억한 커서) 자리에 이모티콘. removeBefore = 커서 앞 글자 몇 개를 지우고 넣을지(«ㅋㅋㅋ» → «ㅋ» + 그림) */
  insertEmoji: (e: EmojiLite, removeBefore?: number) => string;
  /** 글(«:이름:» 표식) 기준 커서 앞쪽 글 */
  textBeforeCaret: () => string;
  element: () => HTMLDivElement | null;
  /** 지금 입력칸 글 그대로(«:이름:») — 보낼 때 화면 갱신 전 값이라도 빠지지 않게 */
  text: () => string;
};

type Props = {
  value: string;
  emojis: EmojiLite[];
  onChange: (text: string, beforeCaret: string) => void;
  onCaret?: (beforeCaret: string) => void;
  onKeyDown?: (e: ReactKeyboardEvent<HTMLDivElement>) => void;
  onFocus?: () => void;
  onEnter?: () => void;
  onCompositionStart?: () => void;
  onCompositionEnd?: () => void;
  readOnly?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
  maxLength: number;
  color: string;
  placeholderColor: string;
  style?: CSSProperties;
};

const TOKEN_RE = /:([0-9A-Za-z_가-힣ㄱ-ㅎㅏ-ㅣ]{1,10}):/g;
const isEmojiImg = (n: Node | null): n is HTMLImageElement => !!n && n.nodeType === 1 && (n as Element).hasAttribute("data-emoji-name");

/** DOM → 글(«:이름:») */
function serialize(root: Node, stopAt?: { node: Node; offset: number }): string {
  let out = "";
  let done = false;
  const walk = (n: Node) => {
    if (done) return;
    if (stopAt && n === stopAt.node && n.nodeType === 3) { out += (n.textContent || "").slice(0, stopAt.offset); done = true; return; }
    if (n.nodeType === 3) { out += n.textContent || ""; return; }
    if (isEmojiImg(n)) { out += `:${n.getAttribute("data-emoji-name")}:`; return; }
    if (n.nodeName === "BR") return;
    const kids = Array.from(n.childNodes);
    for (let i = 0; i < kids.length; i++) {
      if (stopAt && n === stopAt.node && i === stopAt.offset) { done = true; return; }
      walk(kids[i]);
      if (done) return;
    }
    if (stopAt && n === stopAt.node && stopAt.offset >= kids.length) done = true;
  };
  walk(root);
  return out;
}

function makeImg(e: EmojiLite): HTMLImageElement {
  const img = document.createElement("img");
  img.src = e.url;
  img.alt = `:${e.name}:`;
  img.setAttribute("data-emoji-name", e.name);
  img.draggable = false;
  img.style.cssText = "display:inline-block;height:1.6em;width:auto;max-width:4.8em;vertical-align:middle;object-fit:contain;margin:0 1px;";
  return img;
}

/** 글 → DOM(이모티콘 표식은 그림으로, 모르는 이름은 글자 그대로) */
function render(root: HTMLDivElement, text: string, byName: Map<string, EmojiLite>) {
  root.textContent = "";
  let last = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    const at = m.index ?? 0;
    const e = byName.get(m[1]);
    if (!e) continue;
    if (at > last) root.appendChild(document.createTextNode(text.slice(last, at)));
    root.appendChild(makeImg(e));
    last = at + m[0].length;
  }
  if (last < text.length) root.appendChild(document.createTextNode(text.slice(last)));
}

const ChatRichInput = forwardRef<ChatRichInputHandle, Props>(function ChatRichInput(props, ref) {
  const box = useRef<HTMLDivElement | null>(null);
  const lastEmitted = useRef<string>(props.value);
  const savedRange = useRef<Range | null>(null);
  const composing = useRef(false);
  const byName = useRef(new Map<string, EmojiLite>());
  byName.current = new Map(props.emojis.map((e) => [e.name, e]));
  const propsRef = useRef(props);
  propsRef.current = props;

  const inBox = (n: Node | null) => !!n && !!box.current && (n === box.current || box.current.contains(n));
  const currentRange = (): Range | null => {
    const sel = typeof window !== "undefined" ? window.getSelection() : null;
    if (sel && sel.rangeCount && inBox(sel.getRangeAt(0).startContainer)) return sel.getRangeAt(0);
    return savedRange.current;
  };
  const beforeCaret = useCallback(() => {
    const el = box.current;
    if (!el) return "";
    const r = currentRange();
    if (!r) return serialize(el);
    return serialize(el, { node: r.endContainer, offset: r.endOffset });
  }, []);
  const remember = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount && inBox(sel.getRangeAt(0).startContainer)) savedRange.current = sel.getRangeAt(0).cloneRange();
  };
  const emit = () => {
    const el = box.current;
    if (!el) return;
    remember();
    const text = serialize(el);
    lastEmitted.current = text;
    propsRef.current.onChange(text, beforeCaret());
  };

  useEffect(() => {
    if (!props.autoFocus) return;
    const el = box.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    const sel = window.getSelection();
    if (sel) { const end = document.createRange(); end.selectNodeContents(el); end.collapse(false); sel.removeAllRanges(); sel.addRange(end); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 진짜 beforeinput(React onBeforeInput 은 textInput 기반이라 줄바꿈·폰 → 키를 못 받음)
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onBefore = (ev: InputEvent) => {
      if (ev.inputType === "insertParagraph" || ev.inputType === "insertLineBreak") {
        // 폰 키보드 «→» 키 — 안드로이드는 keydown 이 229 로 와서 여기로만 옴(PC Enter 는 keydown 이 먼저 막아 여기 안 옴)
        ev.preventDefault();
        propsRef.current.onEnter?.();
        return;
      }
      if (!composing.current && ev.inputType?.startsWith("insert") && ev.inputType !== "insertCompositionText") {
        const add = (ev.data ?? "").length;
        if (serialize(el).length + add > propsRef.current.maxLength) ev.preventDefault();
      }
    };
    el.addEventListener("beforeinput", onBefore);
    return () => el.removeEventListener("beforeinput", onBefore);
  }, []);
  // 밖에서 값이 바뀌었을 때만 다시 그림(보낸 뒤 비우기·실패 되돌리기·「/」 명령 등)
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    // 한글 조합 중엔 다시 그리지 않음 — 단 «비우기»(보낸 뒤)는 조합 중이어도 비움(안드로이드는 조합이 안 끝난 채 보내짐)
    if (composing.current && props.value !== "") return;
    if (props.value === lastEmitted.current && serialize(el) === props.value) return;
    composing.current = false;
    render(el, props.value, byName.current);
    lastEmitted.current = props.value;
    savedRange.current = null;
  }, [props.value]);

  useImperativeHandle(ref, () => ({
    focus: () => {
      const el = box.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      const sel = window.getSelection();
      const r = savedRange.current;
      if (sel) {
        sel.removeAllRanges();
        if (r && inBox(r.startContainer)) sel.addRange(r);
        else { const end = document.createRange(); end.selectNodeContents(el); end.collapse(false); sel.addRange(end); }
      }
    },
    blur: () => { remember(); box.current?.blur(); },
    element: () => box.current,
    text: () => (box.current ? serialize(box.current) : ""),
    textBeforeCaret: () => beforeCaret(),
    insertEmoji: (e: EmojiLite, removeBefore = 0) => {
      const el = box.current;
      if (!el) return propsRef.current.value;
      let r = currentRange()?.cloneRange() ?? null;
      if (!r || !inBox(r.startContainer)) { r = document.createRange(); r.selectNodeContents(el); r.collapse(false); }
      r.deleteContents();
      // 커서 바로 앞 글자 지우기(같은 글자 칸 안에서만 — 그림은 안 지움)
      if (removeBefore > 0 && r.startContainer.nodeType === 3) {
        const t = r.startContainer as Text;
        const off = r.startOffset;
        const cut = Math.min(removeBefore, off);
        t.deleteData(off - cut, cut);
        r.setStart(t, off - cut);
        r.collapse(true);
      }
      const img = makeImg(e);
      r.insertNode(img);
      const after = document.createRange();
      after.setStartAfter(img);
      after.collapse(true);
      savedRange.current = after;
      const sel = window.getSelection();
      if (sel && document.activeElement === el) { sel.removeAllRanges(); sel.addRange(after); }
      el.normalize();
      // normalize 뒤 범위가 깨질 수 있어 그림 바로 뒤로 다시
      const fixed = document.createRange();
      fixed.setStartAfter(img); fixed.collapse(true);
      savedRange.current = fixed;
      if (sel && document.activeElement === el) { sel.removeAllRanges(); sel.addRange(fixed); }
      img.scrollIntoView?.({ block: "nearest", inline: "nearest" });
      const text = serialize(el);
      lastEmitted.current = text;
      propsRef.current.onChange(text, beforeCaret());
      return text;
    },
  }), [beforeCaret]);

  const p = props;
  return (
    <div style={{ position: "relative", flex: 1, minWidth: 0, height: "100%", display: "flex", alignItems: "center" }}>
      {!p.value ? <span aria-hidden="true" style={{ position: "absolute", left: (p.style?.paddingLeft as string | number | undefined) ?? 16, pointerEvents: "none", color: p.placeholderColor, fontSize: "16px", whiteSpace: "nowrap" }}>{p.placeholder}</span> : null}
      <div
        ref={box}
        data-live-chat-input
        role="textbox"
        aria-label="채팅 메시지"
        aria-multiline="false"
        contentEditable={!p.readOnly}
        suppressContentEditableWarning
        enterKeyHint="send"
        spellCheck={false}
        onInput={() => emit()}
        onCompositionStart={() => { composing.current = true; p.onCompositionStart?.(); }}
        onCompositionEnd={() => { composing.current = false; p.onCompositionEnd?.(); emit(); }}
        onPaste={(e) => {
          e.preventDefault();
          const raw = e.clipboardData.getData("text/plain").replace(/[\r\n]+/g, " ");
          const room = Math.max(0, p.maxLength - serialize(box.current!).length);
          const text = raw.slice(0, room);
          if (text) document.execCommand("insertText", false, text);
        }}
        onDrop={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (e.nativeEvent.isComposing || composing.current || e.keyCode === 229 || e.repeat) return;
            p.onKeyDown?.(e);
            if (!e.isPropagationStopped()) p.onEnter?.();
            return;
          }
          p.onKeyDown?.(e);
        }}
        onKeyUp={() => { remember(); p.onCaret?.(beforeCaret()); }}
        onMouseUp={() => { remember(); p.onCaret?.(beforeCaret()); }}
        onFocus={() => p.onFocus?.()}
        onBlur={remember}
        style={{ flex: 1, minWidth: 0, height: "100%", display: "block", whiteSpace: "pre", overflowWrap: "normal", wordBreak: "keep-all", overflowX: "auto", overflowY: "hidden", scrollbarWidth: "none", outline: "none", fontSize: "16px", lineHeight: "46px", boxSizing: "border-box", color: p.color, caretColor: p.color, WebkitUserSelect: "text", userSelect: "text", cursor: "text", ...p.style }}
      />
    </div>
  );
});

export default ChatRichInput;
