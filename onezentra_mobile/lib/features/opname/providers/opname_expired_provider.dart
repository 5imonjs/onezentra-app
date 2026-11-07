import 'package:flutter/foundation.dart';

import 'package:onezentra_mobile/core/network/api_client.dart';
import 'package:onezentra_mobile/features/opname/models/opname_expired_models.dart';
import 'package:onezentra_mobile/features/opname/repositories/opname_expired_repository.dart';

/// UI state untuk halaman Opname Expired: daftar wave expired plus meta
/// ringkasan status minggu.
class OpnameExpiredProvider extends ChangeNotifier {
  OpnameExpiredProvider({OpnameExpiredRepository? repository})
    : _repository = repository ?? OpnameExpiredRepository();

  final OpnameExpiredRepository _repository;

  OpnameExpiredList? _data;
  bool _isLoading = false;
  String? _error;
  int _requestId = 0;
  String? _weekStart;
  String? _status;
  bool _bootstrapped = false;
  bool _disposed = false;

  OpnameExpiredList? get data => _data;
  List<OpnameExpiredWave> get waves =>
      _data?.waves ?? const <OpnameExpiredWave>[];
  OpnameExpiredMeta? get meta => _data?.meta;
  String? get weekStart => _weekStart;

  /// Filter status aktif: null = semua, atau EXPIRED/KRITIS/PERHATIAN/AMAN.
  String? get status => _status;
  bool get isLoading => _isLoading;
  String? get error => _error;

  void _notify() {
    if (!_disposed) {
      notifyListeners();
    }
  }

  /// Loads the expired list exactly once, and only when the caller has
  /// `opname.view` — a user without the permission never hits the API.
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
      // Mobile tidak punya kontrol pagination; ambil satu halaman besar
      // (backend membatasi 100) agar daftar monitoring mingguan tidak
      // terpotong di 20 baris pertama.
      var result = await _repository.list(
        weekStart: _weekStart,
        status: _status,
        perPage: 100,
      );
      if (requestId != _requestId) {
        return;
      }
      _data = result;
    } on ApiException catch (e) {
      if (requestId != _requestId) {
        return;
      }
      _error = e.message;
    } catch (e, stack) {
      if (requestId != _requestId) {
        return;
      }
      debugPrint('OpnameExpiredProvider.load: unhandled ${e.runtimeType}: $e');
      debugPrintStack(stackTrace: stack, maxFrames: 8);
      _error = 'Terjadi kesalahan tidak terduga. Silakan coba lagi.';
    } finally {
      if (requestId == _requestId) {
        _isLoading = false;
        _notify();
      }
    }
  }

  void setWeekStart(String? weekStart) {
    _weekStart = weekStart;
    _requestId++;
    load();
  }

  /// Ganti filter status di server agar daftar tetap konsisten walau
  /// jumlah wave melebihi satu halaman.
  Future<void> setStatus(String? status) async {
    if (_status == status) {
      return;
    }
    _status = status;
    _requestId++;
    await load();
  }

  @override
  void dispose() {
    _disposed = true;
    _requestId++;
    super.dispose();
  }
}
