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
      var result = await _repository.list();
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

  Future<void> _execute(Future<dynamic> Function() action) async {
    var requestId = ++_requestId;
    _isLoading = true;
    _error = null;
    _notify();
    try {
      await action();
      if (requestId != _requestId) {
        return;
      }
      if (_selected != null) {
        await show(_selected!.id);
      } else {
        await load();
      }
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

  Future<void> verifyItem(
    int sessionId,
    int itemId,
    Map<String, dynamic> data,
  ) => _execute(() => _repository.verifyItem(sessionId, itemId, data));

  Future<void> submit(int id) => _execute(() => _repository.submit(id));

  Future<void> approve(int id) => _execute(() => _repository.approve(id));

  Future<void> revise(int id, String reason) =>
      _execute(() => _repository.revise(id, reason));

  Future<void> cancel(int id, {String? notes}) =>
      _execute(() => _repository.cancel(id, notes: notes));

  @override
  void dispose() {
    _disposed = true;
    _requestId++;
    super.dispose();
  }
}
