<!DOCTYPE html>
<html>
<body style="font-family: Arial, Helvetica, sans-serif; color: #1f2937; line-height: 1.5;">
    <div style="max-width: 640px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
        <div style="background: linear-gradient(to right, #0f172a, #1e3a8a); padding: 24px; color: #fff;">
            <h1 style="margin: 0; font-size: 20px;">
                @if ($kind === 'reminder')
                    ⏰ Pengingat Opname Expired
                @else
                    ✅ Sesi Opname Selesai
                @endif
            </h1>
            <p style="margin: 4px 0 0; color: #bfdbfe; font-size: 13px;">ONEZENTRA Warehouse Management · Minggu {{ $weekStart }}</p>
        </div>
        <div style="padding: 24px;">
            @if ($kind === 'reminder')
                <p>Halo,<br><br>Depo berikut <strong>belum mengirim</strong> hasil opname expired minggu {{ $weekStart }}:</p>
            @else
                <p>Halo,<br><br>Hasil opname expired berikut <strong>telah dikirim</strong>:</p>
            @endif

            <table style="width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 14px;">
                <tr style="background: #f8fafc;">
                    <th style="padding: 8px; text-align: left; border-bottom: 2px solid #e5e7eb;">Depo</th>
                    <th style="padding: 8px; text-align: right; border-bottom: 2px solid #e5e7eb;">Baris</th>
                    <th style="padding: 8px; text-align: right; border-bottom: 2px solid #e5e7eb;">Tervalidasi</th>
                    <th style="padding: 8px; text-align: left; border-bottom: 2px solid #e5e7eb;">Status</th>
                </tr>
                @foreach ($rows as $row)
                    <tr>
                        <td style="padding: 8px; border-bottom: 1px solid #f1f5f9;">{{ $row['nama_depo'] ?? $row['kode_depo'] }}</td>
                        <td style="padding: 8px; text-align: right; border-bottom: 1px solid #f1f5f9;">{{ $row['total'] }}</td>
                        <td style="padding: 8px; text-align: right; border-bottom: 1px solid #f1f5f9;">{{ $row['validated'] }}</td>
                        <td style="padding: 8px; border-bottom: 1px solid #f1f5f9;">{{ $row['submitted'] ? 'Sudah kirim' : 'Belum kirim' }}</td>
                    </tr>
                @endforeach
            </table>

            @if ($kind === 'reminder')
                <p style="margin-top: 16px;">Mohon segera verifikasi melalui halaman Sesi Opname. Terima kasih.</p>
            @endif
        </div>
    </div>
</body>
</html>
