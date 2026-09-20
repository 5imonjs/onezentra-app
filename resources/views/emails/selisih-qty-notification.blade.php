<!DOCTYPE html>
<html>
<body style="font-family: Arial, Helvetica, sans-serif; color: #1f2937; line-height: 1.5;">
    <div style="max-width: 640px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
        <div style="background: linear-gradient(to right, #92400e, #b45309); padding: 24px; color: #fff;">
            <h1 style="margin: 0; font-size: 20px;">⚠️ Selisih Qty Ditemukan</h1>
            <p style="margin: 4px 0 0; color: #fcd34d; font-size: 13px;">ONEZENTRA Warehouse Management</p>
        </div>
        <div style="padding: 24px;">
            <p>Halo,<br><br>Terdapat selisih qty pada validasi berikut:</p>

            <table style="width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 14px;">
                <tr>
                    <td style="padding: 6px 0; color: #6b7280; width: 160px;">Tanggal</td>
                    <td style="padding: 6px 0; font-weight: 600;">{{ now()->format('d-m-Y') }}</td>
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
                    <td style="padding: 6px 0; color: #6b7280;">Divalidasi oleh</td>
                    <td style="padding: 6px 0; font-weight: 600;">{{ $selisihItems->first()->validator->full_name ?? '-' }}</td>
                </tr>
            </table>

            <h3 style="margin: 20px 0 8px; font-size: 14px;">Detail Selisih</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                <tr style="background: #fef3c7;">
                    <th style="padding: 8px; text-align: left; border: 1px solid #e5e7eb;">No</th>
                    <th style="padding: 8px; text-align: left; border: 1px solid #e5e7eb;">Kode</th>
                    <th style="padding: 8px; text-align: left; border: 1px solid #e5e7eb;">Nama Barang</th>
                    <th style="padding: 8px; text-align: right; border: 1px solid #e5e7eb;">Plan</th>
                    <th style="padding: 8px; text-align: right; border: 1px solid #e5e7eb;">Aktual</th>
                    <th style="padding: 8px; text-align: right; border: 1px solid #e5e7eb;">Selisih</th>
                    <th style="padding: 8px; text-align: left; border: 1px solid #e5e7eb;">Alasan</th>
                </tr>
                @foreach($selisihItems as $i => $item)
                <tr>
                    <td style="padding: 8px; border: 1px solid #e5e7eb;">{{ $i + 1 }}</td>
                    <td style="padding: 8px; border: 1px solid #e5e7eb;">{{ $item->kode_barang }}</td>
                    <td style="padding: 8px; border: 1px solid #e5e7eb;">{{ $item->nama_barang }}</td>
                    <td style="padding: 8px; border: 1px solid #e5e7eb; text-align: right;">{{ $item->expected_qty }}</td>
                    <td style="padding: 8px; border: 1px solid #e5e7eb; text-align: right;">{{ $item->actual_qty }}</td>
                    <td style="padding: 8px; border: 1px solid #e5e7eb; text-align: right; font-weight: bold; color: {{ $item->selisih_qty < 0 ? '#dc2626' : '#16a34a' }};">
                        {{ $item->selisih_qty > 0 ? '+' : '' }}{{ $item->selisih_qty }}
                    </td>
                    <td style="padding: 8px; border: 1px solid #e5e7eb;">{{ $item->selisih_reason ?? '-' }}</td>
                </tr>
                @endforeach
                <tr style="background: #f9fafb; font-weight: bold;">
                    <td colspan="5" style="padding: 8px; border: 1px solid #e5e7eb; text-align: right;">Total Selisih</td>
                    <td style="padding: 8px; border: 1px solid #e5e7eb; text-align: right; color: {{ $totalSelisih < 0 ? '#dc2626' : '#16a34a' }};">
                        {{ $totalSelisih > 0 ? '+' : '' }}{{ $totalSelisih }}
                    </td>
                    <td style="padding: 8px; border: 1px solid #e5e7eb;"></td>
                </tr>
            </table>

            <p style="margin-top: 20px; font-size: 13px; color: #6b7280;">Email ini dikirim otomatis oleh sistem. Mohon tidak membalas email ini.</p>
        </div>
    </div>
</body>
</html>
