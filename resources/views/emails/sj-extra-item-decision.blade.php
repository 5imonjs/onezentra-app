<!DOCTYPE html>
<html>
<body style="font-family: Arial, Helvetica, sans-serif; color: #1f2937; line-height: 1.5;">
    <div style="max-width: 640px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
        <div style="background: {{ $decision === 'APPROVED' ? 'linear-gradient(to right, #065f46, #047857)' : 'linear-gradient(to right, #991b1b, #b91c1c)' }}; padding: 24px; color: #fff;">
            <h1 style="margin: 0; font-size: 20px;">Barang Luar Rencana {{ $decision === 'APPROVED' ? 'Disetujui' : 'Ditolak' }}</h1>
            <p style="margin: 4px 0 0; color: #d1fae5; font-size: 13px;">ONEZENTRA Warehouse Management</p>
        </div>
        <div style="padding: 24px;">
            <p>Halo,<br><br><strong>{{ $extraItem->approver?->full_name ?? 'Planner' }}</strong> telah memutuskan catatan barang di luar rencana berikut sebagai <strong>{{ $decision === 'APPROVED' ? 'DISETUJUI' : 'DITOLAK' }}</strong>.</p>

            <table style="width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px;">
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
                    <td style="padding: 6px; border: 1px solid #e5e7eb; color: #6b7280;">Dicatat oleh</td>
                    <td style="padding: 6px; border: 1px solid #e5e7eb;">{{ $extraItem->recorder?->full_name ?? '-' }}</td>
                </tr>
                <tr>
                    <td style="padding: 6px; border: 1px solid #e5e7eb; color: #6b7280;">Diputus oleh</td>
                    <td style="padding: 6px; border: 1px solid #e5e7eb;">{{ $extraItem->approver?->full_name ?? '-' }}</td>
                </tr>
                <tr>
                    <td style="padding: 6px; border: 1px solid #e5e7eb; color: #6b7280;">Catatan keputusan</td>
                    <td style="padding: 6px; border: 1px solid #e5e7eb;">{{ $extraItem->decision_notes ?? '-' }}</td>
                </tr>
            </table>

            <p style="margin-top: 16px; font-size: 13px;">Rencana kirim tidak diubah oleh sistem — catatan ini murni jejak keputusan penerimaan barang.</p>
        </div>
    </div>
</body>
</html>
