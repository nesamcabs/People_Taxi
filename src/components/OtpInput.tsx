import { useEffect, useRef } from 'react';

export const OTP_LENGTH = 6;

/**
 * Six-digit code entry. One real (transparent) input sits over six display boxes, so typing, paste, backspace,
 * the phone keypad and SMS auto-fill ("one-time-code") all work natively; the boxes only show the digits.
 */
export function OtpInput({
  id = 'otp',
  value,
  onChange,
  onComplete,
  disabled,
  invalid,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  onComplete: (v: string) => void;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);

  // Focus on first show, and again whenever the field comes back from "verifying" or a wrong code, so the person
  // can type straight away without tapping it first.
  useEffect(() => {
    if (!disabled) ref.current?.focus({ preventScroll: true });
  }, [disabled]);

  const placeCaretAtEnd = () => {
    const el = ref.current;
    if (el) el.setSelectionRange(el.value.length, el.value.length);
  };

  return (
    <div
      className={`otp ${invalid ? 'is-invalid' : ''} ${disabled ? 'is-busy' : ''}`}
      onClick={() => {
        ref.current?.focus();
        placeCaretAtEnd();
      }}
    >
      <label className="sr-only" htmlFor={id}>
        6-digit verification code
      </label>
      <div className="otp__boxes" aria-hidden="true">
        {Array.from({ length: OTP_LENGTH }, (_, i) => (
          <span
            key={i}
            className={`otp__box ${i === Math.min(value.length, OTP_LENGTH - 1) && !disabled ? 'is-current' : ''} ${value[i] ? 'is-filled' : ''}`}
            style={{ ['--i' as string]: i }}
          >
            {value[i] ?? ''}
          </span>
        ))}
      </div>
      <input
        id={id}
        ref={ref}
        className="otp__input"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        autoCorrect="off"
        spellCheck={false}
        pattern="[0-9]*"
        maxLength={OTP_LENGTH}
        value={value}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        onSelect={placeCaretAtEnd}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, '').slice(0, OTP_LENGTH);
          onChange(v);
          // Fire once, when the last digit goes in (not on every keystroke after).
          if (v.length === OTP_LENGTH && value.length !== OTP_LENGTH) onComplete(v);
        }}
      />
    </div>
  );
}
