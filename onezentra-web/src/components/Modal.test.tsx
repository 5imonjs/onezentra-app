import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Modal from './Modal';

describe('Modal', () => {
  it('tidak merender apa pun saat open=false', () => {
    render(
      <Modal open={false} onClose={() => {}} title="Judul">
        <p>isi</p>
      </Modal>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('merender judul dengan aria-labelledby yang menunjuk ke elemen judul', () => {
    render(
      <Modal open onClose={() => {}} title="Judul Modal" subtitle="Subjudul">
        <p>isi</p>
      </Modal>,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const labelledby = dialog.getAttribute('aria-labelledby');
    expect(labelledby).toBeTruthy();
    expect(screen.getByText('Judul Modal')).toHaveAttribute('id', labelledby as string);
  });

  it('regresi: id dialog tetap stabil setelah re-render (dulu memakai Math.random())', () => {
    const { rerender } = render(
      <Modal open onClose={() => {}} title="Judul">
        <p>isi awal</p>
      </Modal>,
    );

    const idSebelum = screen.getByRole('dialog').getAttribute('aria-labelledby');
    rerender(
      <Modal open onClose={() => {}} title="Judul">
        <p>isi berubah</p>
      </Modal>,
    );

    expect(screen.getByRole('dialog').getAttribute('aria-labelledby')).toBe(idSebelum);
  });

  it('menutup modal lewat tombol Escape', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Judul">
        <p>isi</p>
      </Modal>,
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('klik backdrop menutup modal, klik konten di dalam tidak', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Judul">
        <p data-testid="konten">isi</p>
      </Modal>,
    );

    fireEvent.click(screen.getByTestId('konten'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('presentation'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('merender footer bila disediakan', () => {
    render(
      <Modal open onClose={() => {}} title="Judul" footer={<button type="button">Simpan</button>}>
        <p>isi</p>
      </Modal>,
    );

    expect(screen.getByRole('button', { name: 'Simpan' })).toBeInTheDocument();
    cleanup();
  });
});
