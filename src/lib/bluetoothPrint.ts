export interface LabelData {
  batchNumber: string;
  barcodeLabel: string;
  productName?: string;
  qty?: number | string;
  unit?: string;
  expiredDate?: string;
}

interface BluetoothGATTCharacteristic {
  properties?: { write?: boolean; writeWithoutResponse?: boolean };
  writeValue: (value: Uint8Array) => Promise<void>;
}

interface BluetoothGATTService {
  getCharacteristics: () => Promise<BluetoothGATTCharacteristic[]>;
}

interface BluetoothGATTServer {
  connected: boolean;
  getPrimaryServices: () => Promise<BluetoothGATTService[]>;
  disconnect: () => void;
  connect: () => Promise<BluetoothGATTServer>;
}

interface BluetoothDevice {
  gatt?: BluetoothGATTServer;
}

interface NavigatorWithBluetooth extends Navigator {
  bluetooth: {
    requestDevice: (options: { acceptAllDevices?: boolean; filters?: unknown[] }) => Promise<BluetoothDevice>;
  };
}

const textEncoder = new TextEncoder();

const escpos = {
  init: [0x1b, 0x40],
  alignCenter: [0x1b, 0x61, 0x01],
  alignLeft: [0x1b, 0x61, 0x00],
  boldOn: [0x1b, 0x45, 0x01],
  boldOff: [0x1b, 0x45, 0x00],
  doubleOn: [0x1d, 0x21, 0x11],
  doubleOff: [0x1d, 0x21, 0x00],
  feed: (n: number) => [0x1b, 0x64, n],
  cutFull: [0x1d, 0x56, 0x00],
  cutPartial: [0x1d, 0x56, 0x01],
};

function buildEscPosQr(data: string, moduleSize = 6, ecLevel = 49): number[] {
  const payload = textEncoder.encode(data);
  const out: number[] = [];
  // Select model (49 = model 2)
  out.push(0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 49);
  // Set module size
  out.push(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, moduleSize & 0xff);
  // Set error correction level
  out.push(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, ecLevel & 0xff);
  // Store data
  const n = payload.length;
  const pL = (n + 3) & 0xff;
  const pH = ((n + 3) >> 8) & 0xff;
  out.push(0x1d, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30);
  for (let i = 0; i < n; i++) out.push(payload[i]);
  // Print
  out.push(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30);
  return out;
}

function buildLabelBytes(data: LabelData): Uint8Array {
  const parts: number[] = [];
  const push = (...b: number[]) => parts.push(...b);

  push(...escpos.init);
  push(...escpos.alignCenter);
  push(...escpos.boldOn);
  push(...escpos.doubleOn);

  if (data.productName) {
    push(...textEncoder.encode(data.productName));
    push(...escpos.doubleOff);
    push(...escpos.boldOff);
    push(...escpos.init);
    push(...escpos.alignCenter);
    push(...escpos.boldOn);
  }

  const qr = buildEscPosQr(data.batchNumber);
  push(...qr);
  push(0x0a);

  push(...escpos.doubleOn);
  push(...textEncoder.encode(data.batchNumber));
  push(0x0a);
  push(...escpos.doubleOff);

  if (data.barcodeLabel) {
    push(...textEncoder.encode(data.barcodeLabel));
    push(0x0a);
  }
  if (data.qty) {
    push(...textEncoder.encode(`Qty: ${data.qty}${data.unit ? ' ' + data.unit : ''}`));
    push(0x0a);
  }
  if (data.expiredDate) {
    push(...escpos.boldOn);
    push(...escpos.doubleOn);
    push(...textEncoder.encode(`EXP: ${data.expiredDate}`));
    push(...escpos.doubleOff);
    push(...escpos.boldOff);
    push(0x0a);
  }

  push(...escpos.boldOff);
  push(...escpos.alignLeft);
  push(...escpos.feed(3));
  push(...escpos.cutPartial);
  return new Uint8Array(parts);
}

interface PrintServer {
  connect: () => Promise<void>;
  send: (bytes: Uint8Array) => Promise<void>;
  disconnect: () => void;
}

function createPrintServer(): PrintServer {
  let characteristic: BluetoothGATTCharacteristic | null = null;
  let device: BluetoothDevice | null = null;

  async function findWritableCharacteristic(server: BluetoothGATTServer): Promise<BluetoothGATTCharacteristic | null> {
    const services = await server.getPrimaryServices();
    for (const service of services) {
      const chars = await service.getCharacteristics();
      for (const ch of chars) {
        const props = (ch.properties || {}) as Record<string, boolean>;
        if (props.write || props.writeWithoutResponse) return ch;
      }
    }
    return null;
  }

  async function connect() {
    if (!('bluetooth' in navigator)) {
      throw new Error('Web Bluetooth tidak tersedia. Gunakan Chrome/Edge di desktop.');
    }
    const bt = (navigator as NavigatorWithBluetooth).bluetooth;
    device = await bt.requestDevice({ acceptAllDevices: true });
    if (!device?.gatt) {
      throw new Error('Perangkat tidak mendukung GATT.');
    }
    const server = await device.gatt.connect();
    characteristic = await findWritableCharacteristic(server);
    if (!characteristic) {
      throw new Error('Tidak menemukan karakteristik yang bisa ditulis pada printer.');
    }
  }

  async function send(bytes: Uint8Array) {
    if (!characteristic) throw new Error('Printer belum terhubung.');
    const chunk = 512;
    for (let i = 0; i < bytes.length; i += chunk) {
      const slice = bytes.subarray(i, i + chunk);
      await characteristic.writeValue(slice);
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  function disconnect() {
    if (device?.gatt?.connected) {
      try { device.gatt.disconnect(); } catch { /* ignore */ }
    }
    characteristic = null;
  }

  return { connect, send, disconnect };
}

/** True when the browser supports Web Bluetooth. */
export function isWebBluetoothSupported(): boolean {
  return typeof window !== 'undefined' && 'bluetooth' in navigator;
}

/**
 * Print a batch label to an ESC/POS 80mm thermal printer over Web Bluetooth.
 * Falls back to browser print dialog when Bluetooth isn't available.
 */
export async function printLabelViaBluetooth(data: LabelData): Promise<void> {
  const server = createPrintServer();
  await server.connect();
  try {
    await server.send(buildLabelBytes(data));
  } finally {
    server.disconnect();
  }
}

export function buildBrowserPrintHtml(data: LabelData, qrUrl: string, labelWidthPx: number): string {
  return `<!doctype html><html><head><title>Cetak Label</title><style>
    body{font-family:monospace;margin:0;padding:16px;}
    .label{width:${labelWidthPx}px;border:2px solid #000;padding:16px;text-align:center;}
    .qr{width:${Math.round(labelWidthPx * 0.5)}px;height:${Math.round(labelWidthPx * 0.5)}px;margin:0 auto 8px;}
    .qr img{width:100%;height:100%;image-rendering:pixelated;}
    .name{font-size:12px;margin-bottom:6px;word-break:break-word;}
    .b{font-size:${Math.round(labelWidthPx * 0.11)}px;font-weight:bold;letter-spacing:2px;margin:4px 0;}
    .s{font-size:11px;word-break:break-all;margin-top:4px;}
    .qty{font-size:12px;margin-top:6px;}
    .exp{font-size:14px;font-weight:bold;margin-top:6px;}
    @media print{body{padding:8px}}
  </style></head><body>
    <div class="label">
      <div class="qr"><img src="${qrUrl}" alt="QR"/></div>
      ${data.productName ? `<div class="name">${escapeHtml(data.productName)}</div>` : ''}
      <div class="b">${escapeHtml(data.batchNumber)}</div>
      <div class="s">${escapeHtml(data.barcodeLabel)}</div>
      ${data.qty ? `<div class="qty">Qty: ${escapeHtml(String(data.qty))}${data.unit ? ' ' + escapeHtml(data.unit) : ''}</div>` : ''}
      ${data.expiredDate ? `<div class="exp">EXP: ${escapeHtml(data.expiredDate)}</div>` : ''}
    </div>
    <script>window.onload=function(){window.print();};<\/script>
  </body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
