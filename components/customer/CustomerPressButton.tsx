"use client";

import {useEffect, useState, type ButtonHTMLAttributes} from "react";

/** Visual feedback only: native click remains the sole business-action trigger. */
export default function CustomerPressButton({
  className = "", type = "button", disabled, onPointerDown, onPointerUp,
  onPointerCancel, onPointerLeave, onBlur, onKeyDown, onKeyUp, ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  const [pressing, setPressing] = useState(false);
  const available = !disabled && props["aria-disabled"] !== true && props["aria-disabled"] !== "true";
  useEffect(() => {
    if (!pressing) return;
    if (!available) { setPressing(false); return; }
    const release = () => setPressing(false);
    window.addEventListener("blur", release);
    return () => window.removeEventListener("blur", release);
  }, [available, pressing]);
  return <button
    {...props}
    type={type}
    disabled={disabled}
    className={`ruru-customer-press ${className}`.trim()}
    data-pressing={available && pressing}
    onPointerDown={event => {
      onPointerDown?.(event);
      if (available && !event.defaultPrevented && event.button === 0 && event.isPrimary) setPressing(true);
    }}
    onPointerUp={event => { setPressing(false); onPointerUp?.(event); }}
    onPointerCancel={event => { setPressing(false); onPointerCancel?.(event); }}
    onPointerLeave={event => { setPressing(false); onPointerLeave?.(event); }}
    onBlur={event => { setPressing(false); onBlur?.(event); }}
    onKeyDown={event => {
      onKeyDown?.(event);
      if (available && !event.defaultPrevented && (event.key === " " || event.key === "Enter")) setPressing(true);
    }}
    onKeyUp={event => { setPressing(false); onKeyUp?.(event); }}
  />;
}
