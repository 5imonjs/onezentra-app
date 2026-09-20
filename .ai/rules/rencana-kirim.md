---
paths:
  - onezentra-web/src/app/rencana-kirim/page.tsx
---

# Rencana Kirim

## Kalkulasi numerik frontend wajib Number(), jangan typeof number
Nilai numerik dari API Laravel untuk kolom ber-cast `decimal:2` (mis. npn.decVolume) atau kolom string (npn.SAPdecUom) datang sebagai STRING di JSON. Jangan cek `typeof === 'number'` — itu akan selalu false dan menggagalkan kalkulasi (bug kubikasi). Selalu konversi dengan `Number(...)`/`parseFloat` sebelum dihitung; status state boleh menyimpan string asal semua perhitungan lewat `Number()`.

## Autocomplete NamaBarangInput: cleanup unmount-only
Jangan ikut sertakan `onTypingChange` inline (arrow yang dibuat ulang tiap render) sebagai dependency effect NamaBarangInput — efek cleanup tiap render memanggil `markTyping(false)` dan memicu "Maximum update depth exceeded". Simpan callback di ref (`useRef` + sync di `useEffect` tanpa deps) dan jalankan `onTypingChangeRef.current?.(false)` hanya saat unmount (`[]`). `markTyping` harus bail-out (return `prev` bila `prev.has(index) === isTyping`).
