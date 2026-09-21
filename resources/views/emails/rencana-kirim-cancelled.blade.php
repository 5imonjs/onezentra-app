<!DOCTYPE html>
<html>
<body style="font-family: Arial, Helvetica, sans-serif; color: #1f2937; line-height: 1.5;">
    <div style="max-width: 640px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
        <div style="background: linear-gradient(to right, #7f1d1d, #b91c1c); padding: 24px; color: #fff;">
            <h1 style="margin: 0; font-size: 20px;">Rencana Kirim Dibatalkan</h1>
            <p style="margin: 4px 0 0; color: #fecaca; font-size: 13px;">ONEZENTRA Warehouse Management</p>
        </div>
        <div style="padding: 24px;">
            <p>Halo,<br><br>Rencana kirim berikut telah <strong>dibatalkan</strong>.</p>

            <table style="width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 14px;">
                <tr>
                    <td style="padding: 6px 0; color: #6b7280; width: 160px;">Tanggal RKH</td>
                    <td style="padding: 6px 0; font-weight: 600;">{{ optional($rencanaKirim->rkh_date)->format('d-m-Y') ?? '-' }}</td>
                </tr>
                <tr>
                    <td style="padding: 6px 0; color: #6b7280;">No. PO Transporter</td>
                    <td style="padding: 6px 0; font-weight: 600;">{{ $rencanaKirim->po_transporter ?? '-' }}</td>
                </tr>
                <tr>
                    <td style="padding: 6px 0; color: #6b7280;">Driver / Nopol</td>
                    <td style="padding: 6px 0; font-weight: 600;">{{ $rencanaKirim->driver_name ?? '-' }} / {{ $rencanaKirim->nopol ?? '-' }}</td>
                </tr>
                <tr>
                    <td style="padding: 6px 0; color: #6b7280;">Tujuan</td>
                    <td style="padding: 6px 0; font-weight: 600;">{{ $rencanaKirim->destination_name ?? '-' }}</td>
                </tr>
                <tr>
                    <td style="padding: 6px 0; color: #6b7280;">Total Qty</td>
                    <td style="padding: 6px 0; font-weight: 600;">{{ $rencanaKirim->total_qty ?? 0 }}</td>
                </tr>
            </table>

            @if(($items ?? null) && count($items) > 0)
                <h3 style="margin: 20px 0 8px; font-size: 14px;">Daftar Barang</h3>
                <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                    <tr style="background: #f3f4f6;">
                        <th style="padding: 8px; text-align: left; border: 1px solid #e5e7eb;">No</th>
                        <th style="padding: 8px; text-align: left; border: 1px solid #e5e7eb;">Kode</th>
                        <th style="padding: 8px; text-align: left; border: 1px solid #e5e7eb;">Nama Barang</th>
                        <th style="padding: 8px; text-align: right; border: 1px solid #e5e7eb;">Qty</th>
                        <th style="padding: 8px; text-align: left; border: 1px solid #e5e7eb;">Satuan</th>
                    </tr>
                    @foreach($items as $i => $item)
                    <tr>
                        <td style="padding: 8px; border: 1px solid #e5e7eb;">{{ $i + 1 }}</td>
                        <td style="padding: 8px; border: 1px solid #e5e7eb;">{{ $item->kode_barang }}</td>
                        <td style="padding: 8px; border: 1px solid #e5e7eb;">{{ $item->nama_barang }}</td>
                        <td style="padding: 8px; border: 1px solid #e5e7eb; text-align: right;">{{ $item->jumlah }}</td>
                        <td style="padding: 8px; border: 1px solid #e5e7eb;">{{ $item->satuan }}</td>
                    </tr>
                    @endforeach
                </table>
            @endif

            <p style="margin-top: 20px; font-size: 13px; color: #6b7280;">Email ini dikirim otomatis oleh sistem. Mohon tidak membalas email ini.</p>
        </div>
    </div>
</body>
</html>
