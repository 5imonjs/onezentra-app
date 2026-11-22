import 'package:flutter/foundation.dart';

import 'package:onezentra_mobile/core/network/api_client.dart';
import 'package:onezentra_mobile/features/opname/models/opname_expired_session_models.dart';
import 'package:onezentra_mobile/features/opname/repositories/opname_expired_session_repository.dart';

/// UI state untuk halaman Sesi Opname Expired: daftar sesi + sesi yang sedang
/// dipilih untuk ditampilkan/detail.
class OpnameExpiredSessionProvider extends ChangeNotifier {
  OpnameExpiredSessionProvider({OpnameExpiredSessionRepository? repository})
    : _repository = repository ?? OpnameExpiredSessionRepository();

  final OpnameExpiredSessionRepository _repository;

  List<OpnameExpiredSession> _sessions = const <OpnameExpiredSession>[];
  OpnameExpiredSession? _selected;
  bool _bootstrapped = false;
  bool _isLoading = false;
  String? _error;
  int _requestId = 0;
  bool _disposed = false;

  List<OpnameExpiredSession> get sessions => _sessions;
  OpnameExpiredSession? get selected => _selected;
  bool get isLoading => _isLoading;
  String? get error => _error;

  void _notify() {
    if (!_disposed) {
      notifyListeners();
    }
  }

  Future<void> bootstrap({required bool canView}) async {
    if (_bootstrapped) {
      return;
    }
    _bootstrapped = true;
    if (!canView) {
      return;
    }
    await load();
  }

  Future<void> load() async {
    var requestId = ++_requestId;
    _isLoading = true;
    _error = null;
    _notify();
    try {
      // Beranda Flutter = daftar tugas: hanya sesi yang ditugaskan ke user
      // ini. Pembuatan & penugasan sesi tetap di web — monitoring wave
      // (opname-expired) tidak dibuka dari mobile.
      var result = await _repository.list(mine: true, activeOnly: true);
      if (requestId != _requestId) {
        return;
      }
      _sessions = result;
    } on ApiException catch (e) {
      if (requestId != _requestId) {
        return;
      }
      _error = e.message;
    } catch (e, stack) {
      if (requestId != _requestId) {
        return;
      }
      debugPrint(
        'OpnameExpiredSessionProvider.load: unhandled ${e.runtimeType}: $e',
      );
      debugPrintStack(stackTrace: stack, maxFrames: 8);
      _error = 'Terjadi kesalahan tidak terduga. Silakan coba lagi.';
    } finally {
      if (requestId == _requestId) {
        _isLoading = false;
        _notify();
      }
    }
  }

  /// Membuka detail sesi (dan memuatnya bila belum terpilih).
  /// Kembali dari detail ke daftar tanpa memuat ulang jaringan.
  void clearSelection() {
    if (_disposed) {
      return;
    }
    _selected = null;
    _notify();
  }

  Future<OpnameExpiredSession?> show(int id) async {
    var requestId = ++_requestId;
    _isLoading = true;
    _error = null;
    _notify();
    try {
      var session = await _repository.show(id);
      if (requestId != _requestId) {
        return null;
      }
      _selected = session;
      return session;
    } on ApiException catch (e) {
      if (requestId != _requestId) {
        return null;
      }
      _error = e.message;
    } catch (e, stack) {
      if (requestId != _requestId) {
        return null;
      }
      debugPrint(
        'OpnameExpiredSessionProvider.show: unhandled ${e.runtimeType}: $e',
      );
      debugPrintStack(stackTrace: stack, maxFrames: 8);
      _error = 'Terjadi kesalahan tidak terduga. Silakan coba lagi.';
    } finally {
      if (requestId == _requestId) {
        _isLoading = false;
        _notify();
      }
    }
    return _selected;
  }

  /// Response aksi memuat seluruh atribut sesi tetapi TANPA items. Patch
  /// state lokal dari respons itu — memanggil show() di sini mengunduh ulang
  /// seluruh detail (ribuan baris) setelah setiap klik.
  void _applyUpdatedSession(OpnameExpiredSession updated) {
    var current = _selected;
    if (current == null || current.id != updated.id) {
      _selected = updated;
      return;
    }
    _selected = updated.withItems(
      updated.items.isNotEmpty ? updated.items : current.items,
    );
  }

  Future<void> _execute(Future<OpnameExpiredSession> Function() action) async {
    var requestId = ++_requestId;
    _isLoading = true;
    _error = null;
    _notify();
    try {
      var updated = await action();
      if (requestId != _requestId) {
        return;
      }
      _applyUpdatedSession(updated);
      _notify();
    } on ApiException catch (e) {
      if (requestId != _requestId) {
        return;
      }
      _error = e.message;
      _notify();
    } catch (e, stack) {
      if (requestId != _requestId) {
        return;
      }
      debugPrint(
        'OpnameExpiredSessionProvider: unhandled ${e.runtimeType}: $e',
      );
      debugPrintStack(stackTrace: stack, maxFrames: 8);
      _error = 'Terjadi kesalahan tidak terduga. Silakan coba lagi.';
      _notify();
    } finally {
      if (requestId == _requestId) {
        _isLoading = false;
        _notify();
      }
    }
  }

  Future<void> start(int id) => _execute(() => _repository.start(id));

  Future<void> addWaves(int id, List<int> waveIds) =>
      _execute(() => _repository.addWaves(id, waveIds));

  /// Simpan hasil hitung dari sheet input: sheet memakai state simpan
  /// sendiri (tanpa spinner global), jadi method ini mengembalikan pesan
  /// error (null = sukses) dan patch baris yang berubah di state lokal.
  /// [photoPath] mengisi foto bukti wajib untuk kondisi bermasalah.
  Future<String?> verifyItem(
    int sessionId,
    int itemId,
    Map<String, dynamic> data, {
    String? photoPath,
  }) async {
    try {
      var result = await _repository.verifyItem(
        sessionId,
        itemId,
        data,
        photoPath: photoPath,
      );
      // Repository mengembalikan SELURUH body HTTP: payload ada di `data`.
      // Membaca result['item'] membuat patch tak pernah jalan dengan API asli
      // (baris tampak belum terhitung setelah petugas menyimpan hitungan).
      var body = result is Map ? result : null;
      var payload = body?['data'] is Map ? body!['data'] : body;
      var rawItem = payload is Map ? payload['item'] : null;
      var rawSession = payload is Map ? payload['session'] : null;
      var current = _selected;

      if (current != null && current.id == sessionId) {
        var next = current;
        if (rawItem is Map) {
          var verified = OpnameExpiredSessionItem.fromJson(
            Map<String, dynamic>.from(rawItem),
          );
          var items = List<OpnameExpiredSessionItem>.from(current.items);
          var index = items.indexWhere((i) => i.id == verified.id);
          if (index >= 0) {
            // Patch field hitung saja — label batch & acuan berasal dari
            // detail dan tidak boleh hilang setelah verifikasi.
            items[index] = items[index].withVerification(verified);
            next = current.withItems(items);
          }
        }
        _selected = next;
        if (rawSession is Map) {
          // Status REVISI → IN_PROGRESS dan penanda input selesai juga ikut
          // berubah di server saat verifikasi.
          var updated = OpnameExpiredSession.fromJson(
            Map<String, dynamic>.from(rawSession),
          );
          _applyUpdatedSession(updated);
          // Daftar ikut terpatch: jumlah "dihitung/sisa" di kartu sesi
          // segera baru setelah input, tanpa reload dari server.
          _patchSessionList(updated);
        }
        _notify();
      }
      return null;
    } on ApiException catch (e) {
      return e.message;
    } catch (e, stack) {
      debugPrint(
        'OpnameExpiredSessionProvider.verifyItem: unhandled '
        '${e.runtimeType}: $e',
      );
      debugPrintStack(stackTrace: stack, maxFrames: 8);
      return 'Terjadi kesalahan tidak terduga. Silakan coba lagi.';
    }
  }

  /// Daftar sesi ikut terpatch setelah verifikasi: jumlah "dihitung/sisa"
  /// di kartu sesi langsung baru. Respons verify server tidak membawa
  /// item detil maupun `verified_count`, jadi gunakan sesi yang sudah
  /// di-patch dan hitung jumlah yang terverifikasi.
  void _patchSessionList(OpnameExpiredSession updated) {
    var selected = _selected;
    if (selected == null || selected.id != updated.id) {
      return;
    }
    var verifiedCount = selected.items.where((item) => item.isVerified).length;
    _sessions = _sessions
        .map(
          (session) => session.id == updated.id
              ? selected.withVerifiedCount(verifiedCount)
              : session,
        )
        .toList();
  }

  /// Tandai input selesai (penanda, bukan approval) lalu patch state lokal.
  Future<void> markInputComplete(int id) =>
      _execute(() => _repository.markComplete(id));

  // Approve/revise sengaja tidak ada di mobile: petugas hanya menginput,
  // validasi dilakukan di sistem web (pemisahan tugas).

  Future<void> cancel(int id, {String? notes}) =>
      _execute(() => _repository.cancel(id, notes: notes));

  @override
  void dispose() {
    _disposed = true;
    _requestId++;
    super.dispose();
  }
}
