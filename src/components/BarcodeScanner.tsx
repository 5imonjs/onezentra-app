'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType, NotFoundException } from '@zxing/library';
import Modal from '@/components/Modal';

/**
 * Format barcode yang perlu didecode. Dibatasi per halaman supaya 1D reader
 * yang tidak relevan tidak ikut mencoba tiap frame — tiap percobaan gagal
 * me-log `MultiFormatReader: non-ReaderException` (NotFoundException, derau
 * normal frame tanpa barcode yang di-port JS salah jadi `console.warn`).
 */
export const SCAN_FORMATS_1D = [
  BarcodeFormat.CODE_39,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_93,
  BarcodeFormat.ITF,
  BarcodeFormat.CODABAR,
];

export const SCAN_FORMATS_QR = [BarcodeFormat.QR_CODE];

interface BarcodeScannerProps {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
  formats?: BarcodeFormat[];
  /** Judul modal scanner; default scan dokumen PO transporter. */
  title?: string;
  /** Instruksi singkat di bawah judul. */
  subtitle?: string;
}

export default function BarcodeScanner({ open, onClose, onDetected, formats, title = 'Scan Barcode PO Transporter', subtitle = 'Arahkan kamera ke barcode pada dokumen' }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(true);

  const onDetectedFn = useCallback((code: string) => onDetected(code), [onDetected]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    let detections = 0;
    // NotFoundException adalah kondisi normal tiap frame (kamera belum mengarah
    // ke barcode). Library ZXing JS me-log-nya sebagai warn karena bug port
    // (NotFoundException bukan turunan ReaderException), padahal bukan error —
    // redam spam spesifik ini selama scanner aktif, warn lain tetap tampil.
    const originalWarn = console.warn.bind(console);
    const warnFilter = (...args: unknown[]) => {
      const first = args[0];
      const second = args[1] as NotFoundException | { name?: string } | undefined;
      if (
        typeof first === 'string'
        && first.startsWith('MultiFormatReader: non-ReaderException')
        && (second instanceof NotFoundException || second?.name === 'NotFoundException')
      ) {
        return;
      }
      originalWarn(...(args as Parameters<typeof console.warn>));
    };
    console.warn = warnFilter;
    setError('');
    setScanning(true);

    const start = async () => {
      if (!videoRef.current) return;
      try {
        // Batasi format yang didecode: tiap reader yang dicoba pada frame tanpa
        // barcode me-log console.warn (bug port JS: NotFoundException bukan
        // turunan ReaderException), jadi reader yang tak relevan jangan dijalankan.
        const hints = formats ? new Map([[DecodeHintType.POSSIBLE_FORMATS, formats]]) : undefined;
        const reader = new BrowserMultiFormatReader(hints);
        const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
          if (cancelled) return;
          const text = result?.getText();
          if (text) {
            detections += 1;
            if (detections === 1) {
              cancelled = true;
              controls?.stop();
              setScanning(false);
              onDetectedFn(text);
            }
          }
        });
        controlsRef.current = controls;
      } catch {
        if (!cancelled) {
          setError('Kamera tidak dapat diakses. Pastikan izin kamera diberikan atau gunakan input manual.');
          setScanning(false);
        }
      }
    };

    start();

    return () => {
      cancelled = true;
      try { controlsRef.current?.stop(); } catch { /* ignore */ }
      controlsRef.current = null;
      console.warn = originalWarn;
    };
  }, [open, onDetectedFn, formats]);

  return (
    <Modal open={open} onClose={onClose} title={title} subtitle={subtitle}>
      <div className="space-y-4">
        <video ref={videoRef} className="w-full rounded-xl bg-black aspect-video object-cover" muted playsInline />
        {scanning && !error && (
          <p className="text-sm text-muted-foreground text-center">Memindai barcode...</p>
        )}
        {error && (
          <p className="text-sm text-red-600 text-center">{error}</p>
        )}
        <div className="flex justify-center">
          <button onClick={onClose} className="btn-secondary">Tutup</button>
        </div>
      </div>
    </Modal>
  );
}