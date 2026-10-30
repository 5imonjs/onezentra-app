'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';

interface PhotoEvidenceInputProps {
  /** File terpilih — dikelola parent (ikut dikirim ke server via FormData). */
  file: File | null;
  onChange: (file: File | null) => void;
  /** Judul blok, mis. "Foto bukti wajib" / "Bukti fotografi kondisi wajib". */
  title: string;
  subtitle: string;
  /** Alt text pratinjau. */
  alt: string;
}

/**
 * Input bukti foto (kamera + galeri + pratinjau) — pola bersama untuk
 * validasi item rencana dan barang luar rencana, sehingga tampilan,
 * urutan tap, dan label aksesibilitasnya selalu identik.
 *
 * Pratinjau URL dibuat/dicabut internal agar parent tidak menggandakan
 * logika `createObjectURL`/`revokeObjectURL`.
 */
export default function PhotoEvidenceInput({ file, onChange, title, subtitle, alt }: PhotoEvidenceInputProps) {
  const [preview, setPreview] = useState('');

  useEffect(() => {
    if (!file) {
      setPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return '';
      });
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.files?.[0] ?? null);
  };

  return (
    <div className="space-y-3 rounded-2xl border border-amber-200 bg-linear-to-br from-amber-50 to-orange-50/50 p-4">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
          <svg className="w-4 h-4 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>
        </div>
        <div>
          <p className="text-xs font-bold text-amber-900">{title}</p>
          <p className="text-[11px] text-amber-700 mt-0.5">{subtitle}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <label className="flex-1 cursor-pointer">
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-amber-300 bg-card px-3 py-3 text-center transition-colors hover:bg-amber-50">
            <svg className="w-6 h-6 text-amber-500 mb-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            <p className="text-[11px] font-bold text-amber-700">Kamera</p>
          </div>
          <input type="file" accept="image/*" capture="environment" onChange={pick} className="sr-only" aria-label="Ambil foto dari kamera" />
        </label>
        <label className="flex-1 cursor-pointer">
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-amber-300 bg-card px-3 py-3 text-center transition-colors hover:bg-amber-50">
            <svg className="w-6 h-6 text-amber-500 mb-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>
            <p className="text-[11px] font-bold text-amber-700">Galeri</p>
          </div>
          <input type="file" accept="image/*" onChange={pick} className="sr-only" aria-label="Pilih foto dari galeri" />
        </label>
      </div>
      {preview && (
        <div className="relative rounded-xl overflow-hidden border border-amber-200 bg-card">
          <Image src={preview} alt={alt} className="w-full h-48 object-cover" width={400} height={200} unoptimized />
          <button type="button" onClick={() => onChange(null)} className="absolute top-2 right-2 p-1.5 rounded-full bg-red-500/80 text-white hover:bg-red-600 transition-colors" aria-label="Hapus foto">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}
    </div>
  );
}
