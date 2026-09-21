---
paths:
  - onezentra-web/src/app/rencana-kirim/page.tsx
---

# Rencana Kirim

## Kalkulasi numerik frontend wajib Number(), jangan typeof number
Nilai numerik dari API Laravel untuk kolom ber-cast `decimal:2` (mis. npn.decVolume) atau kolom string (npn.SAPdecUom) datang sebagai STRING di JSON. Jangan cek `typeof === 'number'` — itu akan selalu false dan menggagalkan kalkulasi (bug kubikasi). Selalu konversi dengan `Number(...)`/`parseFloat` sebelum dihitung; status state boleh menyimpan string asal semua perhitungan lewat `Number()`.

## Daftar RK wajib punya render mobile
Tabel daftar rencana kirim dibungkus `hidden lg:block` — tanpa padanan kartu mobile (`lg:hidden` di bawahnya, sudah ada), daftar hilang total di ponsel/tablet. Saat menambah kolom/aksi baru di tabel desktop, cerminakan ke kartu mobile. Ganti status (Jadwalkan/Batalkan) desktop & mobile wajib lewat satu handler bersama `handleStatusChange` (guard `statusBusyId` di dalamnya) — jangan duplikat logika inline.

## Input PO Transporter uppercase
Backend menormalkan `po_transporter` ke UPPERCASE (store/update); input form memakai class `uppercase` agar apa yang diketik user = apa yang tersimpan (konsisten dengan input nopol).

## Autocomplete NamaBarangInput: cleanup unmount-only
Jangan ikut sertakan `onTypingChange` inline (arrow yang dibuat ulang tiap render) sebagai dependency effect NamaBarangInput — efek cleanup tiap render memanggil `markTyping(false)` dan memicu "Maximum update depth exceeded". Simpan callback di ref (`useRef` + sync di `useEffect` tanpa deps) dan jalankan `onTypingChangeRef.current?.(false)` hanya saat unmount (`[]`). `markTyping` harus bail-out (return `prev` bila `prev.has(index) === isTyping`).
