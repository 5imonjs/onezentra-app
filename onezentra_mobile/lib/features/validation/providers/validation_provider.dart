import 'dart:async';

import 'package:flutter/foundation.dart';

import 'package:onezentra_mobile/core/network/api_client.dart';
import 'package:onezentra_mobile/features/validation/models/validation_models.dart';
import 'package:onezentra_mobile/features/validation/repositories/validation_repository.dart';

/// UI state for the Validasi SJ menu: stats, paged history, the PO scan that
/// opens a session, and the per-line validation actions.
class ValidationProvider extends ChangeNotifier {
  ValidationProvider({ValidationRepository? repository})
    : _repository = repository ?? ValidationRepository();
  final ValidationRepository _repository;

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

  List<SjValidation> _items = const [];
  ValidationStats _stats = const ValidationStats();
  bool _isLoading = false;
  String? _listError;
  int _currentPage = 1;
  int _lastPage = 1;
  int _total = 0;
  String _search = '';
  Timer? _searchDebounce;

  SjValidation? _active;
  bool _startBusy = false;
  bool _actionBusy = false;
  ValidationActionMessage? _message;
  bool _bootstrapped = false;

  List<SjValidation> get items => _items;
  ValidationStats get stats => _stats;
  bool get isLoading => _isLoading;
  String? get listError => _listError;
  int get currentPage => _currentPage;
  int get lastPage => _lastPage;
  int get total => _total;
  String get search => _search;
  SjValidation? get active => _active;
  bool get startBusy => _startBusy;
  bool get actionBusy => _actionBusy;
  ValidationActionMessage? get message => _message;
  bool get canGoBack => _currentPage > 1;
  bool get canGoForward => _currentPage < _lastPage;

  /// Loads stats + history exactly once, and only when the caller has
  /// `sj_validation.view` — a user without the permission never hits the API.
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
    try {
      _stats = await _repository.stats();
    } on ApiException catch (e) {
      debugPrint('ValidationProvider.loadStats: ${e.message}');
    } catch (e, stack) {
      debugPrint(
        'ValidationProvider.loadStats: unhandled ${e.runtimeType}: $e',
      );
      debugPrintStack(stackTrace: stack, maxFrames: 8);
    }
    _notify();
  }

  Future<void> loadItems() async {
    _isLoading = true;
    _listError = null;
    _notify();
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
      debugPrint(
        'ValidationProvider.loadItems: unhandled ${e.runtimeType}: $e',
      );
      debugPrintStack(stackTrace: stack, maxFrames: 8);
      _listError = 'Terjadi kesalahan tidak terduga. Silakan coba lagi.';
    } finally {
      _isLoading = false;
      _notify();
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

  /// Scans a PO barcode and opens (or resumes) its validation session.
  /// A failed scan never leaves a stale session on screen.
  Future<void> start(String raw) async {
    var code = raw.trim();
    if (code.isEmpty || _startBusy) {
      if (code.isEmpty) {
        _message = const ValidationActionMessage.failure(
          'Masukkan / pindai barcode PO terlebih dahulu.',
        );
        _notify();
      }
      return;
    }

    _startBusy = true;
    // Sesi lama dibuang di awal agar kartu basi tidak terpajang selama
    // pemindaian baru berjalan.
    _active = null;
    _message = null;
    _notify();

    try {
      _active = await _repository.startByCode(code);
      _message = ValidationActionMessage.success(
        'Sesi validasi dibuka: ${_active?.document?.poTransporter ?? code} '
        '(${_active?.validatedCount ?? 0}/${_active?.items.length ?? 0} item).',
      );
    } on ApiException catch (e) {
      _active = null;
      _message = ValidationActionMessage.failure(e.message);
    } catch (e, stack) {
      debugPrint('ValidationProvider.start: unhandled ${e.runtimeType}: $e');
      debugPrintStack(stackTrace: stack, maxFrames: 8);
      _active = null;
      _message = const ValidationActionMessage.failure(
        'Terjadi kesalahan tidak terduga. Silakan coba lagi.',
      );
    } finally {
      _startBusy = false;
      _notify();
    }
  }

  /// Opens a finished/running session from the history list.
  Future<void> openSession(int id) async {
    _actionBusy = true;
    _message = null;
    _notify();
    try {
      _active = await _repository.show(id);
    } on ApiException catch (e) {
      _message = ValidationActionMessage.failure(e.message);
    } catch (e, stack) {
      debugPrint(
        'ValidationProvider.openSession: unhandled ${e.runtimeType}: $e',
      );
      debugPrintStack(stackTrace: stack, maxFrames: 8);
      _message = const ValidationActionMessage.failure(
        'Terjadi kesalahan tidak terduga. Silakan coba lagi.',
      );
    } finally {
      _actionBusy = false;
      _notify();
    }
  }

  /// Validates one line, then reloads the session so progress stays exact.
  Future<bool> validateItem({
    required int itemId,
    required double actualQty,
    String? barcode,
    String condition = 'FISIK_BAGUS',
    String? expiredDate,
    String? notes,
    int? tier,
    int? tinggiTumpukan,
  }) async {
    var active = _active;
    if (active == null || _actionBusy) {
      return false;
    }

    _actionBusy = true;
    _message = null;
    _notify();

    try {
      await _repository.scanItem(
        validationId: active.id,
        itemId: itemId,
        actualQty: actualQty,
        barcode: barcode,
        condition: condition,
        expiredDate: expiredDate,
        notes: notes,
        tier: tier,
        tinggiTumpukan: tinggiTumpukan,
      );
      _active = await _repository.show(active.id);
      var updated = _active;
      _message = ValidationActionMessage.success(
        'Item divalidasi (${updated?.validatedCount ?? 0}'
        '/${updated?.items.length ?? 0}).',
      );
      return true;
    } on ApiException catch (e) {
      _message = ValidationActionMessage.failure(e.message);
      return false;
    } catch (e, stack) {
      debugPrint(
        'ValidationProvider.validateItem: unhandled ${e.runtimeType}: $e',
      );
      debugPrintStack(stackTrace: stack, maxFrames: 8);
      _message = const ValidationActionMessage.failure(
        'Terjadi kesalahan tidak terduga. Silakan coba lagi.',
      );
      return false;
    } finally {
      _actionBusy = false;
      _notify();
    }
  }

  /// Submits the standarisasi tumpukan for a product, then reloads the
  /// session so the line reflects the new `pending` record. Returns true
  /// when the submission was accepted (approval still happens on web).
  Future<bool> submitStandarisasi({
    required int npnId,
    required int tier,
    required int tinggiTumpukan,
  }) async {
    var active = _active;
    if (active == null || _actionBusy) {
      return false;
    }

    _actionBusy = true;
    _message = null;
    _notify();

    try {
      await _repository.createStandarisasi(
        npnId: npnId,
        tier: tier,
        tinggiTumpukan: tinggiTumpukan,
      );
      _active = await _repository.show(active.id);
      _message = const ValidationActionMessage.success(
        'Standarisasi dikirim untuk approve BLC. '
        'Validasi dibuka setelah disetujui.',
      );
      return true;
    } on ApiException catch (e) {
      _message = ValidationActionMessage.failure(e.message);
      return false;
    } catch (e, stack) {
      debugPrint(
        'ValidationProvider.submitStandarisasi: unhandled ${e.runtimeType}: $e',
      );
      debugPrintStack(stackTrace: stack, maxFrames: 8);
      _message = const ValidationActionMessage.failure(
        'Terjadi kesalahan tidak terduga. Silakan coba lagi.',
      );
      return false;
    } finally {
      _actionBusy = false;
      _notify();
    }
  }

  /// Finishes the session. The server rejects it while lines are still
  /// pending — that message is shown as-is so the operator knows how many
  /// lines are left.
  Future<bool> completeActive() async {
    var active = _active;
    if (active == null || _actionBusy) {
      return false;
    }

    _actionBusy = true;
    _message = null;
    _notify();

    try {
      _active = await _repository.complete(active.id);
      _message = const ValidationActionMessage.success(
        'Validasi selesai. Email validasi terkirim ke BLC.',
      );
      await refresh();
      return true;
    } on ApiException catch (e) {
      _message = ValidationActionMessage.failure(e.message);
      return false;
    } catch (e, stack) {
      debugPrint(
        'ValidationProvider.completeActive: unhandled ${e.runtimeType}: $e',
      );
      debugPrintStack(stackTrace: stack, maxFrames: 8);
      _message = const ValidationActionMessage.failure(
        'Terjadi kesalahan tidak terduga. Silakan coba lagi.',
      );
      return false;
    } finally {
      _actionBusy = false;
      _notify();
    }
  }

  /// Cancels the running session and returns to the scan state.
  Future<bool> cancelActive() async {
    var active = _active;
    if (active == null || _actionBusy) {
      return false;
    }

    _actionBusy = true;
    _message = null;
    _notify();

    try {
      await _repository.cancel(active.id);
      _active = null;
      _message = const ValidationActionMessage.success(
        'Sesi validasi dibatalkan.',
      );
      await refresh();
      return true;
    } on ApiException catch (e) {
      _message = ValidationActionMessage.failure(e.message);
      return false;
    } catch (e, stack) {
      debugPrint(
        'ValidationProvider.cancelActive: unhandled ${e.runtimeType}: $e',
      );
      debugPrintStack(stackTrace: stack, maxFrames: 8);
      _message = const ValidationActionMessage.failure(
        'Terjadi kesalahan tidak terduga. Silakan coba lagi.',
      );
      return false;
    } finally {
      _actionBusy = false;
      _notify();
    }
  }

  /// Melaporkan satu label batch sudah tercetak fisik, lalu memuat ulang
  /// sesi agar badge cetak sinkron. Gagal lapor tidak membatalkan cetakan
  /// (paritas web) — pesannya disampaikan lewat [_message].
  /// Mengembalikan true bila status cetak tersimpan di server.
  Future<bool> markLabelPrinted(int batchId) async {
    var active = _active;
    if (active == null || _actionBusy) {
      return false;
    }

    _actionBusy = true;
    _notify();
    try {
      await _repository.markPrinted(batchId);
      _active = await _repository.show(active.id);
      return true;
    } on ApiException catch (e) {
      _message = ValidationActionMessage.failure(
        'Label tercetak, tapi status cetak gagal dilaporkan: ${e.message}',
      );
      return false;
    } catch (e, stack) {
      debugPrint(
        'ValidationProvider.markLabelPrinted: unhandled ${e.runtimeType}: $e',
      );
      debugPrintStack(stackTrace: stack, maxFrames: 8);
      _message = const ValidationActionMessage.failure(
        'Label tercetak, tapi status cetak gagal dilaporkan.',
      );
      return false;
    } finally {
      _actionBusy = false;
      _notify();
    }
  }

  /// Drops the open session without recording anything (e.g. when the
  /// operator starts a new PO scan).
  void clearActive() {
    if (_active == null) {
      return;
    }
    _active = null;
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
    _searchDebounce?.cancel();
    super.dispose();
  }
}
