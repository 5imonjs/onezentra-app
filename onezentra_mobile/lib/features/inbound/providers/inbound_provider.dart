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
  String _search = '';
  Timer? _searchDebounce;

  Receiving? _open;
  bool _detailBusy = false;
  String? _detailError;
  bool _bootstrapped = false;

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
    _isLoading = true;
    _listError = null;
    notifyListeners();
    try {
      var page = await _repository.list(
        search: _search.isEmpty ? null : _search,
        page: _currentPage,
      );
      _items = page.items;
      _lastPage = page.lastPage;
      _total = page.total;
    } on ApiException catch (e) {
      _listError = e.message;
    } catch (e, stack) {
      debugPrint('InboundProvider.loadItems: unhandled ${e.runtimeType}: $e');
      debugPrintStack(stackTrace: stack, maxFrames: 8);
      _listError = 'Terjadi kesalahan tidak terduga. Silakan coba lagi.';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Debounced so a search request does not fire per keystroke.
  void setSearch(String value) {
    _searchDebounce?.cancel();
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
    _detailBusy = true;
    _detailError = null;
    notifyListeners();
    try {
      _open = await _repository.show(id);
    } on ApiException catch (e) {
      _detailError = e.message;
    } catch (e, stack) {
      debugPrint('InboundProvider.openDetail: unhandled ${e.runtimeType}: $e');
      debugPrintStack(stackTrace: stack, maxFrames: 8);
      _detailError = 'Terjadi kesalahan tidak terduga. Silakan coba lagi.';
    } finally {
      _detailBusy = false;
      notifyListeners();
    }
  }

  /// Closes the opened record and returns to the history list.
  void closeDetail() {
    if (_open == null && _detailError == null) {
      return;
    }
    _open = null;
    _detailError = null;
    notifyListeners();
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    super.dispose();
  }
}
