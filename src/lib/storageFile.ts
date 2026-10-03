import { API_ROOT } from './api';

/**
 * Rel untuk link file bukti (foto validasi, dokumen biaya).
 *
 * JANGAN tambahkan `noreferrer` di sini. Autentikasi API ini cookie-based
 * Sanctum stateful: `EnsureFrontendRequestsAreStateful::fromFrontend()`
 * memutuskan request dianggap "dari frontend SPA" berdasarkan header
 * `Referer` (fallback `Origin`). Kalau header itu hilang, Sanctum TIDAK
 * menjalankan middleware session, cookie `laravel-session` tidak
 * terbaca, dan endpoint `api/v1/storage/{path}` membalas **401** — meski
 * user sudah login dan file-nya ada. Gejalanya persis seperti dilaporkan:
 * klik "Lihat" → tab baru terbuka tapi menampilkan JSON error, bukan foto.
 *
 * `rel="noreferrer"` justru memerintahkan browser MENGHAPUS header Referer
 * saat navigasi, jadi itu penyebab langsungnya. `noopener` saja tetap aman
 * (menutup `window.opener` / proteksi tabnabbing) dan TIDAK menghapus Referer.
 *
 * Kalau nanti butuh privacy referrer, set header `Referrer-Policy` di
 * `next.config` — jangan pakai `noreferrer` per-link.
 */
export const AUTHENTICATED_FILE_REL = 'noopener';

/** URL absolut file di storage backend, atau apa adanya bila sudah URL penuh. */
export function storageFileUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `${API_ROOT}/storage/${path}`;
}
