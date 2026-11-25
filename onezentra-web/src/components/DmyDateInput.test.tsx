import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DmyDateInput from './DmyDateInput';

describe('DmyDateInput — format dd/mm/yyyy', () => {
  const onChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(cleanup);

  it('menampilkan nilai ISO sebagai dd/mm/yyyy', () => {
    render(<DmyDateInput id="rkh" value="2026-11-25" onChange={onChange} />);
    expect(screen.getByDisplayValue('25/11/2026')).toBeInTheDocument();
  });

  it('mask angka menjadi dd/mm/yyyy dan mengirim ISO ke induk', () => {
    render(<DmyDateInput id="rkh" value="" onChange={onChange} />);
    const input = screen.getByPlaceholderText('dd/mm/yyyy');

    fireEvent.change(input, { target: { value: '03012027' } });

    expect(input).toHaveValue('03/01/2027');
    expect(onChange).toHaveBeenLastCalledWith('2027-01-03');
  });

  it('menolak tanggal tidak valid', () => {
    render(<DmyDateInput id="rkh" value="" onChange={onChange} />);

    fireEvent.change(screen.getByPlaceholderText('dd/mm/yyyy'), { target: { value: '31/02/2026' } });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('dd/mm/yyyy')).toHaveAttribute('aria-invalid', 'true');
  });

  it('menolak tanggal sebelum min', () => {
    render(<DmyDateInput id="rkh" value="" min="2026-11-25" onChange={onChange} />);

    fireEvent.change(screen.getByPlaceholderText('dd/mm/yyyy'), { target: { value: '24/11/2026' } });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('mengosongkan nilai saat input dikosongkan', () => {
    render(<DmyDateInput id="rkh" value="2026-11-25" onChange={onChange} />);

    fireEvent.change(screen.getByDisplayValue('25/11/2026'), { target: { value: '' } });

    expect(onChange).toHaveBeenCalledWith('');
  });
});
