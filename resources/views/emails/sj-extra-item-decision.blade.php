@extends('layouts.email', [
    'headerBg' => $decision === 'APPROVED' ? '#047857' : '#b91c1c',
    'headerSubColor' => $decision === 'APPROVED' ? '#d1fae5' : '#fecaca',
])

@section('title', 'Barang Luar Rencana ' . ($decision === 'APPROVED' ? 'Disetujui' : 'Ditolak'))

@section('content')
    <p>Halo,<br><br><strong>{{ $extraItem->approver?->full_name ?? 'Planner' }}</strong> telah memutuskan catatan barang di luar rencana berikut sebagai <strong>{{ $decision === 'APPROVED' ? 'DISETUJUI' : 'DITOLAK' }}</strong>.</p>

    <table style="width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px;">
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
            <td style="padding: 6px; border: 1px solid #cbd5e1; color: #475569;">Dicatat oleh</td>
            <td style="padding: 6px; border: 1px solid #cbd5e1;">{{ $extraItem->recorder?->full_name ?? '-' }}</td>
        </tr>
        <tr>
            <td style="padding: 6px; border: 1px solid #cbd5e1; color: #475569;">Diputus oleh</td>
            <td style="padding: 6px; border: 1px solid #cbd5e1;">{{ $extraItem->approver?->full_name ?? '-' }}</td>
        </tr>
        <tr>
            <td style="padding: 6px; border: 1px solid #cbd5e1; color: #475569;">Catatan keputusan</td>
            <td style="padding: 6px; border: 1px solid #cbd5e1;">{{ $extraItem->decision_notes ?? '-' }}</td>
        </tr>
    </table>

    <p style="margin-top: 16px; font-size: 13px;">Rencana kirim tidak diubah oleh sistem — catatan ini murni jejak keputusan penerimaan barang.</p>
@endsection
