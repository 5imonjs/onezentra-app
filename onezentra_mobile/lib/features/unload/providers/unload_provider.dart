import 'package:flutter/foundation.dart';

import 'package:onezentra_mobile/core/network/api_client.dart';
import 'package:onezentra_mobile/features/unload/models/unload_models.dart';
import 'package:onezentra_mobile/features/unload/repositories/unload_repository.dart';

/// UI state for the Bongkar menu: scan a PO, start the unloading, scan
/// lines, then finish (or cancel) the session.
class UnloadProvider extends ChangeNotifier {
  UnloadProvider({UnloadRepository? repository})
    : _repository = repository ?? UnloadRepository();
  final UnloadRepository _repository;

  UnloadSession? _active;
  bool _lookupBusy = false;
  bool _actionBusy = false;
  UnloadActionMessage? _message;

  UnloadSession? get active => _active;
  bool get lookupBusy => _lookupBusy;
  bool get actionBusy => _actionBusy;
  UnloadActionMessage? get message => _message;

  /// Scans a PO barcode and opens its receiving (exact match only).
  /// A failed scan never leaves a stale session on screen.
  Future<void> lookup(String raw) async {
    var code = raw.trim();
    if (code.isEmpty || _lookupBusy) {
      if (code.isEmpty) {
        _message = const UnloadActionMessage.failure(
          'Masukkan / pindai barcode PO terlebih dahulu.',
        );
        notifyListeners();
      }
      return;
    }

    _lookupBusy = true;
    _message = null;
    notifyListeners();

    try {
      _active = await _repository.findByPo(code);
      _message = UnloadActionMessage.success(
        'Bongkar dibuka: ${_active?.poTransporter ?? code}.',
      );
    } on ApiException catch (e) {
      _active = null;
      _message = UnloadActionMessage.failure(e.message);
    } catch (e, stack) {
      debugPrint('UnloadProvider.lookup: unhandled ${e.runtimeType}: $e');
      debugPrintStack(stackTrace: stack, maxFrames: 8);
      _active = null;
      _message = const UnloadActionMessage.failure(
        'Terjadi kesalahan tidak terduga. Silakan coba lagi.',
      );
    } finally {
      _lookupBusy = false;
      notifyListeners();
    }
  }

  /// Starts the unloading, then reloads so totals stay exact.
  Future<bool> startActive() => _run((session) async {
    _active = await _repository.start(session.id);
    _message = const UnloadActionMessage.success(
      'Bongkar dimulai. Pindai tiap produk yang turun.',
    );
  });

  /// Scans one line, then reloads the session so progress stays exact.
  Future<bool> scanLine({
    required String kodeBarang,
    required double actualQty,
    String? namaBarang,
    String? satuan,
    String condition = 'FISIK_BAGUS',
    String? barcode,
    String? notes,
    int? rencanaKirimItemId,
  }) => _run((session) async {
    await _repository.scan(
      receivingId: session.id,
      kodeBarang: kodeBarang,
      actualQty: actualQty,
      namaBarang: namaBarang,
      satuan: satuan,
      condition: condition,
      barcode: barcode,
      notes: notes,
      rencanaKirimItemId: rencanaKirimItemId,
    );
    _active = await _repository.show(session.id);
    var updated = _active;
    _message = UnloadActionMessage.success(
      'Tercatat (${updated?.coveredCount ?? 0}'
      '/${updated?.plan.length ?? 0} produk).',
    );
  });

  /// Finishes the unloading. The PO itself is the closing barcode, exactly
  /// like the web flow.
  Future<bool> completeActive() => _run((session) async {
    var po = session.poTransporter ?? '';
    _active = await _repository.complete(session.id, barcode: po);
    _message = const UnloadActionMessage.success(
      'Bongkar selesai. Dokumen siap untuk Check Out.',
    );
  });

  /// Cancels the running unloading and returns to the scan state.
  Future<bool> cancelActive() => _run((session) async {
    await _repository.cancel(session.id);
    _active = null;
    _message = const UnloadActionMessage.success('Bongkar dibatalkan.');
  });

  Future<bool> _run(Future<void> Function(UnloadSession session) action) async {
    var active = _active;
    if (active == null || _actionBusy) {
      return false;
    }

    _actionBusy = true;
    _message = null;
    notifyListeners();

    try {
      await action(active);
      return true;
    } on ApiException catch (e) {
      _message = UnloadActionMessage.failure(e.message);
      return false;
    } catch (e, stack) {
      debugPrint('UnloadProvider._run: unhandled ${e.runtimeType}: $e');
      debugPrintStack(stackTrace: stack, maxFrames: 8);
      _message = const UnloadActionMessage.failure(
        'Terjadi kesalahan tidak terduga. Silakan coba lagi.',
      );
      return false;
    } finally {
      _actionBusy = false;
      notifyListeners();
    }
  }

  /// Drops the open session without recording anything.
  void clearActive() {
    if (_active == null) {
      return;
    }
    _active = null;
    notifyListeners();
  }

  void clearMessage() {
    if (_message == null) {
      return;
    }
    _message = null;
    notifyListeners();
  }
}
