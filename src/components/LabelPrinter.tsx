'use client';

import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import Modal from '@/components/Modal';
import { printLabelViaBluetooth, isWebBluetoothSupported, buildBrowserPrintHtml } from '@/lib/bluetoothPrint';
import type { LabelData } from '@/lib/bluetoothPrint';

interface LabelPrinterProps {
  open: boolean;
  onClose: () => void;
  data: LabelData | null;
}

type SizeOption = '80' | '58' | 'custom';

const sizePresets: Record<Exclude<SizeOption, 'custom'>, number> = {
  '80': 302,
  '58': 219,
};

export default function LabelPrinter({ open, onClose, data }: LabelPrinterProps) {
  const [size, setSize] = useState<SizeOption>('80');
  const [customMm, setCustomMm] = useState('100');
  const [qrUrl, setQrUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const effectiveWidthPx = size === 'custom' ? Math.max(80, Math.round(parseFloat(customMm) * 3.779)) : sizePresets[size];

  useEffect(() => {
    if (!open || !data) return;
    setStatus(null);
    QRCode.toDataURL(data.batchNumber, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: effectiveWidthPx / 2,
    })
      .then(setQrUrl)
      .catch(() => setQrUrl(''));
  }, [open, data, effectiveWidthPx]);

  const handleClose = useCallback(() => {
    setStatus(null);
    onClose();
  }, [onClose]);

  const handleBrowserPrint = useCallback(() => {
    if (!data) return;
    const w = window.open('', '_blank', 'width=500,height=400');
    if (!w) return;
    w.document.write(buildBrowserPrintHtml(data, qrUrl, effectiveWidthPx));
    w.document.close();
  }, [data, qrUrl, effectiveWidthPx]);

  const handleBluetoothPrint = useCallback(async () => {
    if (!data) return;
    setBusy(true);
    setStatus(null);
    try {
      if (!isWebBluetoothSupported()) {
        setStatus('Web Bluetooth tidak tersedia di browser ini. Gunakan Chrome/Edge desktop, atau gunakan Cetak Browser.');
        return;
      }
      setStatus('Pilih printer Bluetooth pada dialog...');
      await printLabelViaBluetooth(data);
      setStatus('Label berhasil dikirim ke printer.');
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Gagal mencetak via Bluetooth.');
    } finally {
      setBusy(false);
    }
  }, [data]);

  if (!data) return null;

  return (
    <Modal open={open} onClose={handleClose} title="Cetak Label Batch" subtitle={data.batchNumber} size="md" footer={
      <>
        <button onClick={handleClose} className="btn-secondary">Tutup</button>
        <button onClick={handleBluetoothPrint} disabled={busy} className="btn-secondary">
          {busy ? 'Mengirim...' : 'Cetak Bluetooth'}
        </button>
        <button onClick={handleBrowserPrint} className="btn-primary">Cetak Browser</button>
      </>
    }>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <label htmlFor="label-size" className="text-sm font-medium text-gray-600">Ukuran Label:</label>
          <select id="label-size" value={size} onChange={(e) => setSize(e.target.value as SizeOption)} className="select-field">
            <option value="80">80mm</option>
            <option value="58">58mm</option>
            <option value="custom">Custom</option>
          </select>
          {size === 'custom' && (
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min="20"
                value={customMm}
                onChange={(e) => setCustomMm(e.target.value)}
                className="input-field text-sm py-1.5 w-20"
                aria-label="Ukuran label custom dalam milimeter"
              />
              <span className="text-xs text-gray-400">mm</span>
            </div>
          )}
        </div>

        <div className="flex justify-center bg-gray-100 rounded-xl p-4 min-h-[220px]">
          <div
            className="bg-white border-2 border-gray-700 p-4 text-center shadow-sm"
            style={{ width: effectiveWidthPx }}
          >
            {qrUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrUrl} alt="QR" className="mx-auto" style={{ width: effectiveWidthPx / 2, height: effectiveWidthPx / 2, imageRendering: 'pixelated' }} />
            ) : (
              <div className="flex items-center justify-center h-32 text-gray-300 text-xs">Membuat QR...</div>
            )}
            {data.productName && <div className="text-xs text-gray-600 mt-2 break-words">{data.productName}</div>}
            <div className="font-mono font-bold text-lg tracking-widest mt-1 break-all">{data.batchNumber}</div>
            <div className="text-xs break-all mt-0.5">{data.barcodeLabel}</div>
            {data.qty && <div className="text-xs mt-1">Qty: {data.qty}{data.unit ? ` ${data.unit}` : ''}</div>}
            {data.expiredDate && <div className="font-bold text-xs mt-1">EXP: {data.expiredDate}</div>}
          </div>
        </div>

        <p className="text-xs text-gray-400">
          Cetak Bluetooth memakai protokol ESC/POS (printer thermal 80mm). Pastikan browser Chrome/Edge desktop dan printer sudah menyala & terhubung Bluetooth.
        </p>

        {status && <p className={`text-xs font-medium ${status.includes('Gagal') || status.includes('tidak') ? 'text-red-600' : 'text-green-600'}`}>{status}</p>}
      </div>
    </Modal>
  );
}
