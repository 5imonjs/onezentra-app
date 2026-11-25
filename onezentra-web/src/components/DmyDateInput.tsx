'use client';

import { useEffect, useState } from 'react';
import { formatDateDmy, splitDateOnly } from '@/lib/dates';

interface DmyDateInputProps {
  id: string;
  /** Nilai tersimpan/API selalu 'YYYY-MM-DD'. */
  value: string;
  onChange: (iso: string) => void;
  /** Batas bawah 'YYYY-MM-DD' (mis. RKH tidak boleh sebelum hari ini). */
  min?: string;
  ariaLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/** Mask `dd/mm/yyyy` sambil mengetik, tanpa pergeseran zona waktu. */
function maskDmy(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) {
    return digits;
  }
  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function dmyToIso(text: string): string {
  if (text.length !== 10) {
    return '';
  }
  const day = text.slice(0, 2);
  const month = text.slice(3, 5);
  const year = text.slice(6, 10);
  return `${year}-${month}-${day}`;
}

/**
 * Input tanggal dengan tampilan dd/mm/yyyy (lel botak dari locale browser).
 * State induk tetap memakai 'YYYY-MM-DD' supaya kontrak API tidak berubah.
 */
export default function DmyDateInput({
  id, value, onChange, min, ariaLabel, placeholder = 'dd/mm/yyyy', disabled = false, className = '',
}: DmyDateInputProps) {
  const fromValue = formatDateDmy(value);
  const [text, setText] = useState(fromValue === '-' ? '' : fromValue);
  const [invalid, setInvalid] = useState(false);

  // Sinkron dari luar (prefill, edit, reset) tanpa menimpa ketikan pengguna.
  useEffect(() => {
    const isoFromText = dmyToIso(text);
    if (value !== isoFromText) {
      const next = formatDateDmy(value);
      setText(next === '-' ? '' : next);
      setInvalid(false);
    }
    // `text` sengaja tidak jadi dependency: update dari ketikan sudah lewat
    // handleChange, dan memasukkan text di sini akan membatalkan mask.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = maskDmy(event.target.value);
    setText(next);

    if (next.length < 10) {
      setInvalid(false);
      if (value !== '') {
        onChange('');
      }
      return;
    }

    const iso = dmyToIso(next);
    const parts = splitDateOnly(iso);
    const beforeMin = !!min && iso < min;
    const ok = parts !== null && !beforeMin;
    setInvalid(!ok);
    if (ok) {
      onChange(iso);
    }
  };

  const handleBlur = () => {
    if (invalid || (text.length > 0 && text.length < 10)) {
      setInvalid(false);
      const current = formatDateDmy(value);
      setText(current === '-' ? '' : current);
    }
  };

  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={text}
      onChange={handleChange}
      onBlur={handleBlur}
      disabled={disabled}
      aria-invalid={invalid || undefined}
      className={`${className} ${invalid ? 'border-destructive ring-destructive/20' : ''}`}
    />
  );
}
