import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EmailRecipientsPage from './page';

const { hasPermission, list, create, update, remove, options } = vi.hoisted(() => ({
  hasPermission: vi.fn(() => true),
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  options: vi.fn(),
}));

vi.mock('@/app/dashboard/layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({ hasPermission }),
}));

vi.mock('@/lib/api', () => ({
  emailRecipients: { list, create, update, delete: remove, options },
  getErrorMessage: (_e: unknown, fallback: string) => fallback,
}));

const optionsPayload = {
  document_types: ['rencana_kirim', 'standarisasi_tumpukan'],
  triggers: ['created', 'submitted'],
  document_type_triggers: {
    rencana_kirim: ['created', 'cancelled'],
    standarisasi_tumpukan: ['submitted', 'approved', 'rejected'],
  },
  fields: ['TO', 'CC'],
  users: [],
  roles: [
    { id: 1, name: 'BLC', slug: 'blc' },
    { id: 2, name: 'RFAH', slug: 'rfah' },
  ],
  depots: [{ kode_depo: 'JKT01', nama_depo: 'Jakarta' }],
};

const baseRecipient = {
  document_type: 'rencana_kirim',
  trigger: 'created',
  recipient_type: 'role',
  role_slug: 'blc',
  email: '',
  user_id: null,
  label: '',
  is_active: true,
  resolved_count: 2,
  user: undefined,
};

/** Bangun respons ber-paginasi ala server, dengan ringkasan dihitung otomatis. */
const listResponse = (rows: Array<Record<string, unknown>>, meta: Record<string, unknown> = {}) => {
  const broken = rows.filter((r) => r.is_active !== false && ((r.resolved_count as number) ?? 1) <= 0);
  return {
    data: {
      data: rows,
      meta: {
        group: 'depo', page: 1, per_page_groups: 8, last_page: 1,
        total_groups: rows.length, total_rows: rows.length,
        has_prev: false, has_next: false, ...meta,
      },
      summary: {
        total: rows.length,
        to: rows.filter((r) => r.field === 'TO').length,
        cc: rows.filter((r) => r.field === 'CC').length,
        ok: rows.length - broken.length,
        broken: broken.length,
        broken_sample: broken.slice(0, 5),
      },
    },
  };
};

describe('EmailRecipientsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasPermission.mockReturnValue(true);
    options.mockResolvedValue({ data: optionsPayload });
    list.mockResolvedValue(listResponse([]));
    create.mockResolvedValue({ data: { data: {} } });
    update.mockResolvedValue({ data: { data: {} } });
    remove.mockResolvedValue({ data: {} });
  });

  afterEach(() => {
    cleanup();
  });

  it('mengelompokkan penerima per depo dengan kolom TO dan CC terpisah', async () => {
    list.mockResolvedValue(listResponse([
      { ...baseRecipient, id: 1, kode_depo: 'JKT01', field: 'TO' },
      { ...baseRecipient, id: 2, kode_depo: null, field: 'CC', recipient_type: 'email', email: 'cc@ext.com', role_slug: null, resolved_count: 1 },
    ]));

    render(<EmailRecipientsPage />);

    expect(await screen.findByText('Global (Semua Depo)')).toBeInTheDocument();
    // muncul di header seksi depo (dan juga di opsi dropdown filter)
    expect(screen.getAllByText('JKT01 — Jakarta').length).toBeGreaterThan(0);
    // kolom TO/CC per depo masing-masing punya tombol tambah tersendiri
    expect(screen.getByRole('button', { name: 'Tambah penerima TO untuk JKT01 — Jakarta' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tambah penerima CC untuk Global (Semua Depo)' })).toBeInTheDocument();
    expect(screen.getByText('Role: BLC')).toBeInTheDocument();
    expect(screen.getByText('cc@ext.com')).toBeInTheDocument();
  });

  it('menandai penerima role tanpa user aktif sebagai "Tak terkirim" beserta alert audit', async () => {
    list.mockResolvedValue(listResponse([
      { ...baseRecipient, id: 9, kode_depo: 'JKT01', field: 'TO', role_slug: 'ghost', resolved_count: 0 },
    ]));

    render(<EmailRecipientsPage />);

    expect(await screen.findByText('1 penerima tidak akan terkirim')).toBeInTheDocument();
    expect(screen.getByText('Tak terkirim')).toBeInTheDocument();
  });

  it('tombol Tambah CC inline mengunci depo & field lalu menyimpan payload yang benar', async () => {
    list.mockResolvedValue(listResponse([{ ...baseRecipient, id: 1, kode_depo: 'JKT01', field: 'TO' }]));

    render(<EmailRecipientsPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Tambah penerima CC untuk JKT01 — Jakarta' }));

    expect(await screen.findByRole('heading', { name: 'Tambah Penerima CC' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Role (semua anggota)'), { target: { value: 'rfah' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));

    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({
      field: 'CC',
      kode_depo: 'JKT01',
      recipient_type: 'role',
      role_slug: 'rfah',
    })));
  });

  it('tombol Tambah Penerima generik mewarisi fokus depo yang aktif', async () => {
    list.mockResolvedValue(listResponse([{ ...baseRecipient, id: 1, kode_depo: 'JKT01', field: 'TO' }]));

    render(<EmailRecipientsPage />);

    fireEvent.change(await screen.findByLabelText('Fokus depo'), { target: { value: 'JKT01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tambah Penerima' }));

    expect(await screen.findByRole('heading', { name: 'Tambah Penerima TO' })).toBeInTheDocument();
    expect(screen.getByLabelText('Depo')).toHaveValue('JKT01');
  });

  it('menampilkan kontrol paginasi per-depo dan memuat halaman berikutnya', async () => {
    list.mockImplementation((params: { page?: number } = {}) => {
      const requested = params.page ?? 1;
      return Promise.resolve(listResponse(
        [{ ...baseRecipient, id: 1, kode_depo: 'JKT01', field: 'TO' }],
        {
          page: requested,
          last_page: 3,
          total_groups: 20,
          total_rows: 40,
          has_prev: requested > 1,
          has_next: requested < 3,
        },
      ));
    });

    render(<EmailRecipientsPage />);

    expect(await screen.findByRole('button', { name: 'Berikutnya' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Berikutnya' }));

    await waitFor(() => expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, per_page_groups: 8 })));
  });

  it('menyelaraskan halaman dengan meta server saat halaman di-clamp', async () => {
    // Server selalu meng-clamp ke halaman 1 (mis. data menyusut), walau klien
    // meminta halaman 2.
    list.mockImplementation(() => Promise.resolve(listResponse(
      [{ ...baseRecipient, id: 1, kode_depo: 'JKT01', field: 'TO' }],
      { page: 1, last_page: 2, total_groups: 2, total_rows: 2, has_prev: false, has_next: true },
    )));

    render(<EmailRecipientsPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Berikutnya' }));

    // Permintaan halaman 2 terkirim, lalu state diselaraskan kembali ke 1.
    await waitFor(() => expect(list).toHaveBeenCalledWith(expect.objectContaining({ page: 2 })));
    await waitFor(() => expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 })));
  });

  it('mengurutkan depo mengikuti urutan code-unit server (strcmp), bukan locale', async () => {
    options.mockResolvedValue({ data: { ...optionsPayload, depots: [] } });
    list.mockResolvedValue(listResponse([
      { ...baseRecipient, id: 1, kode_depo: 'jkt01', field: 'TO' },
      { ...baseRecipient, id: 2, kode_depo: 'JKT01', field: 'TO' },
    ]));

    render(<EmailRecipientsPage />);

    const headers = await screen.findAllByText(/^(JKT01|jkt01)$/);
    expect(headers.map((h) => h.textContent)).toEqual(['JKT01', 'jkt01']);
  });

  it('menampilkan trigger "Standarisasi Tumpukan diajukan" (submitted) dari opsi backend', async () => {
    list.mockResolvedValue(listResponse([{ ...baseRecipient, id: 1, kode_depo: 'JKT01', field: 'TO' }]));

    render(<EmailRecipientsPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Tambah Penerima' }));
    await screen.findByRole('heading', { name: 'Tambah Penerima TO' });

    fireEvent.change(screen.getByLabelText('Jenis Dokumen'), { target: { value: 'standarisasi_tumpukan' } });

    const trigger = screen.getByLabelText('Trigger') as HTMLSelectElement;
    expect(Array.from(trigger.options).map((o) => o.value)).toEqual(['submitted', 'approved', 'rejected']);
    expect(screen.getByRole('option', { name: 'Standarisasi Tumpukan diajukan' })).toBeInTheDocument();
  });

  it('mengirim filter & pencarian ke server (bukan menyaring di klien)', async () => {
    list.mockResolvedValue(listResponse([]));

    render(<EmailRecipientsPage />);

    fireEvent.change(await screen.findByLabelText('Filter jenis dokumen'), { target: { value: 'rencana_kirim' } });
    await waitFor(() => expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ document_type: 'rencana_kirim', page: 1 })));

    fireEvent.change(screen.getByLabelText('Fokus depo'), { target: { value: 'JKT01' } });
    await waitFor(() => expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ kode_depo: 'JKT01', page: 1 })));
  });
});
