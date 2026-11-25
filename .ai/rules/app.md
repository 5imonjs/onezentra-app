---
paths:
  - 'app/**'
---

# App

## Enforce hierarchy scope independently of role
Organization hierarchy is a separate account scope: Master manages Regions, Region manages Depots only within its Region, Depot manages Partner Sites only within its Depot, and PS accounts are the leaf level. Keep the operational permission role separate from `scope_level`; every account must carry a valid `region_id` and exactly one `kode_depo`, and PS accounts must reference a Partner Site in that same Depot.

## Activity logging runs after response, not on the queue
`TrackUserActivity` dispatches `LogUserActivity` with `->afterResponse()`. That runs the job synchronously once the response is sent — it is NOT a queued job, so activity is still recorded on shared hosting with no queue worker. Do not "fix" it back to a queued dispatch, and do not log `dashboard/activity/live` or `dashboard/activity/history` (self-polling floods the table).

## Activity log stores the actor's device
`user_activity_logs` menyimpan `ip_address`, `user_agent`, dan `device_name` (nama token Sanctum untuk mobile; null untuk session/curl). `TrackUserActivity` dan `AuthController::trackAuthEvent()` wajib mengisi ketiganya lewat `LogUserActivity`. Jangan menghapusnya: satu-satunya cara menelusuri siapa/perangkat apa yang membuat dokumen adalah kombinasi `created_by` + jejak ini (log nginx hanya bertahan ~2 minggu).
- `bootstrap/app.php` mempercayai proxy loopback (`127.0.0.1`, `::1`) karena nginx `proxy_pass` ke `127.0.0.1:8000`. Tanpa itu `$request->ip()` menyimpan `127.0.0.1` di log aktivitas, bukan IP klien asli dari `X-Forwarded-For`.
- Import barang Rencana Kirim (`RencanaKirimItemImport`, `RencanaKirimImport`) wajib membuang baris dengan `jumlah < 1` dan mengembalikan daftar `errors` per baris. Backend `store`/`update` memakai `min:1`; membiarkan 0.5 lolos dari import hanya memindahkan kegagalan ke saat simpan (422 `items.N.jumlah`).
- `rencana_kirim_items.received_qty` dipakai Laporan/ekspor Replenishment. Alur Validasi SJ (materialisasi receiving, koreksi, extra item, hapus item) WAJIB memanggil `ReceivedQtySyncService::sync(..., validatedOnly: true)`; scan receiving tetap memakai increment. Jangan menggabungkan keduanya — baris fallback receiving mengisi `actual_qty = jumlah` rencana dan akan melebih-lebihkan qty diterima bila ikut dihitung sebagai qty validasi.
- `ReceivingController::completeReceiving` (mobile "Bongkar Selesai") wajib memanggil `BiayaRetribusiSyncService::syncForReceiving` dan `ReceivedQtySyncService::sync(validatedOnly: true)`. Titik ini adalah perubahan qty terakhir; tanpa sinkron, draft retribusi & "Qty Diterima" memakai angka lama dari Validasi SJ.
- `BiayaRetribusiCalculator::inheritReceivingDepot` tidak boleh return awal hanya karena ada baris manual (catatan luar rencana). Ambil depo dari semua baris yang punya `receiving_id`; kalau tidak, `resolveFor(null)` jatuh ke borongan dan nominal baris receiving tidak dihitung ulang. Web wajib mengirim `kode_depo` efektif di FormData create/update.
