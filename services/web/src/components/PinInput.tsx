"use client";

import React, { useMemo, useRef } from "react";

type Props = {
  value: string[];
  onChange: (v: string[]) => void;
};

export default function PinInput({ value, onChange }: Props) {
  const refs = useRef<Array<HTMLInputElement | null>>([null, null, null, null]);

  const digits = useMemo(() => {
    const v = Array.isArray(value) ? value : [];
    return [v[0] ?? "", v[1] ?? "", v[2] ?? "", v[3] ?? ""];
  }, [value]);

  function setAt(i: number, digit: string) {
    const next = [...digits];
    next[i] = digit;
    onChange(next);
  }

  function focusIndex(i: number) {
    refs.current[i]?.focus();
  }

  function handleChange(i: number, raw: string) {
    const digit = raw.replace(/\D/g, "").slice(-1);
    setAt(i, digit);
    if (digit && i < 3) focusIndex(i + 1);
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      if (digits[i]) {
        e.preventDefault();
        setAt(i, "");
        return;
      }
      if (i > 0) {
        e.preventDefault();
        focusIndex(i - 1);
      }
    }

    if (e.key === "ArrowLeft" && i > 0) {
      e.preventDefault();
      focusIndex(i - 1);
    }

    if (e.key === "ArrowRight" && i < 3) {
      e.preventDefault();
      focusIndex(i + 1);
    }

    if (e.key === "Enter") {
      return;
    }
  }

  function handlePaste(
    e: React.ClipboardEvent<HTMLInputElement>,
    startIndex: number,
  ) {
    const txt = e.clipboardData.getData("text");
    const onlyDigits = txt.replace(/\D/g, "").slice(0, 4);
    if (!onlyDigits) return;

    e.preventDefault();

    const next = [...digits];
    for (let k = 0; k < onlyDigits.length; k++) {
      const idx = startIndex + k;
      if (idx > 3) break;
      next[idx] = onlyDigits[k];
    }
    onChange(next);

    const focusTo = Math.min(startIndex + onlyDigits.length, 3);
    focusIndex(focusTo);
  }

  return (
    <div className="pin-root" role="group" aria-label="PIN-код">
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="password"
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={1}
          value={digit}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={(e) => handlePaste(e, i)}
          className="pin-input pin-input--glass"
          aria-label={`Цифра ${i + 1}`}
        />
      ))}

      <style jsx global>{`
        .pin-root {
          display: flex;
          gap: 12px;
          justify-content: center;
          align-items: center;
        }

        .pin-input {
          width: 52px;
          height: 56px;
          border-radius: 18px;
          text-align: center;
          font-size: 1.15rem;
          font-weight: 750;
          letter-spacing: 0.02em;
          font-family: var(--font-display, inherit);
          color: rgb(var(--ink-900, 17 24 39));
          outline: none;
          transition:
            transform 140ms ease,
            box-shadow 160ms ease,
            background 160ms ease,
            border-color 160ms ease;
          -webkit-text-security: disc;
          caret-color: transparent;
        }

        .pin-input--glass {
          background: rgba(255, 255, 255, 0.55);
          border: 1px solid rgba(255, 255, 255, 0.7);
          backdrop-filter: blur(16px);
          box-shadow:
            0 18px 60px rgba(17, 24, 39, 0.08),
            inset 0 1px 0 rgba(255, 255, 255, 0.82);
        }

        .pin-input--glass:hover {
          transform: translateY(-1px);
          background: rgba(255, 255, 255, 0.62);
          box-shadow:
            0 22px 74px rgba(17, 24, 39, 0.1),
            inset 0 1px 0 rgba(255, 255, 255, 0.86);
          border-color: rgba(255, 255, 255, 0.78);
        }

        .pin-input--glass:active {
          transform: translateY(0) scale(0.99);
        }

        .pin-input--glass:focus {
          background: rgba(255, 255, 255, 0.7);
          border-color: rgba(251, 191, 36, 0.45);
          box-shadow:
            0 0 0 4px rgba(251, 191, 36, 0.14),
            0 22px 74px rgba(17, 24, 39, 0.12),
            inset 0 1px 0 rgba(255, 255, 255, 0.9);
          transform: translateY(-1px);
        }

        @media (max-width: 380px) {
          .pin-input {
            width: 46px;
            height: 52px;
            border-radius: 16px;
          }
          .pin-root {
            gap: 10px;
          }
        }
      `}</style>
    </div>
  );
}
