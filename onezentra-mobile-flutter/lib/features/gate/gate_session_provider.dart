import 'package:flutter/foundation.dart';
import 'package:onezentra_mobile/core/api_client.dart';
import 'package:onezentra_mobile/features/gate/gate_service.dart';
import 'package:onezentra_mobile/features/gate/models/gate_models.dart';
import 'package:onezentra_mobile/widgets/haptics.dart';

/// State aksi gate untuk **satu** sesi layar Check In Point.
///
/// Dipisah dari [GateProvider] (yang menyimpan statistik & riwayat) karena
/// dokumen yang sedang diproses tidak boleh bertahan lintas layar/pengguna:
/// begitu widget layar di-dispose, provider ini ikut hilang.
class GateSessionProvider extends ChangeNotifier {
  GateSessionProvider(this._service, {Future<void> Function()? onCommitted})
    : _onCommitted = onCommitted;

  final GateService _service;

  /// Dipanggil setelah aksi berhasil dicatat, agar statistik & riwayat dimuat
  /// ulang oleh pemanggil.
  final Future<void> Function()? _onCommitted;

  RencanaKirimSummary? found;
  bool lookupBusy = false;
  bool actionBusy = false;
  String? resultOk;
  String? resultError;

  /// Dokumen terakhir yang gate-nya sudah tercatat, lengkap dengan status
  /// barunya. Kartu dokumen sengaja dikosongkan setelah aksi supaya operator
  /// bisa langsung scan kendaraan berikutnya, tapi identitas dokumen ini
  /// disimpan agar bisa ditawarkan "Mulai Validasi" tanpa scan ulang.
  RencanaKirimSummary? lastCommitted;

  int _lookupToken = 0;

  /// Cari rencana kirim berdasarkan nomor PO atau Nopol.
  ///
  /// `found` **selalu** dikosongkan di awal: tanpa itu, scan gagal/"tidak
  /// ditemukan" masih menyisakan dokumen PO sebelumnya yang bisa langsung
  /// di-Gate-IN.
  Future<void> lookup(String code) async {
    final value = code.trim();
    if (value.isEmpty) {
      return;
    }
    final token = ++_lookupToken;
    lookupBusy = true;
    resultOk = null;
    resultError = null;
    found = null;
    lastCommitted = null;
    notifyListeners();
    try {
      final rk = await _service.lookup(value);
      if (token != _lookupToken) return;
      found = rk;
    } catch (e) {
      if (token != _lookupToken) return;
      resultError = apiErrorMessage(e, 'Rencana kirim tidak ditemukan');
    } finally {
      if (token == _lookupToken) {
        lookupBusy = false;
        notifyListeners();
      }
    }
  }

  void clearFound() {
    final changed =
        found != null ||
        resultOk != null ||
        resultError != null ||
        lastCommitted != null;
    found = null;
    resultOk = null;
    resultError = null;
    lastCommitted = null;
    if (changed) {
      notifyListeners();
    }
  }

  Future<bool> gateIn() {
    final rk = found;
    if (rk == null) return Future.value(false);
    return _runAction(() async {
      final status = await _service.gateIn(rk);
      return _commit(rk, status, 'CHECKED_IN', 'Gate IN berhasil dicatat');
    });
  }

  Future<bool> gateOut() {
    final rk = found;
    if (rk == null) return Future.value(false);
    return _runAction(() async {
      final status = await _service.gateOut(rk);
      return _commit(rk, status, 'COMPLETED', 'Gate OUT berhasil dicatat');
    });
  }

  Future<bool> verify() {
    final rk = found;
    if (rk == null) return Future.value(false);
    return _runAction(() async {
      final status = await _service.verify(rk.id);
      return _commit(rk, status, 'VERIFIED', 'Verifikasi berhasil');
    });
  }

  /// Simpan dokumen + status barunya untuk langkah lanjutan, dan susun pesan
  /// sukses. `fallbackStatus` dipakai bila server tidak mengirim status.
  String _commit(
    RencanaKirimSummary rk,
    String status,
    String fallbackStatus,
    String label,
  ) {
    final next = status.isEmpty ? fallbackStatus : status;
    lastCommitted = rk.copyWith(status: next);
    return '$label. Status: ${gateStatusLabel(next)}';
  }

  Future<bool> _runAction(Future<String> Function() call) async {
    if (actionBusy) {
      return false;
    }
    actionBusy = true;
    resultOk = null;
    resultError = null;
    notifyListeners();
    try {
      resultOk = await call();
      found = null;
      // Gate IN/OUT/Verify tersimpan permanen di server; getar sekali di sini
      // supaya ketiga aksi terasa sama tanpa harus memanggil getar di setiap
      // tombol layar.
      hapticCommit();
      try {
        await _onCommitted?.call();
      } catch (_) {
        // Aksi sudah tersimpan; kegagalan refresh tidak boleh mengubah
        // pesan sukses menjadi error.
      }
      return true;
    } catch (e) {
      resultError = apiErrorMessage(e, 'Gagal mencatat transaksi gate.');
      return false;
    } finally {
      actionBusy = false;
      notifyListeners();
    }
  }
}
