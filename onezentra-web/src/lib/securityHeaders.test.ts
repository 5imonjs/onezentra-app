import { describe, expect, it } from 'vitest';
import nextConfig, { buildContentSecurityPolicy } from '../../next.config.mjs';

/**
 * Regresi bug cetak label batch di detail Validasi Dokumen:
 *
 * `printBatchLabel` memuat PDF `blob:` ke <iframe> tersembunyi lalu memanggil
 * `contentWindow.print()`. CSP produksi hanya punya `default-src 'self'` dan
 * TIDAK punya `frame-src`, jadi frame blob jatuh ke fallback default-src,
 * diblokir, dan print() melempar:
 *
 *   Framing 'blob:...' violates ... "default-src 'self'"
 *   Uncaught SecurityError: Blocked a frame ... accessing a cross-origin frame
 *
 * Tes ini menahan konfigurasi agar `frame-src` selalu mengizinkan blob.
 */
describe('Content-Security-Policy', () => {
  async function cspHeader(): Promise<string> {
    const groups = (await nextConfig.headers?.()) ?? [];
    const header = groups
      .flatMap((group) => group.headers)
      .find((entry) => entry.key === 'Content-Security-Policy');

    return header?.value ?? '';
  }

  it('mengizinkan frame blob: agar iframe cetak label bisa dimuat', async () => {
    const csp = await cspHeader();

    expect(csp).toContain('frame-src');
    expect(csp).toMatch(/frame-src[^;]*blob:/);
  });

  it('menghilangkan unsafe-eval pada produksi', () => {
    expect(buildContentSecurityPolicy(true)).not.toContain("'unsafe-eval'");
    expect(buildContentSecurityPolicy(false)).toContain("'unsafe-eval'");
  });
});
