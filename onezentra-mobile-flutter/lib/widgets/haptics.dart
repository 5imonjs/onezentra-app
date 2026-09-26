import 'package:flutter/services.dart';

/// Umpan balik getar untuk aksi yang tercatat permanen.
///
/// Web tidak punya padanan yang setara: `hover` dan `focus` hanya menjangkau
/// tetikus dan papan ketik, sedangkan operator lapangan sering memakai satu
/// tangan sambil memegang dokumen, sehingga konfirmasi penglihatan datang
/// belakangan — setelah snackbar atau kartu pesan. Getaran singkat memberi tahu
/// "tahan, ini tombol yang menyimpan sesuatu" jauh sebelum layar berganti.
///
/// Dua tingkat, dipisah supaya tidak semua terasa sama:
///
/// * [hapticCommit] — aksi yang tercatat permanen (Gate IN/OUT/Verify, simpan
///   hasil pemeriksaan, setujui standarisasi).
/// * [hapticDestructive] — membatalkan atau menolak sesuatu (hapus item,
///   batalkan validasi, tolak standarisasi). Lebih berat supaya operator
///   sempat berpikir sebelum menekan.
///
/// **Kegagalan tidak pernah bergetar.** Getar selalu berarti "server sudah
/// mengonfirmasi"; pesan kegagalan disampaikan lewat kartu/snackbar dan
/// `liveRegion`, bukan lewat getaran — kalau tidak, getaran bisa dibaca sebagai
/// persetujuan.
///
/// Semua fungsi aman dipanggil dari provider (tanpa `BuildContext`) dan
/// diabaikan diam-diam bila platform tidak mendukung: getar tidak boleh pernah
/// jadi penyebab sebuah request gagal.
void hapticCommit() {
  HapticFeedback.mediumImpact();
}

/// Getaran lebih berat untuk pembatalan atau penolakan.
void hapticDestructive() {
  HapticFeedback.heavyImpact();
}
