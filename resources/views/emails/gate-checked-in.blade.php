@extends('layouts.email', ['headerBg' => '#0f172a', 'headerSubColor' => '#e2e8f0'])

@section('title', 'Check In Gate Selesai')

@section('content')
    <p>Halo,<br><br>Check-in gate untuk No. PO Transporter <strong>{{ $rencanaKirim->po_transporter ?? '-' }}</strong> telah <strong style="color: #15803d;">tercatat</strong> pada <strong>{{ optional($gateTransaction->scan_time)->format('d-m-Y H:i') ?? '-' }}</strong>. Dokumen siap dilanjutkan ke validasi SJ.</p>

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
            <td style="padding: 6px 0; color: #475569;">Depo</td>
            <td style="padding: 6px 0; font-weight: 600;">{{ $rencanaKirim->kode_depo ?? '-' }}</td>
        </tr>
        <tr>
            <td style="padding: 6px 0; color: #475569;">Catatan</td>
            <td style="padding: 6px 0; font-weight: 600;">{{ $gateTransaction->notes ?? '-' }}</td>
        </tr>
    </table>

    <p style="margin-top: 16px; font-size: 13px;">Check-in ini tidak mengubah rencana kirim. Tahapan berikutnya adalah validasi SJ, lalu receiving/bongkar.</p>
@endsection
