/**
 * CSP dengan nonce per-request. Nonce disisipkan Next.js ke script hydration
 * karena header Content-Security-Policy juga dikirim pada request header
 * (lihat src/proxy.ts). Produksi tidak lagi memakai 'unsafe-inline' untuk
 * script; style tetap 'unsafe-inline' karena Next/Tailwind menghasilkan style
 * inline dan bukan vektor eksekusi script.
 */
export function buildContentSecurityPolicy(nonce: string, isProduction: boolean): string {
  const scriptSrc = isProduction
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`
    : `script-src 'self' 'unsafe-inline' 'unsafe-eval' 'nonce-${nonce}'`;

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    // Cetak label batch memuat PDF dari `blob:` ke dalam <iframe> tersembunyi
    // lalu memanggil contentWindow.print().
    "frame-src 'self' blob:",
    "form-action 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    scriptSrc,
    "connect-src 'self'",
  ].join('; ');
}
