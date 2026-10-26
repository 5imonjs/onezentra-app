import { describe, expect, it } from 'vitest';
import { buildContentSecurityPolicy } from './csp';

/**
 * Regresi bug cetak label batch di detail Validasi Dokumen:
 *
 * `printBatchLabel` memuat PDF `blob:` ke <iframe> tersembunyi lalu memanggil
 * `contentWindow.print()`. CSP produksi hanya punya `default-src 'self'` dan
 * TIDAK punya `frame-src`, jadi frame blob jatuh ke fallback default-src,
 * diblokir, dan print() melempar SecurityError.
 *
 * Nonce diuji karena CSP sekarang dikirim per-request oleh proxy; script
 * produksi tidak boleh lagi mengandalkan 'unsafe-inline'.
 */
describe('Content-Security-Policy', () => {
  it('mengizinkan frame blob: agar iframe cetak label bisa dimuat', () => {
    const csp = buildContentSecurityPolicy('nonce-uji', true);

    expect(csp).toContain('frame-src');
    expect(csp).toMatch(/frame-src[^;]*blob:/);
  });

  it('memakai nonce dan menghilangkan unsafe-inline script di produksi', () => {
    const csp = buildContentSecurityPolicy('nonce-uji', true);

    expect(csp).toContain("script-src 'self' 'nonce-nonce-uji' 'strict-dynamic'");
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it('tetap mengizinkan unsafe-eval hanya untuk dev server', () => {
    expect(buildContentSecurityPolicy('nonce-uji', false)).toContain("'unsafe-eval'");
  });
});
