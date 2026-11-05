<!DOCTYPE html>
<html>
<body style="font-family: Arial, Helvetica, sans-serif; color: #1f2937; line-height: 1.5;">
    <div style="max-width: 640px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
        <div style="background: linear-gradient(to right, #0f172a, #1e3a8a); padding: 24px; color: #fff;">
            <h1 style="margin: 0; font-size: 20px;">
                @if ($kind === 'reminder')
                    ⏰ Pengingat Opname Expired
                @elseif ($kind === 'submitted')
                    ⏳ Opname Expired Menunggu Persetujuan
                @elseif ($kind === 'approved')
                    ✅ Opname Expired Disetujui
                @elseif ($kind === 'revisi')
                    ✏️ Opname Expired Perlu Revisi
                @elseif ($kind === 'cancelled')
                    🚫 Sesi Opname Dibatalkan
                @else
                    ✅ Sesi Opname Selesai
                @endif
            </h1>
            <p style="margin: 4px 0 0; color: #bfdbfe; font-size: 13px;">ONEZENTRA Warehouse Management · Minggu {{ $weekStart }}</p>
        </div>
        <div style="padding: 24px;">
            @if ($kind === 'reminder')
                <p>Halo,<br><br>Depo berikut <strong>belum mengirim</strong> hasil opname expired minggu {{ $weekStart }}:</p>
            @elseif ($kind === 'submitted')
                <p>Halo,<br><br>Hasil opname expired berikut <strong>menunggu persetujuan</strong> — koreksi stok berlaku setelah disetujui:</p>
            @elseif ($kind === 'approved')
                <p>Halo,<br><br>Sesi opname berikut <strong>disetujui</strong> — koreksi telah diterapkan ke wave:</p>
            @elseif ($kind === 'revisi')
                <p>Halo,<br><br>Sesi opname berikut <strong>perlu revisi</strong> — perbaiki hasil hitung lalu kirim ulang:</p>
            @else
                <p>Halo,<br><br>Status sesi opname expired berikut diperbarui:</p>
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
                        <td style="padding: 8px; border-bottom: 1px solid #f1f5f9;">
                            {{ match (true) {
                                ($row['validated'] ?? 0) > 0 => 'Disetujui',
                                ($row['submitted'] ?? false) => 'Menunggu persetujuan',
                                default => 'Belum tuntas',
                            } }}
                        </td>
                    </tr>
                @endforeach
            </table>

            @if ($kind === 'revisi' && (($rows[0]['decision_note'] ?? null) !== null))
                <p style="margin-top: 16px; background: #fef3c7; border-left: 4px solid #f59e0b; padding: 10px 12px; font-size: 13px;">
                    <strong>Catatan approver:</strong> {{ $rows[0]['decision_note'] }}
                </p>
            @elseif ($kind === 'submitted')
                <p style="margin-top: 16px;">Mohon setujui atau kembalikan untuk revisi melalui halaman Sesi Opname. Terima kasih.</p>
            @elseif ($kind === 'reminder')
                <p style="margin-top: 16px;">Mohon segera verifikasi melalui halaman Sesi Opname. Terima kasih.</p>
            @endif
        </div>
    </div>
</body>
</html>
