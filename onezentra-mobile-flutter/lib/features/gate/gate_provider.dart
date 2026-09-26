import 'package:flutter/foundation.dart';
import 'package:onezentra_mobile/core/api_client.dart';
import 'package:onezentra_mobile/features/gate/gate_service.dart';
import 'package:onezentra_mobile/features/gate/models/gate_models.dart';

/// Data gate bersama antar layar: statistik + riwayat transaksi.
///
/// Sengaja **tidak** menyimpan dokumen hasil lookup / hasil aksi: itu milik
/// [GateSessionProvider] yang scoped per layar, sehingga data user sebelumnya
/// tidak pernah bisa terbawa saat berpindah akun atau berpindah tab.
///
/// Semua state di-reset lewat [reset()] ketika sesi berakhir.
class GateProvider extends ChangeNotifier {
  GateProvider([GateService? service]) : _service = service ?? GateService();

  final GateService _service;

  GateStats stats = GateStats.empty;
  List<GateTransactionItem> history = [];

  /// Halaman terakhir yang **berhasil** dimuat (0 = belum pernah).
  int page = 0;
  int lastPage = 1;
  int totalRows = 0;

  bool statsLoading = false;
  bool historyLoading = false;
  String? statsError;
  String? historyError;

  /// Token urut request; respons yang sudah usang dibuang agar hasil lookup
  /// lama tidak menimpa hasil pencarian baru.
  int _historyToken = 0;

  bool get hasMoreHistory => page > 0 && page < lastPage;

  /// Buang seluruh state (dipanggil saat logout / 401).
  void reset() {
    _historyToken++;
    stats = GateStats.empty;
    history = [];
    page = 0;
    lastPage = 1;
    totalRows = 0;
    statsLoading = false;
    historyLoading = false;
    statsError = null;
    historyError = null;
    notifyListeners();
  }

  Future<void> loadStats() async {
    statsLoading = true;
    statsError = null;
    notifyListeners();
    try {
      stats = await _service.stats();
    } catch (e) {
      // Jangan diam-diam jadi nol — UI perlu membedakan "0" dari "gagal muat".
      statsError = apiErrorMessage(e, 'Gagal memuat statistik gate.');
    } finally {
      statsLoading = false;
      notifyListeners();
    }
  }

  /// Muat ulang daftar dari halaman 1 (reset) atau ambil halaman berikutnya.
  ///
  /// `page` hanya di-commit setelah respons sukses, jadi kegagalan saat
  /// "Muat lebih banyak" tidak menyebabkan halaman yang terlewat.
  Future<void> loadHistory({bool reset = false, String search = ''}) async {
    if (!reset && !hasMoreHistory) {
      return;
    }
    final targetPage = reset ? 1 : page + 1;
    final token = ++_historyToken;
    historyLoading = true;
    historyError = null;
    notifyListeners();
    try {
      final res = await _service.history(search: search, page: targetPage);
      if (token != _historyToken) return;
      history = reset ? res.items : [...history, ...res.items];
      page = res.currentPage;
      lastPage = res.lastPage;
      totalRows = res.total;
    } catch (e) {
      if (token != _historyToken) return;
      historyError = apiErrorMessage(e, 'Gagal memuat riwayat gate.');
    } finally {
      if (token == _historyToken) {
        historyLoading = false;
        notifyListeners();
      }
    }
  }

  Future<void> nextPage(String search) async {
    if (historyLoading || !hasMoreHistory) {
      return;
    }
    await loadHistory(search: search);
  }
}
