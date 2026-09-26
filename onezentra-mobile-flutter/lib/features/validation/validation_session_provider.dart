import 'package:flutter/foundation.dart';
import 'package:onezentra_mobile/core/api_client.dart';
import 'package:onezentra_mobile/features/validation/models/validation_models.dart';
import 'package:onezentra_mobile/features/validation/validation_service.dart';
import 'package:onezentra_mobile/widgets/haptics.dart';

/// State satu sesi Validasi Dokumen yang sedang dikerjakan di layar.
///
/// Di-scope ke layar (bukan global) seperti [GateSessionProvider]: dokumen half
/// finished tidak boleh bertahan lintas pengguna — begitu widget di-dispose,
/// provider ini ikut hilang.
class ValidationSessionProvider extends ChangeNotifier {
  ValidationSessionProvider(this._service);

  final ValidationService _service;

  SjValidation? validation;
  bool startBusy = false;
  bool itemBusy = false;
  bool actionBusy = false;

  /// Tarik-torefresh detail sedang berjalan. Dipisah dari [startBusy] supaya
  /// tombol "Scan Barcode Dokumen" tidak ikut berubah status saat dokumen yang
  /// terbuka disegarkan.
  bool refreshing = false;
  String? error;
  String? notice;

  int _startToken = 0;

  /// Mulai validasi dari barcode/nomor PO.
  ///
  /// `validation` **selalu** dikosongkan di awal: tanpa itu, scan gagal masih
  /// menyisakan dokumen sebelumnya yang bisa langsung diselesaikan.
  Future<void> startByCode(String code) {
    final value = code.trim();
    if (value.isEmpty) {
      return Future.value();
    }
    return _start(
      () => _service.startByCode(value),
      errorMessage: 'Dokumen tidak ditemukan',
    );
  }

  /// Mulai validasi dari dokumen yang sudah diketahui (mis. hasil scan di tab
  /// Check In) — tanpa scan/ketik ulang PO.
  Future<void> startByRencanaKirim(int rencanaKirimId) {
    return _start(
      () => _service.startByRencanaKirim(rencanaKirimId),
      errorMessage: 'Dokumen tidak ditemukan',
    );
  }

  /// Buka dokumen yang sudah pernah dimulai, dari baris daftar.
  ///
  /// Pakai `show` (bukan `start`) supaya membuka baris bersifat baca-saja:
  /// dokumen yang dibatalkan tidak ikut membuat validasi baru diam-diam, dan
  /// dokumen berstatus VERIFIED tidak memicu penolakan 422 dari `start`.
  Future<void> openById(int validationId) {
    return _start(
      () => _service.show(validationId),
      errorMessage: 'Dokumen tidak ditemukan',
    );
  }

  Future<void> _start(
    Future<SjValidation> Function() call, {
    required String errorMessage,
  }) async {
    final token = ++_startToken;
    startBusy = true;
    error = null;
    notice = null;
    validation = null;
    notifyListeners();
    try {
      final result = await call();
      if (token != _startToken) return;
      validation = result;
    } catch (e) {
      if (token != _startToken) return;
      error = apiErrorMessage(e, errorMessage);
    } finally {
      if (token == _startToken) {
        startBusy = false;
        notifyListeners();
      }
    }
  }

  /// Simpan hasil pemeriksaan fisik satu item. True bila tersimpan.
  ///
  /// Tidak ada lagi parameter tier/tinggi tumpukan: backend punya jalur
  /// `upsertStandarisasiTumpukan` untuk kolom itu, tapi di web pun jalurnya
  /// tidak terjangkau — `openItem` mengarahkan operator ke halaman
  /// Standarisasi sebelum form ini terbuka. Mengirimnya dari sini hanya
  /// menghasilkan baris `pending` yang memblokir item tanpa pernah bisa
  /// disetujui dari layar validasi.
  Future<bool> saveItem({
    required SjValidationItem item,
    required double actualQty,
    String? barcode,
    String? expiredDate,
    String? condition,
    String? notes,
    String? photoPath,
  }) async {
    final current = validation;
    if (current == null) {
      return false;
    }
    return _runAction(() async {
      final updated = await _service.scanItem(
        validationId: current.id,
        itemId: item.id,
        actualQty: actualQty,
        barcode: barcode,
        expiredDate: expiredDate,
        condition: condition,
        notes: notes,
        photoPath: photoPath,
      );
      _replaceItem(updated);
      return updated.isMismatch
          ? 'Item tercatat dengan selisih qty.'
          : 'Item tercatat sesuai.';
    });
  }

  /// Hapus satu item (salah input / baris tidak perlu). True bila terhapus.
  Future<bool> removeItem(SjValidationItem item) async {
    final current = validation;
    if (current == null) {
      return false;
    }
    return _runAction(() async {
      validation = await _service.deleteItem(current.id, item.id);
      return 'Item dihapus dari daftar validasi.';
    }, onSuccess: hapticDestructive);
  }

  /// Selesaikan validasi: semua item harus sudah diperiksa (backend menolak
  /// jika masih ada item PENDING).
  Future<bool> complete() async {
    final current = validation;
    if (current == null) {
      return false;
    }
    final pending = current.pendingItems;
    if (pending > 0) {
      error = 'Masih ada $pending item yang belum divalidasi.';
      notifyListeners();
      return false;
    }
    return _runAction(() async {
      final done = await _service.complete(current.id);
      validation = null;
      return done.mismatchItems > 0
          ? 'Validasi selesai. ${done.mismatchItems} item selisih — notifikasi email telah dikirim ke BLC.'
          : 'Validasi selesai. Notifikasi email telah dikirim ke BLC.';
    });
  }

  Future<bool> cancel() async {
    final current = validation;
    if (current == null) {
      return false;
    }
    return _runAction(() async {
      await _service.cancel(current.id);
      validation = null;
      return 'Validasi dibatalkan.';
    }, onSuccess: hapticDestructive);
  }

  /// Kembali ke layar scan (dokumen selesai/dibatalkan).
  void reset() {
    _startToken++;
    final changed = validation != null || error != null || notice != null;
    validation = null;
    error = null;
    notice = null;
    if (changed) {
      notifyListeners();
    }
  }

  void _replaceItem(SjValidationItem updated) {
    final current = validation;
    if (current == null) {
      return;
    }
    validation = current.copyWith(
      items: [
        for (final i in current.items)
          if (i.id == updated.id) updated else i,
      ],
    );
  }

  /// Muat ulang dokumen yang sedang dibuka (pull-to-refresh di detail).
  ///
  /// Sengaja **tidak** memakai `_start`: dokumen tidak dikosongkan dulu, jadi
  /// layar detail tidak berkedip ke tampilan scan saat operator menarik.
  /// Membaca lewat `show` juga menjaga sifat baca-saja — dokumen yang sudah
  /// final tidak memicu validasi baru di belakang layar.
  Future<void> refresh() async {
    final current = validation;
    if (current == null || refreshing) {
      return;
    }
    final token = ++_startToken;
    refreshing = true;
    error = null;
    notifyListeners();
    try {
      final fresh = await _service.show(current.id);
      if (token != _startToken) return;
      validation = fresh;
    } catch (e) {
      if (token != _startToken) return;
      // Dokumen lama tetap tampil: gagal refresh bukan alasan menghapus
      // pekerjaan yang sedang dikerjakan.
      error = apiErrorMessage(e, 'Gagal memuat ulang dokumen.');
    } finally {
      if (token == _startToken) {
        refreshing = false;
        notifyListeners();
      }
    }
  }

  /// Jalankan aksi yang mengubah dokumen di server.
  ///
  /// [onSuccess] menentukan berat getar: penyimpanan hasil pemeriksaan memakai
  /// [hapticCommit], sedangkan pembatalan/penghapusan memakai
  /// [hapticDestructive] supaya operator terasa berhenti sebelum menekan.
  /// Getar hanya dipanggil setelah server mengonfirmasi sukses — kegagalan
  /// tidak boleh terasa seperti konfirmasi.
  Future<bool> _runAction(
    Future<String> Function() call, {
    void Function()? onSuccess,
  }) async {
    if (itemBusy || actionBusy) {
      return false;
    }
    itemBusy = true;
    error = null;
    notice = null;
    notifyListeners();
    try {
      notice = await call();
      (onSuccess ?? hapticCommit)();
      return true;
    } catch (e) {
      error = apiErrorMessage(e, 'Gagal menyimpan validasi.');
      return false;
    } finally {
      itemBusy = false;
      notifyListeners();
    }
  }
}

/// Validasi draft item sebelum dikirim.
///
/// [hasExpiredDate] mengikuti aturan UI web, bukan aturan backend: pada
/// server `expired_date` nullable, tapi `saveItem` di
/// `validasi-sj/page.tsx` menonaktifkan tombol simpan selama tanggal belum
/// diisi. Perbandingan sisa umur adalah inti pekerjaan validasi, jadi mobile
/// menuntut isian yang sama — kalau tidak, operator bisa menyimpan item tanpa
/// tanggal dan tidak pernah melihat kartu standar umur.
String? itemDraftError({
  required double? actualQty,
  required String condition,
  required bool hasPhoto,
  bool hasExpiredDate = true,
}) {
  if (actualQty == null || actualQty < 0) {
    return 'Qty aktual wajib diisi.';
  }
  if (!hasExpiredDate) {
    return 'Tanggal expired wajib diisi.';
  }
  if (conditionNeedsPhoto(condition) && !hasPhoto) {
    return 'Foto wajib untuk kondisi ${conditionLabel(condition)}.';
  }
  return null;
}
