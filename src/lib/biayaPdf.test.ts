import { describe, expect, it } from 'vitest';

import { actedNameFor, auditDates, formatSuratJalan, MANIFEST_COL_WIDTHS, PDF_PAGE_WIDTH, stampFor, SUMMARY_COL_WIDTHS, THL_COL_WIDTHS, type ApprovalSection, type RetribusiData } from './biayaPdf';

describe('formatSuratJalan', () => {
  it('renders primary and additional surat jalan in one cell', () => {
    expect(formatSuratJalan({
      no_surat_jalan: '11111',
      kendaraan_sj: '0127-26-0000-TES',
    })).toBe('11111, 0127-26-0000-TES');
  });

  it('splits list values and removes duplicate or empty values', () => {
    expect(formatSuratJalan({
      no_surat_jalan: '11111, 22222',
      kendaraan_sj: '22222;33333',
    })).toBe('11111, 22222, 33333');
  });

  it('uses a placeholder when no surat jalan exists', () => {
    expect(formatSuratJalan({})).toBe('-');
  });

  it('merges SJ from kendaraan array with primary and legacy', () => {
    expect(formatSuratJalan({
      no_surat_jalan: 'SJ-G1',
      kendaraan_sj: 'SJ-G2',
      kendaraan: [{ sj: 'SJ-G3' }, { sj: 'SJ-G1' }, { sj: '' }],
    })).toBe('SJ-G1, SJ-G2, SJ-G3');
  });
});

describe('pdf table widths', () => {
  const sum = (widths: number[]) => widths.reduce((a, b) => a + b, 0);

  it('tabel atas, tabel THL, dan manifest sama panjang dengan lebar halaman', () => {
    expect(sum(SUMMARY_COL_WIDTHS)).toBe(PDF_PAGE_WIDTH);
    expect(sum(THL_COL_WIDTHS)).toBe(PDF_PAGE_WIDTH);
    expect(sum(MANIFEST_COL_WIDTHS)).toBe(PDF_PAGE_WIDTH);
  });
});

const section = (title: string): ApprovalSection => ({ title, people: [{ name: '-', role: title }] });

const makeData = (overrides: Partial<RetribusiData> = {}): RetribusiData => ({
  tanggal_pengajuan: '2026-09-24',
  kode_depo: 'SKW',
  nama_depo: 'Singkawang',
  nominal_biaya: 1025000,
  is_rfah_required: true,
  rfah_name: 'Umi Marzuqoh',
  status: 'revisi',
  submitted_at: '2026-09-24 10:00:00',
  checked_at: null,
  rlh_approved_at: null,
  approved_at: null,
  rejected_at: null,
  revised_at: '2026-09-24 11:00:00',
  revisedBy: { full_name: 'Bac User', level: 'BAC' },
  details: [],
  documents: [],
  ...overrides,
});

describe('stampFor — cap REVISI/DITOLAK mengikuti peran pelaku aksinya', () => {
  it('revisi oleh BAC → cap REVISI di kotak Mengetahui, bukan di Menyetujui/RFAH*', () => {
    const data = makeData();
    const dates = auditDates(data);
    expect(stampFor(section('Mengetahui'), data, dates)?.text).toBe('REVISI');
    expect(stampFor(section('Menyetujui'), data, dates)).toBeNull();
    expect(stampFor(section('RFAH*'), data, dates)).toBeNull();
  });

  it('revisi oleh RLH → cap REVISI di kotak Menyetujui', () => {
    const data = makeData({ revisedBy: { full_name: 'Rlh User', level: 'RLH' } });
    const dates = auditDates(data);
    expect(stampFor(section('Menyetujui'), data, dates)?.text).toBe('REVISI');
    expect(stampFor(section('Mengetahui'), data, dates)).toBeNull();
  });

  it('revisi oleh RFAH → cap REVISI di kotak RFAH*, DISETUJUI RLH tetap tercatat di Menyetujui', () => {
    const data = makeData({
      revisedBy: { full_name: 'Rfah User', level: 'RFAH' },
      checked_at: '2026-09-24 10:30:00',
      rlh_approved_at: '2026-09-24 10:45:00',
    });
    const dates = auditDates(data);
    expect(stampFor(section('RFAH*'), data, dates)?.text).toBe('REVISI');
    expect(stampFor(section('Mengetahui'), data, dates)?.text).toBe('DIPERIKSA');
    expect(stampFor(section('Menyetujui'), data, dates)?.text).toBe('DISETUJUI RLH');
  });

  it('revisi tanpa level (data lama) → fallback ke kotak Menyetujui', () => {
    const data = makeData({ revisedBy: { full_name: 'User Lama' } });
    const dates = auditDates(data);
    expect(stampFor(section('Menyetujui'), data, dates)?.text).toBe('REVISI');
  });

  it('ditolak oleh RFAH → cap DITOLAK di kotak RFAH*, DISETUJUI RLH tetap tercatat di Menyetujui', () => {
    const data = makeData({
      status: 'rejected',
      rejected_at: '2026-09-24 11:00:00',
      rejectedBy: { full_name: 'Rfah User', level: 'RFAH' },
      checked_at: '2026-09-24 10:30:00',
      rlh_approved_at: '2026-09-24 10:45:00',
      revised_at: null,
      revisedBy: null,
    });
    const dates = auditDates(data);
    expect(stampFor(section('RFAH*'), data, dates)?.text).toBe('DITOLAK');
    expect(stampFor(section('Menyetujui'), data, dates)?.text).toBe('DISETUJUI RLH');
  });

  it('ditolak oleh RLH → cap DITOLAK di kotak Menyetujui', () => {
    const data = makeData({
      status: 'rejected',
      rejected_at: '2026-09-24 11:00:00',
      rejectedBy: { full_name: 'Rlh User', level: 'RLH' },
      revised_at: null,
      revisedBy: null,
    });
    const dates = auditDates(data);
    expect(stampFor(section('Menyetujui'), data, dates)?.text).toBe('DITOLAK');
    expect(stampFor(section('Mengetahui'), data, dates)).toBeNull();
  });

  it('ditolak oleh BAC → cap DITOLAK di kotak Mengetahui', () => {
    const data = makeData({
      status: 'rejected',
      rejected_at: '2026-09-24 11:00:00',
      rejectedBy: { full_name: 'Bac User', level: 'BAC' },
      revised_at: null,
      revisedBy: null,
    });
    const dates = auditDates(data);
    expect(stampFor(section('Mengetahui'), data, dates)?.text).toBe('DITOLAK');
    expect(stampFor(section('Menyetujui'), data, dates)).toBeNull();
  });

  it('rlh_approved → DISETUJUI RLH di kotak Menyetujui', () => {
    const data = makeData({
      status: 'rlh_approved',
      checked_at: '2026-09-24 10:30:00',
      rlh_approved_at: '2026-09-24 10:45:00',
      revised_at: null,
      revisedBy: null,
    });
    const dates = auditDates(data);
    expect(stampFor(section('Menyetujui'), data, dates)?.text).toBe('DISETUJUI RLH');
  });

  it('approved + wajib RFAH → DISETUJUI RLH + DISETUJUI RFAH', () => {
    const data = makeData({
      status: 'approved',
      approved_at: '2026-09-24 12:00:00',
      approvedBy: { full_name: 'Rfah User' },
      checked_at: '2026-09-24 10:30:00',
      rlh_approved_at: '2026-09-24 11:00:00',
      revised_at: null,
      revisedBy: null,
    });
    const dates = auditDates(data);
    expect(stampFor(section('Menyetujui'), data, dates)?.text).toBe('DISETUJUI RLH');
    expect(stampFor(section('RFAH*'), data, dates)?.text).toBe('DISETUJUI RFAH');
  });

  it('PENGAJUAN hanya untuk yang sudah dikirim; draft tanpa cap; DIPERIKSA saat checked', () => {
    const draft = makeData({ status: 'draft', submitted_at: null, revised_at: null, revisedBy: null });
    expect(stampFor(section('Mengajukan'), draft, auditDates(draft))).toBeNull();

    const checked = makeData({ status: 'checked', checked_at: '2026-09-24 10:30:00', revised_at: null, revisedBy: null });
    const dates = auditDates(checked);
    expect(stampFor(section('Mengajukan'), checked, dates)?.text).toBe('PENGAJUAN');
    expect(stampFor(section('Mengetahui'), checked, dates)?.text).toBe('DIPERIKSA');
  });
});

const box = (title: string, assignee: string): ApprovalSection => ({ title, people: [{ name: assignee, role: title }] });

describe('actedNameFor — nama mengikuti peran pelaku aksinya (paritas cap)', () => {
  it('revisi oleh RFAH → nama RFAH di kotak RFAH*, kotak Menyetujui tetap nama RLH', () => {
    const data = makeData({
      revisedBy: { full_name: 'Rfah Reviser', level: 'RFAH' },
      checked_at: '2026-09-24 10:30:00',
      rlh_approved_at: '2026-09-24 10:45:00',
    });
    const dates = auditDates(data);
    expect(actedNameFor(box('RFAH*', 'Rfah Assignee'), data, dates)).toBe('Rfah Reviser');
    expect(actedNameFor(box('Menyetujui', 'Rlh Assignee'), data, dates)).toBe('Rlh Assignee');
    expect(actedNameFor(box('Mengetahui', 'Bac Assignee'), data, dates)).toBe('Bac Assignee');
  });

  it('revisi oleh BAC → nama BAC di kotak Mengetahui, bukan Menyetujui', () => {
    const data = makeData();
    const dates = auditDates(data);
    expect(actedNameFor(box('Mengetahui', 'Bac Assignee'), data, dates)).toBe('Bac User');
    expect(actedNameFor(box('Menyetujui', 'Rlh Assignee'), data, dates)).toBe('Rlh Assignee');
    expect(actedNameFor(box('RFAH*', 'Rfah Assignee'), data, dates)).toBe('Rfah Assignee');
  });

  it('revisi oleh RLH → nama RLH tetap di kotak Menyetujui', () => {
    const data = makeData({ revisedBy: { full_name: 'Rlh Reviser', level: 'RLH' } });
    const dates = auditDates(data);
    expect(actedNameFor(box('Menyetujui', 'Rlh Assignee'), data, dates)).toBe('Rlh Reviser');
    expect(actedNameFor(box('Mengetahui', 'Bac Assignee'), data, dates)).toBe('Bac Assignee');
  });

  it('ditolak oleh RFAH → nama RFAH di kotak RFAH*, Menyetujui menampilkan assignee', () => {
    const data = makeData({
      status: 'rejected',
      rejected_at: '2026-09-24 11:00:00',
      rejectedBy: { full_name: 'Rfah Rejector', level: 'RFAH' },
      checked_at: '2026-09-24 10:30:00',
      rlh_approved_at: '2026-09-24 10:45:00',
      revised_at: null,
      revisedBy: null,
    });
    const dates = auditDates(data);
    expect(actedNameFor(box('RFAH*', 'Rfah Assignee'), data, dates)).toBe('Rfah Rejector');
    expect(actedNameFor(box('Menyetujui', 'Rlh Assignee'), data, dates)).toBe('Rlh Assignee');
  });

  it('approved + wajib RFAH → Menyetujui nama RLH, RFAH* nama penyetuju akhir', () => {
    const data = makeData({
      status: 'approved',
      approved_at: '2026-09-24 12:00:00',
      approvedBy: { full_name: 'Rfah Final' },
      rlhApprovedBy: { full_name: 'Rlh Approver' },
      checked_at: '2026-09-24 10:30:00',
      rlh_approved_at: '2026-09-24 11:00:00',
      revised_at: null,
      revisedBy: null,
    });
    const dates = auditDates(data);
    expect(actedNameFor(box('Menyetujui', 'Rlh Assignee'), data, dates)).toBe('Rlh Approver');
    expect(actedNameFor(box('RFAH*', 'Rfah Assignee'), data, dates)).toBe('Rfah Final');
  });

  it('approved tanpa RFAH → Menyetujui menampilkan approvedBy (RLH langsung)', () => {
    const data = makeData({
      is_rfah_required: false,
      status: 'approved',
      approved_at: '2026-09-24 12:00:00',
      approvedBy: { full_name: 'Rlh Langsung' },
      checked_at: '2026-09-24 10:30:00',
      revised_at: null,
      revisedBy: null,
    });
    const dates = auditDates(data);
    expect(actedNameFor(box('Menyetujui', 'Rlh Assignee'), data, dates)).toBe('Rlh Langsung');
  });

  it('rlh_approved → Menyetujui menampilkan rlhApprovedBy', () => {
    const data = makeData({
      status: 'rlh_approved',
      rlhApprovedBy: { full_name: 'Rlh Approver' },
      checked_at: '2026-09-24 10:30:00',
      rlh_approved_at: '2026-09-24 10:45:00',
      revised_at: null,
      revisedBy: null,
    });
    const dates = auditDates(data);
    expect(actedNameFor(box('Menyetujui', 'Rlh Assignee'), data, dates)).toBe('Rlh Approver');
  });

  it('checked → Mengetahui menampilkan checkedBy', () => {
    const data = makeData({
      status: 'checked',
      checkedBy: { full_name: 'Bac Checker' },
      checked_at: '2026-09-24 10:30:00',
      revised_at: null,
      revisedBy: null,
    });
    const dates = auditDates(data);
    expect(actedNameFor(box('Mengetahui', 'Bac Assignee'), data, dates)).toBe('Bac Checker');
  });
});