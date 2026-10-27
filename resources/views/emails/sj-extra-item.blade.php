<!DOCTYPE html>
<html>
<body style="font-family: Arial, Helvetica, sans-serif; color: #1f2937; line-height: 1.5;">
    <div style="max-width: 640px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
        <div style="background: linear-gradient(to right, #7c2d12, #9a3412); padding: 24px; color: #fff;">
            <h1 style="margin: 0; font-size: 20px;">Barang di Luar Rencana</h1>
            <p style="margin: 4px 0 0; color: #fed7aa; font-size: 13px;">ONEZENTRA Warehouse Management</p>
        </div>
        <div style="padding: 24px;">
            <p>Halo,<br><br>Checker menemukan <strong>barang yang tidak ada di rencana kirim</strong> saat validasi dokumen berikut. Mohon ditindaklanjuti — rencana tidak diubah oleh sistem.</p>

            <table style="width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 14px;">
                <tr>
                    <td style="padding: 6px 0; color: #6b7280; width: 160px;">No. PO Transporter</td>
                    <td style="padding: 6px 0; font-weight: 600;">{{ $rencanaKirim->po_transporter ?? '-' }}</td>
                </tr>
                <tr>
                    <td style="padding: 6px 0; color: #6b7280;">Driver / Nopol</td>
                    <td style="padding: 6px 0; font-weight: 600;">{{ $rencanaKirim->driver_name ?? '-' }} / {{ $rencanaKirim->nopol ?? '-' }}</td>
                </tr>
                <tr>
                    <td style="padding: 6px 0; color: #6b7280;">Depo</td>
                    <td style="padding: 6px 0; font-weight: 600;">{{ $rencanaKirim->kode_depo ?? '-' }}</td>
                </tr>
            </table>

            <h3 style="margin: 20px 0 8px; font-size: 14px;">Detail Barang Luar Rencana</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                <tr>
                    <td style="padding: 6px; border: 1px solid #e5e7eb; width: 160px; color: #6b7280;">Kode Barang</td>
                    <td style="padding: 6px; border: 1px solid #e5e7eb; font-weight: 600;">{{ $extraItem->kode_barang }}</td>
                </tr>
                <tr>
                    <td style="padding: 6px; border: 1px solid #e5e7eb; color: #6b7280;">Nama Barang</td>
                    <td style="padding: 6px; border: 1px solid #e5e7eb; font-weight: 600;">{{ $extraItem->nama_barang }}</td>
                </tr>
                <tr>
                    <td style="padding: 6px; border: 1px solid #e5e7eb; color: #6b7280;">Jumlah</td>
                    <td style="padding: 6px; border: 1px solid #e5e7eb;">{{ $extraItem->qty }} {{ $extraItem->satuan }}</td>
                </tr>
                <tr>
                    <td style="padding: 6px; border: 1px solid #e5e7eb; color: #6b7280;">Kondisi</td>
                    <td style="padding: 6px; border: 1px solid #e5e7eb;">{{ $extraItem->condition }}</td>
                </tr>
                <tr>
                    <td style="padding: 6px; border: 1px solid #e5e7eb; color: #6b7280;">Expired</td>
                    <td style="padding: 6px; border: 1px solid #e5e7eb;">{{ optional($extraItem->expired_date)->format('d-m-Y') ?? '-' }}</td>
                </tr>
                <tr>
                    <td style="padding: 6px; border: 1px solid #e5e7eb; color: #6b7280;">Catatan</td>
                    <td style="padding: 6px; border: 1px solid #e5e7eb;">{{ $extraItem->notes ?? '-' }}</td>
                </tr>
                <tr>
                    <td style="padding: 6px; border: 1px solid #e5e7eb; color: #6b7280;">Dicatat oleh</td>
                    <td style="padding: 6px; border: 1px solid #e5e7eb;">{{ $extraItem->recorder?->full_name ?? '-' }}</td>
                </tr>
            </table>

            <p style="margin-top: 16px; font-size: 13px;">Bukti foto tersimpan di sistem (dokumen validasi SJ). Keputusan penerimaan barang ini ada di sisi planner — rencana kirim belum diubah.</p>

            <p style="margin-top: 20px; font-size: 13px; color: #6b7280;">Email ini dikirim otomatis oleh sistem. Mohon tidak membalas email ini.</p>
        </div>
    </div>
</body>
</html>
