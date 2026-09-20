'use client';

import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import Modal from '@/components/Modal';

interface BarcodeScannerProps {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
}

export default function BarcodeScanner({ open, onClose, onDetected }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(true);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    let detections = 0;
    setError('');
    setScanning(true);

    const start = async () => {
      if (!videoRef.current) return;
      try {
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
          if (cancelled) return;
          const text = result?.getText();
          if (text) {
            detections += 1;
            if (detections === 1) {
              cancelled = true;
              controls?.stop();
              setScanning(false);
              onDetected(text);
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
    };
  }, [open, onDetected]);

  return (
    <Modal open={open} onClose={onClose} title="Scan Barcode PO Transporter" subtitle="Arahkan kamera ke barcode pada dokumen">
      <div className="space-y-4">
        <video ref={videoRef} className="w-full rounded-xl bg-black aspect-video object-cover" muted playsInline />
        {scanning && !error && (
          <p className="text-sm text-gray-500 text-center">Memindai barcode...</p>
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