@extends('layouts.email', ['headerBg' => '#0f172a', 'headerSubColor' => '#e2e8f0'])

@section('title', 'Proses Bongkar Selesai')

@section('content')
    <p>Halo,<br><br>Proses receiving / bongkar untuk No. PO Transporter <strong>{{ $rencanaKirim->po_transporter ?? '-' }}</strong> telah <strong style="color: #15803d;">selesai</strong> pada <strong>{{ optional($receiving->actual_end_time)->format('d-m-Y H:i') ?? '-' }}</strong>. Seluruh barang telah diterima.</p>

    <table style="width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 14px;">
        <tr>
            <td style="padding: 6px 0; color: #475569; width: 160px;">Tanggal RKH</td>
            <td style="padding: 6px 0; font-weight: 600;">{{ optional($rencanaKirim->rkh_date)->format('d-m-Y') ?? '-' }}</td>
        </tr>
        <tr>
            <td style="padding: 6px 0; color: #475569;">No. PO Transporter</td>
            <td style="padding: 6px 0; font-weight: 600;">{{ $rencanaKirim->po_transporter ?? '-' }}</td>
        </tr>
        <tr>
            <td style="padding: 6px 0; color: #475569;">Driver / Nopol</td>
            <td style="padding: 6px 0; font-weight: 600;">{{ $rencanaKirim->driver_name ?? '-' }} / {{ $rencanaKirim->nopol ?? '-' }}</td>
        </tr>
        <tr>
            <td style="padding: 6px 0; color: #475569;">Tujuan</td>
            <td style="padding: 6px 0; font-weight: 600;">{{ $rencanaKirim->destination_name ?? '-' }}</td>
        </tr>
        <tr>
            <td style="padding: 6px 0; color: #475569;">Qty Diterima</td>
            <td style="padding: 6px 0; font-weight: 600;">{{ $receiving->total_received_qty ?? 0 }} / {{ $receiving->total_expected_qty ?? 0 }}</td>
        </tr>
    </table>

    @if(($items ?? null) && count($items) > 0)
        <h3 style="margin: 20px 0 8px; font-size: 14px;">Detail Item Diterima</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <tr style="background: #f1f5f9;">
                <th style="padding: 8px; text-align: left; border: 1px solid #cbd5e1;">No</th>
                <th style="padding: 8px; text-align: left; border: 1px solid #cbd5e1;">Kode</th>
                <th style="padding: 8px; text-align: left; border: 1px solid #cbd5e1;">Nama Barang</th>
                <th style="padding: 8px; text-align: right; border: 1px solid #cbd5e1;">Qty</th>
                <th style="padding: 8px; text-align: left; border: 1px solid #cbd5e1;">Satuan</th>
                <th style="padding: 8px; text-align: left; border: 1px solid #cbd5e1;">Kondisi</th>
            </tr>
            @foreach($items as $i => $item)
            <tr>
                <td style="padding: 8px; border: 1px solid #cbd5e1;">{{ $i + 1 }}</td>
                <td style="padding: 8px; border: 1px solid #cbd5e1;">{{ $item->kode_barang }}</td>
                <td style="padding: 8px; border: 1px solid #cbd5e1;">{{ $item->nama_barang }}</td>
                <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">{{ $item->actual_qty }}</td>
                <td style="padding: 8px; border: 1px solid #cbd5e1;">{{ $item->satuan }}</td>
                <td style="padding: 8px; border: 1px solid #cbd5e1;">{{ $item->condition }}</td>
            </tr>
            @endforeach
        </table>
    @endif
@endsection
