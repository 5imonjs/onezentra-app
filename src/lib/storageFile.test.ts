import { describe, expect, it } from 'vitest';
import { AUTHENTICATED_FILE_REL, storageFileUrl } from './storageFile';

describe('AUTHENTICATED_FILE_REL', () => {
  it('TIDAK boleh memakai noreferrer — itu membuat Sanctum membalas 401', () => {
    // `rel="noreferrer"` memerintahkan browser menghapus header Referer.
    // Sanctum::fromFrontend() butuh Referer/Origin untuk mengaktifkan
    // middleware session; tanpa itu cookie sesi tidak terbaca dan endpoint
    // storage membalas 401 walaupun user sudah login dan file-nya ada.
    expect(AUTHENTICATED_FILE_REL).not.toContain('noreferrer');
  });

  it('tetap memakai noopener untuk proteksi tabnabbing', () => {
    expect(AUTHENTICATED_FILE_REL).toContain('noopener');
  });
});

describe('storageFileUrl', () => {
  it('membangun URL endpoint storage untuk path relatif', () => {
    expect(storageFileUrl('validation-photos/abc.jpg')).toBe('/api/v1/storage/validation-photos/abc.jpg');
  });

  it('meneruskan URL absolut tanpa diubah (S3/CDN)', () => {
    expect(storageFileUrl('https://cdn.example.com/a.jpg')).toBe('https://cdn.example.com/a.jpg');
  });

  it('null untuk path kosong agar pemanggil bisa sembunyikan link', () => {
    expect(storageFileUrl(null)).toBeNull();
    expect(storageFileUrl(undefined)).toBeNull();
    expect(storageFileUrl('')).toBeNull();
  });
});
