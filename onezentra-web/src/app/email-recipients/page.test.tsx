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
  document_types: ['rencana_kirim'],
  triggers: ['created'],
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

describe('EmailRecipientsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasPermission.mockReturnValue(true);
    options.mockResolvedValue({ data: optionsPayload });
    list.mockResolvedValue({ data: { data: [] } });
    create.mockResolvedValue({ data: { data: {} } });
    update.mockResolvedValue({ data: { data: {} } });
    remove.mockResolvedValue({ data: {} });
  });

  afterEach(() => {
    cleanup();
  });

  it('mengelompokkan penerima per depo dengan kolom TO dan CC terpisah', async () => {
    list.mockResolvedValue({
      data: {
        data: [
          { ...baseRecipient, id: 1, kode_depo: 'JKT01', field: 'TO' },
          { ...baseRecipient, id: 2, kode_depo: null, field: 'CC', recipient_type: 'email', email: 'cc@ext.com', role_slug: null, resolved_count: 1 },
        ],
      },
    });

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
    list.mockResolvedValue({
      data: {
        data: [{ ...baseRecipient, id: 9, kode_depo: 'JKT01', field: 'TO', role_slug: 'ghost', resolved_count: 0 }],
      },
    });

    render(<EmailRecipientsPage />);

    expect(await screen.findByText('1 penerima tidak akan terkirim')).toBeInTheDocument();
    expect(screen.getByText('Tak terkirim')).toBeInTheDocument();
  });

  it('tombol Tambah CC inline mengunci depo & field lalu menyimpan payload yang benar', async () => {
    list.mockResolvedValue({
      data: { data: [{ ...baseRecipient, id: 1, kode_depo: 'JKT01', field: 'TO' }] },
    });

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
    list.mockResolvedValue({
      data: { data: [{ ...baseRecipient, id: 1, kode_depo: 'JKT01', field: 'TO' }] },
    });

    render(<EmailRecipientsPage />);

    fireEvent.change(await screen.findByLabelText('Fokus depo'), { target: { value: 'JKT01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tambah Penerima' }));

    expect(await screen.findByRole('heading', { name: 'Tambah Penerima TO' })).toBeInTheDocument();
    expect(screen.getByLabelText('Depo')).toHaveValue('JKT01');
  });
});
