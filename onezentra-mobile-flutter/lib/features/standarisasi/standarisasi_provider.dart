import 'package:flutter/foundation.dart';
import 'package:onezentra_mobile/core/api_client.dart';
import 'package:onezentra_mobile/features/standarisasi/models/standarisasi_models.dart';
import 'package:onezentra_mobile/features/standarisasi/standarisasi_service.dart';
import 'package:onezentra_mobile/widgets/haptics.dart';

/// Pesan satu baris hasil aksi, dengan penanda berhasil/gagal.
///
/// Dipakai snackbar (layar) **dan** kartu pesan di dalam sheet form, jadi
/// warnanya tidak hanya ditentukan di satu tempat.
class StandarisasiNotice {
  const StandarisasiNotice(this.message, {this.isError = false});

  final String message;
  final bool isError;
}

/// State halaman Standarisasi Tumpukan — padanan `useState` +
/// `loadItems` di `onezentra-web/src/app/standarisasi/page.tsx`.
///
/// Di-scope ke layar (bukan global) seperti provider Validasi: daftar standarisasi
/// mengikuti depo user yang sedang login dan tidak boleh bertahan lintas akun.
class StandarisasiProvider extends ChangeNotifier {
  StandarisasiProvider(this._service);

  final StandarisasiService _service;

  List<StandarisasiTumpukan> entries = const [];
  StandarisasiStats stats = StandarisasiStats.empty;

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

  /// Teks pencarian yang sedang dipakai request (sudah lewat debounce).
  String search = '';

  /// Pesan hasil aksi approve/reject/create — string yang sama dengan toast
  /// web, termasuk catatan notifikasi email ke BLC & Admin Distribusi.
  ///
  /// Dibawa sebagai nilai (bukan `String?`) supaya snackbar tidak salah
  /// mewarnakan pesan kegagalan jadi hijau.
  StandarisasiNotice? notice;

  /// Urutan request; respons basi dibuang agar hasil pencarian lama tidak
  /// menimpa pencarian baru.
  int _token = 0;

  bool get hasMore => page > 0 && page < lastPage;

  /// Muat ulang daftar dari halaman 1 (reset) atau ambil halaman berikutnya.
  ///
  /// `page` hanya di-commit setelah respons sukses, jadi kegagalan saat
  /// "Muat lebih banyak" tidak menyebabkan halaman yang terlewat.
  Future<void> load({bool reset = false}) async {
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
      error = apiErrorMessage(e, 'Gagal memuat daftar standarisasi.');
    } finally {
      if (token == _token) {
        loading = false;
        notifyListeners();
      }
    }
  }

  Future<void> loadMore() async {
    if (loading || !hasMore) {
      return;
    }
    await load();
  }

  /// Ganti filter status dan muat ulang dari halaman 1.
  ///
  /// Memakai perbandingan lebih dulu agar `notifyListeners` hanya jalan bila
  /// filter benar-benar berubah — menekan chip aktif tidak boleh memicu
  /// request.
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
      stats = await _service.stats(search: search);
    } catch (e) {
      // Jangan diam-diam jadi nol — UI perlu membedakan "0" dari "gagal muat".
      statsError = apiErrorMessage(e, 'Gagal memuat statistik standarisasi.');
    } finally {
      statsLoading = false;
      notifyListeners();
    }
  }

  /// Buat permintaan standarisasi baru. Backend selalu menyimpannya sebagai
  /// `pending` dan mengirim notifikasi ke BLC — jadi [notice] mengulang
  /// kalimat web: "dikirim untuk approve BLC", bukan "selesai".
  Future<bool> create({
    required int npnId,
    required int tier,
    required int tinggiTumpukan,
  }) async {
    try {
      final created = await _service.create(
        npnId: npnId,
        tier: tier,
        tinggiTumpukan: tinggiTumpukan,
      );
      notice = const StandarisasiNotice(
        'Standarisasi tumpukan dikirim untuk approve BLC.',
      );
      await _refreshAfterAction(created);
      // Permintaan baru benar-benar tersimpan di server, meski belum
      // disetujui siapa pun — jadi getarnya sama dengan commit biasa, bukan
      // seperti navigasi ke dokumen yang sudah final.
      hapticCommit();
      return true;
    } catch (e) {
      notice = StandarisasiNotice(
        apiErrorMessage(e, 'Gagal menyimpan standarisasi.'),
        isError: true,
      );
      notifyListeners();
      return false;
    }
  }

  /// Setujui atau tolak satu baris `pending`.
  ///
  /// Mengembalikan `true` kalau server menerima. Baris hasil keputusan
  /// menggantikan baris lama di daftar, jadi angka di header tidak perlu
  /// menunggu round-trip penuh — tapi [loadStats] tetap dipanggil supaya kartu
  /// ringkasan ikut benar.
  Future<bool> decide(StandarisasiTumpukan row, {required bool approve}) async {
    try {
      final updated = approve
          ? await _service.approve(row.id)
          : await _service.reject(row.id);
      notice = StandarisasiNotice(
        approve
            ? 'Standarisasi disetujui. Notifikasi email dikirim ke BLC & '
                  'Admin Distribusi.'
            : 'Standarisasi ditolak. Notifikasi email dikirim ke BLC & '
                  'Admin Distribusi.',
      );
      await _refreshAfterAction(updated);
      // Persetujuan membuka item validasi untuk semua operator; penolakan
      // menutupnya. Keduanya mengubah hak orang lain, jadi keduanya perlu
      // terasa — ditolak lebih berat karena berlawanan dengan harapan.
      if (approve) {
        hapticCommit();
      } else {
        hapticDestructive();
      }
      return true;
    } catch (e) {
      notice = StandarisasiNotice(
        apiErrorMessage(
          e,
          approve
              ? 'Gagal menyetujui standarisasi.'
              : 'Gagal menolak standarisasi.',
        ),
        isError: true,
      );
      notifyListeners();
      return false;
    }
  }

  /// Ganti baris yang berubah di tempatnya, lalu segarkan daftar & statistik.
  Future<void> _refreshAfterAction(StandarisasiTumpukan updated) async {
    final index = entries.indexWhere((e) => e.id == updated.id);
    if (index >= 0) {
      final next = [...entries];
      next[index] = _merge(updated, entries[index]);
      entries = next;
    }
    notifyListeners();
    await load(reset: true);
    await loadStats();
  }

  /// Endpoint approve/reject mengembalikan baris **tanpa** relasi `npn` pada
  /// sebagian versi payload. Baris lama yang sudah punya produk lebih
  /// informatif daripada menggantinya dengan versi tanpa produk, jadi kedua
  /// sisanya dipertahankan.
  StandarisasiTumpukan _merge(
    StandarisasiTumpukan fresh,
    StandarisasiTumpukan previous,
  ) {
    return StandarisasiTumpukan(
      id: fresh.id,
      npnId: fresh.npnId ?? previous.npnId,
      tier: fresh.tier,
      tinggiTumpukan: fresh.tinggiTumpukan,
      totalTierTinggi: fresh.totalTierTinggi,
      status: fresh.status,
      npn: fresh.npn ?? previous.npn,
      requestedByEmail: fresh.requestedByEmail ?? previous.requestedByEmail,
      approvedByEmail: fresh.approvedByEmail ?? previous.approvedByEmail,
      kodeDepo: fresh.kodeDepo ?? previous.kodeDepo,
      namaDepo: fresh.namaDepo ?? previous.namaDepo,
      createdAt: fresh.createdAt ?? previous.createdAt,
      updatedAt: fresh.updatedAt ?? previous.updatedAt,
    );
  }

  /// Bersihkan setelah aksi (pesan snackbar sudah dibaca layar).
  void clearNotice() {
    if (notice == null) {
      return;
    }
    notice = null;
    notifyListeners();
  }
}
