import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EmailSettingsPage from './page';

const { hasPermission, get, update, sendTest, notificationLogs } = vi.hoisted(() => ({
  hasPermission: vi.fn((_permission: string): boolean => true),
  get: vi.fn(),
  update: vi.fn(),
  sendTest: vi.fn(),
  notificationLogs: vi.fn(),
}));

vi.mock('@/app/dashboard/layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({ hasPermission }),
}));

vi.mock('@/lib/api', () => ({
  emailSettings: { get, update, test: sendTest, notificationLogs },
  getErrorMessage: (_e: unknown, fallback: string) => fallback,
}));

vi.mock('@/lib/dates', () => ({ formatDateId: (value: string) => value }));

const settingPayload = {
  mailer: 'smtp',
  host: 'smtp.example.com',
  port: 587,
  username: 'notif@example.com',
  encryption: 'tls',
  from_address: 'notif@example.com',
  from_name: 'ONEZENTRA',
  from_system_env: false,
  is_active: true,
};

const logEntry = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  document_type: 'receiving',
  trigger: 'completed',
  context_id: 5,
  recipients: null,
  status: 'failed',
  error: null,
  created_at: '2026-10-01T00:00:00Z',
  ...overrides,
});

describe('EmailSettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasPermission.mockReturnValue(true);
    get.mockResolvedValue({ data: { data: settingPayload } });
    update.mockResolvedValue({ data: { data: {} } });
    sendTest.mockResolvedValue({ data: { message: 'Email test terkirim' } });
    notificationLogs.mockResolvedValue({ data: { data: { data: [] } } });
  });

  afterEach(() => {
    cleanup();
  });

  it('memuat setting dan tidak menaruh password pada field', async () => {
    render(<EmailSettingsPage />);

    expect(await screen.findByLabelText('Host')).toHaveValue('smtp.example.com');
    // Backend hanya mengirim penanda password; DOM tidak boleh di-prefill.
    expect(screen.getByLabelText('Password')).toHaveValue('');
  });

  it('menyimpan tanpa menyertakan password bila field dikosongkan', async () => {
    render(<EmailSettingsPage />);

    fireEvent.change(await screen.findByLabelText('Host'), { target: { value: 'smtp.baru.example' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan Setting' }));

    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ host: 'smtp.baru.example' }));
    expect(update.mock.calls[0][0]).not.toHaveProperty('password');
  });

  it('menyertakan password bila diisi', async () => {
    render(<EmailSettingsPage />);

    await screen.findByLabelText('Host');
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'rahasia-baru' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan Setting' }));

    await waitFor(() => expect(update).toHaveBeenCalledWith(expect.objectContaining({ password: 'rahasia-baru' })));
  });

  it('mengirim email test ke alamat yang diisi lalu menampilkan pesan sukses', async () => {
    render(<EmailSettingsPage />);

    fireEvent.change(await screen.findByLabelText('Alamat Email Test'), { target: { value: 'uji@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kirim Test Email' }));

    await waitFor(() => expect(sendTest).toHaveBeenCalledWith('uji@example.com'));
    expect(await screen.findByText('Email test terkirim')).toBeInTheDocument();
  });

  it('menonaktifkan seluruh kontrol dan menyembunyikan tombol simpan tanpa emails.edit', async () => {
    hasPermission.mockImplementation((permission: string) => permission === 'emails.view');

    render(<EmailSettingsPage />);

    expect(await screen.findByLabelText('Host')).toBeDisabled();
    expect(screen.getByLabelText('Alamat Email Test')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Simpan Setting' })).not.toBeInTheDocument();
  });

  it('menampilkan pesan izin dan tidak memanggil API tanpa emails.view', async () => {
    hasPermission.mockReturnValue(false);

    render(<EmailSettingsPage />);

    expect(await screen.findByText('Anda tidak memiliki izin untuk melihat Setting Email.')).toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
  });

  it('menyembunyikan panel log saat tidak ada catatan maupun filter', async () => {
    render(<EmailSettingsPage />);

    await screen.findByLabelText('Host');
    await waitFor(() => expect(notificationLogs).toHaveBeenCalled());
    expect(screen.queryByText('Notifikasi Gagal / Terlewat')).not.toBeInTheDocument();
  });

  it('menampilkan catatan gagal beserta jenis dokumen, trigger, dan pesan galat', async () => {
    notificationLogs.mockResolvedValue({
      data: { data: { data: [logEntry({ status: 'failed', error: 'SMTP down' })] } },
    });

    render(<EmailSettingsPage />);

    expect(await screen.findByText('Notifikasi Gagal / Terlewat')).toBeInTheDocument();
    expect(screen.getByText('receiving · completed')).toBeInTheDocument();
    expect(screen.getByText('SMTP down')).toBeInTheDocument();
  });

  it('memuat ulang log dengan parameter status saat filter diubah', async () => {
    notificationLogs.mockResolvedValue({
      data: { data: { data: [logEntry({ status: 'skipped', error: null })] } },
    });

    render(<EmailSettingsPage />);

    fireEvent.change(await screen.findByLabelText('Filter status log'), { target: { value: 'failed' } });

    await waitFor(() => expect(notificationLogs).toHaveBeenLastCalledWith({ status: 'failed' }));
  });

  it('menampilkan galat panel log dan memuat ulang lewat tombol coba lagi', async () => {
    notificationLogs.mockRejectedValueOnce(new Error('boom'));

    render(<EmailSettingsPage />);

    expect(await screen.findByText('Gagal memuat log notifikasi.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));

    await waitFor(() => expect(notificationLogs).toHaveBeenCalledTimes(2));
  });
});
