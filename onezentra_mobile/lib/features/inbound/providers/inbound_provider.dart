import 'dart:async';

import 'package:flutter/foundation.dart';

import 'package:onezentra_mobile/core/network/api_client.dart';
import 'package:onezentra_mobile/features/inbound/models/inbound_models.dart';
import 'package:onezentra_mobile/features/inbound/repositories/inbound_repository.dart';

/// UI state for the Penerimaan history: paged inbound records plus the
/// opened record with its received lines.
class InboundProvider extends ChangeNotifier {
  InboundProvider({InboundRepository? repository})
    : _repository = repository ?? InboundRepository();
  final InboundRepository _repository;

  List<Receiving> _items = const [];
  bool _isLoading = false;
  String? _listError;
  int _currentPage = 1;
  int _lastPage = 1;
  int _total = 0;
  int _itemsRequestId = 0;
  int _detailRequestId = 0;
  String _search = '';
  Timer? _searchDebounce;

  Receiving? _open;
  bool _detailBusy = false;
  String? _detailError;
  bool _bootstrapped = false;
  bool _disposed = false;

  void _notify() {
    if (!_disposed) {
      notifyListeners();
    }
  }

  List<Receiving> get items => _items;
  bool get isLoading => _isLoading;
  String? get listError => _listError;
  int get currentPage => _currentPage;
  int get lastPage => _lastPage;
  int get total => _total;
  String get search => _search;
  Receiving? get open => _open;
  bool get detailBusy => _detailBusy;
  String? get detailError => _detailError;
  bool get canGoBack => _currentPage > 1;
  bool get canGoForward => _currentPage < _lastPage;

  /// Loads the history exactly once, and only when the caller has
  /// `receiving.view` — a user without the permission never hits the API.
  Future<void> bootstrap({required bool canView}) async {
    if (_bootstrapped) {
      return;
    }
    _bootstrapped = true;
    if (!canView) {
      return;
    }
    await loadItems();
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
      debugPrint('InboundProvider.loadItems: unhandled ${e.runtimeType}: $e');
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

  /// Opens one record with its received lines.
  Future<void> openDetail(int id) async {
    var requestId = ++_detailRequestId;
    _detailBusy = true;
    _detailError = null;
    _notify();
    try {
      var receiving = await _repository.show(id);
      if (requestId != _detailRequestId) {
        return;
      }
      _open = receiving;
    } on ApiException catch (e) {
      if (requestId != _detailRequestId) {
        return;
      }
      _detailError = e.message;
    } catch (e, stack) {
      if (requestId != _detailRequestId) {
        return;
      }
      debugPrint('InboundProvider.openDetail: unhandled ${e.runtimeType}: $e');
      debugPrintStack(stackTrace: stack, maxFrames: 8);
      _detailError = 'Terjadi kesalahan tidak terduga. Silakan coba lagi.';
    } finally {
      if (requestId == _detailRequestId) {
        _detailBusy = false;
        _notify();
      }
    }
  }

  /// Closes the opened record and returns to the history list.
  void closeDetail() {
    if (_open == null && _detailError == null && !_detailBusy) {
      return;
    }
    _detailRequestId++;
    _open = null;
    _detailError = null;
    _detailBusy = false;
    _notify();
  }

  @override
  void dispose() {
    _disposed = true;
    _itemsRequestId++;
    _detailRequestId++;
    _searchDebounce?.cancel();
    super.dispose();
  }
}
