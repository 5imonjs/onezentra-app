import 'dart:async';

import 'package:flutter/foundation.dart';

import 'package:onezentra_mobile/core/network/api_client.dart';
import 'package:onezentra_mobile/features/gate/models/gate_models.dart';
import 'package:onezentra_mobile/features/gate/repositories/gate_repository.dart';

/// UI state for the Check In Point (gate) menu: stats, paged history,
/// the quick-scan lookup and the gate actions.
class GateProvider extends ChangeNotifier {
  GateProvider({GateRepository? repository})
    : _repository = repository ?? GateRepository();
  final GateRepository _repository;

  /// Set in [dispose].
  ///
  /// Every loader here awaits the network and then calls [notifyListeners]. If
  /// the screen is closed while a request is in flight, that call lands after
  /// dispose and ChangeNotifier throws "used after being disposed", crashing
  /// instead of merely skipping a repaint.
  bool _disposed = false;

  /// Safe to call after dispose: a disposed provider simply stops notifying.
  void _notify() {
    if (_disposed) {
      return;
    }
    notifyListeners();
  }

  List<GateTransaction> _items = const [];
  GateStats _stats = const GateStats();
  bool _isLoading = false;
  bool _isLoadingStats = false;
  String? _listError;
  int _currentPage = 1;
  int _lastPage = 1;
  int _total = 0;
  int _itemsRequestId = 0;
  String _search = '';
  Timer? _searchDebounce;

  RencanaKirim? _found;
  bool _lookupBusy = false;
  bool _actionBusy = false;
  GateActionMessage? _message;
  bool _bootstrapped = false;

  List<GateTransaction> get items => _items;
  GateStats get stats => _stats;
  bool get isLoading => _isLoading;
  bool get isLoadingStats => _isLoadingStats;
  String? get listError => _listError;
  int get currentPage => _currentPage;
  int get lastPage => _lastPage;
  int get total => _total;
  String get search => _search;
  RencanaKirim? get found => _found;
  bool get lookupBusy => _lookupBusy;
  bool get actionBusy => _actionBusy;
  GateActionMessage? get message => _message;
  bool get canGoBack => _currentPage > 1;
  bool get canGoForward => _currentPage < _lastPage;

  /// Loads stats + history exactly once, and only when the caller has
  /// `gate.view` — a user without the permission never hits the API.
  Future<void> bootstrap({required bool canView}) async {
    if (_bootstrapped) {
      return;
    }
    _bootstrapped = true;
    if (!canView) {
      return;
    }
    await refresh();
  }

  /// Reloads both the history and the header counters (pull-to-refresh and
  /// the refresh action share this).
  Future<void> refresh() async {
    await Future.wait([loadItems(), loadStats()]);
  }

  Future<void> loadStats() async {
    _isLoadingStats = true;
    _notify();
    try {
      _stats = await _repository.stats();
    } on ApiException catch (e) {
      debugPrint('GateProvider.loadStats: ${e.message}');
    } catch (e, stack) {
      debugPrint('GateProvider.loadStats: unhandled ${e.runtimeType}: $e');
      debugPrintStack(stackTrace: stack, maxFrames: 8);
    } finally {
      _isLoadingStats = false;
      _notify();
    }
  }

  Future<void> loadItems() async {
    var requestId = ++_itemsRequestId;
    _isLoading = true;
    _listError = null;
    _notify();
    try {
      var page = await _repository.list(
        search: _search.isEmpty ? null : _search,
        page: _currentPage,
      );
      if (requestId != _itemsRequestId) {
        return;
      }
      _items = page.items;
      _lastPage = page.lastPage;
      _total = page.total;
    } on ApiException catch (e) {
      if (requestId != _itemsRequestId) {
        return;
      }
      _listError = e.message;
    } catch (e, stack) {
      if (requestId != _itemsRequestId) {
        return;
      }
      debugPrint('GateProvider.loadItems: unhandled ${e.runtimeType}: $e');
      debugPrintStack(stackTrace: stack, maxFrames: 8);
      _listError = 'Terjadi kesalahan tidak terduga. Silakan coba lagi.';
    } finally {
      if (requestId == _itemsRequestId) {
        _isLoading = false;
        _notify();
      }
    }
  }

  /// Debounced so a search request does not fire per keystroke.
  void setSearch(String value) {
    _searchDebounce?.cancel();
    _itemsRequestId++;
    _searchDebounce = Timer(const Duration(milliseconds: 400), () {
      _search = value.trim();
      _currentPage = 1;
      loadItems();
    });
  }

  Future<void> goToPage(int page) async {
    var target = page.clamp(1, _lastPage);
    if (target == _currentPage) {
      return;
    }
    _currentPage = target;
    await loadItems();
  }

  /// Looks up a document by exact PO transporter / nopol. Clears the previous
  /// result so a failed lookup never leaves a stale document on screen.
  Future<void> lookup(String raw) async {
    var nomor = raw.trim();
    if (nomor.isEmpty || _lookupBusy) {
      if (nomor.isEmpty) {
        _message = const GateActionMessage.failure(
          'Masukkan PO / Nopol terlebih dahulu.',
        );
        _notify();
      }
      return;
    }

    _lookupBusy = true;
    // Hasil lama dibuang di awal agar kartu basi tidak terpajang selama
    // pencarian baru berjalan.
    _found = null;
    _message = null;
    _notify();

    try {
      _found = await _repository.findByNoDokumen(nomor);
    } on ApiException catch (e) {
      _found = null;
      _message = GateActionMessage.failure(e.message);
    } catch (e, stack) {
      debugPrint('GateProvider.lookup: unhandled ${e.runtimeType}: $e');
      debugPrintStack(stackTrace: stack, maxFrames: 8);
      _found = null;
      _message = const GateActionMessage.failure(
        'Terjadi kesalahan tidak terduga. Silakan coba lagi.',
      );
    } finally {
      _lookupBusy = false;
      _notify();
    }
  }

  /// Records a Gate IN (INBOUND) for the found document.
  Future<bool> recordGateIn() => _record(
    'INBOUND',
    successMessage: 'Gate IN berhasil dicatat. Status: Check In',
  );

  /// Verifies the found document (status moves to VERIFIED).
  Future<bool> verifyFound() async {
    var id = _found?.id;
    if (id == null || _actionBusy) {
      return false;
    }

    _actionBusy = true;
    _message = null;
    _notify();

    try {
      var status = await _repository.verify(id);
      _found = null;
      _message = GateActionMessage.success(
        'Verifikasi berhasil. Status: ${GateStatus.label(status)}',
      );
      await refresh();
      return true;
    } on ApiException catch (e) {
      _message = GateActionMessage.failure(e.message);
      return false;
    } catch (e, stack) {
      debugPrint('GateProvider.verifyFound: unhandled ${e.runtimeType}: $e');
      debugPrintStack(stackTrace: stack, maxFrames: 8);
      _message = const GateActionMessage.failure(
        'Terjadi kesalahan tidak terduga. Silakan coba lagi.',
      );
      return false;
    } finally {
      _actionBusy = false;
      _notify();
    }
  }

  Future<bool> _record(
    String gateType, {
    required String successMessage,
  }) async {
    var found = _found;
    if (found == null || _actionBusy) {
      return false;
    }

    _actionBusy = true;
    _message = null;
    _notify();

    try {
      await _repository.record(rencanaKirim: found, gateType: gateType);
      _found = null;
      _message = GateActionMessage.success(successMessage);
      await refresh();
      return true;
    } on ApiException catch (e) {
      _message = GateActionMessage.failure(e.message);
      return false;
    } catch (e, stack) {
      debugPrint('GateProvider._record: unhandled ${e.runtimeType}: $e');
      debugPrintStack(stackTrace: stack, maxFrames: 8);
      _message = const GateActionMessage.failure(
        'Terjadi kesalahan tidak terduga. Silakan coba lagi.',
      );
      return false;
    } finally {
      _actionBusy = false;
      _notify();
    }
  }

  /// Drops the found document without recording anything (e.g. when the
  /// operator starts a new search).
  void clearFound() {
    if (_found == null) {
      return;
    }
    _found = null;
    _notify();
  }

  void clearMessage() {
    if (_message == null) {
      return;
    }
    _message = null;
    _notify();
  }

  @override
  void dispose() {
    _disposed = true;
    _itemsRequestId++;
    _searchDebounce?.cancel();
    super.dispose();
  }
}
