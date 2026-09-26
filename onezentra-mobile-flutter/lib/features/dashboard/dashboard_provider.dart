import 'package:flutter/foundation.dart';
import 'package:onezentra_mobile/core/api_client.dart';
import 'package:onezentra_mobile/features/dashboard/dashboard_service.dart';
import 'package:onezentra_mobile/features/dashboard/models/dashboard_models.dart';

/// Lama cache sebelum angka dianggap basi. Sama dengan TTL cache di web
/// (`CACHE_TTL_MS = 60_000` di `dashboardSummary.ts`) supaya kedua aplikasi
/// berperilaku sama: berpindah tab bolak-balik tidak membanjiri server, tapi
/// angka yang sudah satu menit tetap segar.
const dashboardCacheTtl = Duration(seconds: 60);

/// State ringkasan Beranda untuk seluruh aplikasi.
///
/// Satu request untuk semua angka, di-cache di provider supaya berpindah tab
/// tidak memuat ulang. Kembali ke tab Beranda memanggil [load] (bukan
/// [reload]): kalau cache masih segar angkanya dipakai apa adanya, kalau sudah
/// basi (operator baru saja Gate IN / Validasi di tab lain) baru di-request
/// ulang. [reload] dipakai untuk permintaan manual (pull-to-refresh, tombol
/// "Coba lagi").
class DashboardProvider extends ChangeNotifier {
  DashboardProvider([DashboardService? service, DateTime Function()? now])
    : _service = service ?? DashboardService(),
      _now = now ?? DateTime.now;

  final DashboardService _service;

  /// Jam aplikasi — disuntikkan agar batas cache bisa diuji tanpa menunggu
  /// satu menit sungguhan.
  final DateTime Function() _now;

  DashboardSummary summary = DashboardSummary.empty;
  bool loading = false;
  String? error;

  /// Permintaan yang masih berjalan — dipakai agar `load` paralel (mis. tab
  /// Beranda dibuka-cepat) tidak menimpa respons yang lebih baru.
  int _token = 0;

  /// Kapan ringkasan terakhir berhasil dimuat; null = belum pernah.
  DateTime? _loadedAt;

  bool get hasData => summary != DashboardSummary.empty;

  /// Buang state (logout / 401) supaya angka user sebelumnya tidak pernah
  /// terlihat oleh akun berikutnya.
  void reset() {
    _token++;
    summary = DashboardSummary.empty;
    loading = false;
    error = null;
    _loadedAt = null;
    notifyListeners();
  }

  Future<void> load({bool force = false}) async {
    if (loading) {
      return;
    }
    if (!force && hasData && !_isStale) {
      return;
    }
    final token = ++_token;
    loading = true;
    error = null;
    notifyListeners();
    try {
      final next = await _service.summary();
      if (token != _token) {
        return;
      }
      summary = next;
      _loadedAt = _now();
    } catch (e) {
      if (token != _token) {
        return;
      }
      // Jangan pernah mengganti angka lama dengan nol diam-diam: UI
      // membedakan "0" dari "gagal muat" lewat [error]. Waktu muat yang sukses
      // terakhir sengaja tidak diubah supaya load berikutnya tetap mencoba lagi
      // (data yang gagal dimuat tidak boleh dianggap masih segar).
      error = apiErrorMessage(e, 'Gagal memuat ringkasan dashboard.');
    } finally {
      if (token == _token) {
        loading = false;
        notifyListeners();
      }
    }
  }

  /// Permintaan manual: abaikan cache dan ambil angka terbaru.
  Future<void> reload() => load(force: true);

  bool get _isStale {
    final at = _loadedAt;
    if (at == null) {
      return true;
    }
    return _now().difference(at) >= dashboardCacheTtl;
  }
}
