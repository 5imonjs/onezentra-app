import 'package:flutter/foundation.dart';

import 'package:onezentra_mobile/core/network/api_client.dart';
import 'package:onezentra_mobile/features/gate/models/gate_models.dart';
import 'package:onezentra_mobile/features/gate/repositories/gate_repository.dart';

/// UI state for the Check Out Point menu: scan a finished document and
/// record its Gate OUT.
///
/// Only documents whose status maps to [GateStatusAction.gateOut] (COMPLETED
/// in the current rules) can be checked out — anything else gets the status
/// guide instead of an action button.
class CheckoutProvider extends ChangeNotifier {
  CheckoutProvider({GateRepository? repository})
    : _repository = repository ?? GateRepository();
  final GateRepository _repository;

  /// Set in [dispose].
  ///
  /// Every request here awaits the network and then calls [notifyListeners].
  /// If the screen is closed while a request is in flight, that call lands
  /// after dispose and ChangeNotifier throws "used after being disposed" —
  /// crashing the app rather than just skipping a repaint. A plain flag is the
  /// cheapest correct guard; the alternative (not disposing) would leak the
  /// provider for the rest of the session.
  bool _disposed = false;

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }

  /// Safe to call after dispose: a disposed provider simply stops notifying.
  void _notify() {
    if (_disposed) {
      return;
    }
    notifyListeners();
  }

  RencanaKirim? _found;
  bool _lookupBusy = false;
  bool _actionBusy = false;
  GateActionMessage? _message;

  RencanaKirim? get found => _found;
  bool get lookupBusy => _lookupBusy;
  bool get actionBusy => _actionBusy;
  GateActionMessage? get message => _message;

  /// Looks up a document by exact PO transporter / nopol. A failed lookup
  /// never leaves a stale document on screen.
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
    _message = null;
    _notify();

    try {
      _found = await _repository.findByNoDokumen(nomor);
    } on ApiException catch (e) {
      _found = null;
      _message = GateActionMessage.failure(e.message);
    } catch (e, stack) {
      debugPrint('CheckoutProvider.lookup: unhandled ${e.runtimeType}: $e');
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

  /// Records the Gate OUT (OUTBOUND) for the found document.
  Future<bool> recordOut() async {
    var found = _found;
    if (found == null || _actionBusy) {
      return false;
    }

    _actionBusy = true;
    _message = null;
    _notify();

    try {
      await _repository.record(rencanaKirim: found, gateType: 'OUTBOUND');
      _found = null;
      _message = const GateActionMessage.success(
        'Gate OUT berhasil dicatat. Status: Selesai',
      );
      return true;
    } on ApiException catch (e) {
      _message = GateActionMessage.failure(e.message);
      return false;
    } catch (e, stack) {
      debugPrint('CheckoutProvider.recordOut: unhandled ${e.runtimeType}: $e');
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

  /// Drops the found document without recording anything.
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
}
