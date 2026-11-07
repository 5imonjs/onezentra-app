@extends('layouts.email', ['headerBg' => '#9a3412', 'headerSubColor' => '#ffedd5'])

@section('title', 'Barang di Luar Rencana')

@section('content')
    <p>Halo,<br><br>Checker menemukan <strong>barang yang tidak ada di rencana kirim</strong> saat validasi dokumen berikut. Mohon ditindaklanjuti — rencana tidak diubah oleh sistem.</p>

    <table style="width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 14px;">
        <tr>
            <td style="padding: 6px 0; color: #475569; width: 160px;">No. PO Transporter</td>
            <td style="padding: 6px 0; font-weight: 600;">{{ $rencanaKirim->po_transporter ?? '-' }}</td>
        </tr>
        <tr>
            <td style="padding: 6px 0; color: #475569;">Driver / Nopol</td>
            <td style="padding: 6px 0; font-weight: 600;">{{ $rencanaKirim->driver_name ?? '-' }} / {{ $rencanaKirim->nopol ?? '-' }}</td>
        </tr>
        <tr>
            <td style="padding: 6px 0; color: #475569;">Depo</td>
            <td style="padding: 6px 0; font-weight: 600;">{{ $rencanaKirim->kode_depo ?? '-' }}</td>
        </tr>
    </table>

    <h3 style="margin: 20px 0 8px; font-size: 14px;">Detail Barang Luar Rencana</h3>
    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <tr>
            <td style="padding: 6px; border: 1px solid #cbd5e1; width: 160px; color: #475569;">Kode Barang</td>
            <td style="padding: 6px; border: 1px solid #cbd5e1; font-weight: 600;">{{ $extraItem->kode_barang }}</td>
        </tr>
        <tr>
            <td style="padding: 6px; border: 1px solid #cbd5e1; color: #475569;">Nama Barang</td>
            <td style="padding: 6px; border: 1px solid #cbd5e1; font-weight: 600;">{{ $extraItem->nama_barang }}</td>
        </tr>
        <tr>
            <td style="padding: 6px; border: 1px solid #cbd5e1; color: #475569;">Jumlah</td>
            <td style="padding: 6px; border: 1px solid #cbd5e1;">{{ $extraItem->qty }} {{ $extraItem->satuan }}</td>
        </tr>
        <tr>
            <td style="padding: 6px; border: 1px solid #cbd5e1; color: #475569;">Kondisi</td>
            <td style="padding: 6px; border: 1px solid #cbd5e1;">{{ $extraItem->condition }}</td>
        </tr>
        <tr>
            <td style="padding: 6px; border: 1px solid #cbd5e1; color: #475569;">Expired</td>
            <td style="padding: 6px; border: 1px solid #cbd5e1;">{{ optional($extraItem->expired_date)->format('d-m-Y') ?? '-' }}</td>
        </tr>
        <tr>
            <td style="padding: 6px; border: 1px solid #cbd5e1; color: #475569;">Catatan</td>
            <td style="padding: 6px; border: 1px solid #cbd5e1;">{{ $extraItem->notes ?? '-' }}</td>
        </tr>
        <tr>
            <td style="padding: 6px; border: 1px solid #cbd5e1; color: #475569;">Dicatat oleh</td>
            <td style="padding: 6px; border: 1px solid #cbd5e1;">{{ $extraItem->recorder?->full_name ?? '-' }}</td>
        </tr>
    </table>

    <p style="margin-top: 16px; font-size: 13px;">Bukti foto tersimpan di sistem (dokumen validasi SJ). Keputusan penerimaan barang ini ada di sisi planner — rencana kirim belum diubah.</p>
@endsection
