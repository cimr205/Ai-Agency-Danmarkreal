import { useEffect, useState, type ComponentProps } from 'react';
import { Input } from '@/components/ui/input';

// A number field that lets people actually type decimals ("33.33" / "33,33").
//
// The previous pattern — <Input type="number" value={n} onChange={e =>
// set(Number(e.target.value))} /> — swallowed the decimal separator: typing
// "33." parsed to 33, React re-rendered the field with "33", and the "."
// was gone, so øre amounts could not be entered on invoices/quotes. This
// keeps the raw text locally and only reports the parsed number upward.

type DecimalInputProps = Omit<ComponentProps<typeof Input>, 'value' | 'onChange' | 'type' | 'min'> & {
  value: number;
  onValueChange: (value: number) => void;
  /** Lowest allowed value. Defaults to 0 (no negatives). Pass null to allow negatives. */
  min?: number | null;
};

function parseDecimal(raw: string): number {
  const n = Number(raw.replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

function toText(n: number): string {
  return Number.isFinite(n) ? String(n) : '';
}

export function DecimalInput({ value, onValueChange, min = 0, ...rest }: DecimalInputProps) {
  const [text, setText] = useState(() => toText(value));

  // Sync when the value is changed from outside (reset, recalculation),
  // but never while the local text already represents that value — that
  // would wipe a trailing "." or "," mid-typing.
  useEffect(() => {
    const parsed = parseDecimal(text);
    if (!(parsed === value || (text.trim() === '' && value === 0))) setText(toText(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const allowNegative = min === null || min < 0;
  const pattern = allowNegative ? /^-?\d*[.,]?\d*$/ : /^\d*[.,]?\d*$/;

  return (
    <Input
      {...rest}
      type="text"
      inputMode="decimal"
      value={text}
      onBlur={e => {
        // Tidy what's shown ("010" → "10", "5," → "5") once the user leaves the field.
        setText(toText(value));
        rest.onBlur?.(e);
      }}
      onChange={e => {
        // A rejected keystroke (e.g. "-" where negatives aren't allowed) must
        // not leave a stray leading zero behind: "0" + "10" became "010".
        const raw = e.target.value.replace(/^(-?)0+(?=\d)/, '$1');
        if (!pattern.test(raw)) return;
        setText(raw);
        const parsed = parseDecimal(raw);
        let next = Number.isFinite(parsed) ? parsed : 0;
        if (min !== null && next < min) next = min;
        onValueChange(next);
      }}
    />
  );
}
