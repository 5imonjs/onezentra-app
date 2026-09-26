import 'package:flutter/foundation.dart';
import 'package:onezentra_mobile/core/api_client.dart';
import 'package:onezentra_mobile/features/validation/models/validation_models.dart';
import 'package:onezentra_mobile/features/validation/validation_service.dart';

/// State "Daftar Validasi" di tab Validasi Dokumen — padanan tabel
/// `Daftar Validasi` di `onezentra-web/src/app/validasi-sj/page.tsx`.
///
/// Di-scope ke layar (bukan global) seperti [ValidationSessionProvider]: daftar
/// berisi dokumen depo/user sebelumnya tidak boleh bertahan lintas akun.
///
/// Berbeda dengan `ValidationSessionProvider`, dokumen yang di sini **tidak**
/// sedang dikerjakan — barisnya hanya shortcut membuka detail, jadi tidak ada
/// state half-finished yang perlu di-reset.
class ValidationListProvider extends ChangeNotifier {
  ValidationListProvider(this._service);

  final ValidationService _service;

  List<SjValidationSummary> entries = const [];
  ValidationStats stats = ValidationStats.empty;

  /// Halaman terakhir yang **berhasil** dimuat (0 = belum pernah).
  int page = 0;
  int lastPage = 1;
  int totalRows = 0;

  bool loading = false;
  bool statsLoading = false;
  String? error;
  String? statsError;

  /// Filter status aktif; null = semua status (default, sama seperti web).
  String? statusFilter;

  /// Urutan request; respons basi dibuang agar hasil pencarian lama tidak
  /// menimpa pencarian baru.
  int _token = 0;

  bool get hasMore => page > 0 && page < lastPage;

  /// Muat ulang daftar dari halaman 1 (reset) atau ambil halaman berikutnya.
  ///
  /// `page` hanya di-commit setelah respons sukses, jadi kegagalan saat
  /// "Muat lebih banyak" tidak menyebabkan halaman yang terlewat.
  Future<void> load({bool reset = false, String search = ''}) async {
    if (!reset && !hasMore) {
      return;
    }
    final targetPage = reset ? 1 : page + 1;
    final token = ++_token;
    loading = true;
    error = null;
    notifyListeners();
    try {
      final res = await _service.list(
        search: search,
        status: statusFilter,
        page: targetPage,
      );
      if (token != _token) return;
      entries = reset ? res.entries : [...entries, ...res.entries];
      page = res.currentPage;
      lastPage = res.lastPage;
      totalRows = res.total;
    } catch (e) {
      if (token != _token) return;
      error = apiErrorMessage(e, 'Gagal memuat daftar validasi.');
    } finally {
      if (token == _token) {
        loading = false;
        notifyListeners();
      }
    }
  }

  Future<void> loadMore(String search) async {
    if (loading || !hasMore) {
      return;
    }
    await load(search: search);
  }

  /// Ganti filter status dan muat ulang dari halaman 1.
  ///
  /// Memakai `update` agar `notifyListeners` hanya jalan kalau filter benar-benar
  /// berubah — menekan chip aktif tidak boleh memicu request.
  Future<void> setStatusFilter(String? status) async {
    if (statusFilter == status) {
      return;
    }
    statusFilter = status;
    await load(reset: true);
  }

  Future<void> loadStats() async {
    statsLoading = true;
    statsError = null;
    notifyListeners();
    try {
      stats = await _service.stats();
    } catch (e) {
      // Jangan diam-diam jadi nol — UI perlu membedakan "0" dari "gagal muat".
      statsError = apiErrorMessage(e, 'Gagal memuat statistik validasi.');
    } finally {
      statsLoading = false;
      notifyListeners();
    }
  }
}
