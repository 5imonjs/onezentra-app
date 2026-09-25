import 'package:flutter/foundation.dart';
import 'package:onezentra_mobile/core/api_client.dart';
import 'package:onezentra_mobile/features/gate/gate_service.dart';
import 'package:onezentra_mobile/features/gate/models/gate_models.dart';

/// State layar Check In Point — pola sama seperti `AuthProvider`:
/// service di-inject agar mudah diuji.
class GateProvider extends ChangeNotifier {
  GateProvider([GateService? service]) : _service = service ?? GateService();

  final GateService _service;

  GateStats stats = GateStats.empty;
  RencanaKirimSummary? found;
  List<GateTransactionItem> history = [];
  int page = 1;
  int lastPage = 1;
  int totalRows = 0;

  bool statsLoading = false;
  bool lookupBusy = false;
  bool actionBusy = false;
  bool historyLoading = false;
  String? resultOk;
  String? resultError;
  String? historyError;

  Future<void> loadStats() async {
    statsLoading = true;
    notifyListeners();
    try {
      stats = await _service.stats();
    } catch (_) {
      stats = GateStats.empty;
    } finally {
      statsLoading = false;
      notifyListeners();
    }
  }

  Future<void> lookup(String code) async {
    final value = code.trim();
    if (value.isEmpty || lookupBusy) {
      return;
    }
    lookupBusy = true;
    resultOk = null;
    resultError = null;
    notifyListeners();
    try {
      found = await _service.lookup(value);
    } catch (e) {
      found = null;
      resultError = apiErrorMessage(e, 'Rencana kirim tidak ditemukan');
    } finally {
      lookupBusy = false;
      notifyListeners();
    }
  }

  void clearFound() {
    found = null;
    resultOk = null;
    resultError = null;
    notifyListeners();
  }

  Future<bool> gateIn() async {
    final rk = found;
    if (rk == null || actionBusy) {
      return false;
    }
    return _runAction(() async {
      await _service.gateIn(rk);
      return 'Gate IN berhasil dicatat. Status: Check In';
    });
  }

  Future<bool> gateOut() async {
    final rk = found;
    if (rk == null || actionBusy) {
      return false;
    }
    return _runAction(() async {
      await _service.gateOut(rk);
      return 'Gate OUT berhasil dicatat. Status: Selesai';
    });
  }

  Future<bool> verify() async {
    final rk = found;
    if (rk == null || actionBusy) {
      return false;
    }
    return _runAction(() async {
      final status = await _service.verify(rk.id);
      return 'Verifikasi berhasil. Status: ${gateStatusLabel(status)}';
    });
  }

  Future<bool> _runAction(Future<String> Function() call) async {
    actionBusy = true;
    resultOk = null;
    resultError = null;
    notifyListeners();
    try {
      resultOk = await call();
      found = null;
      await Future.wait([loadStats(), loadHistory(reset: true)]);
      return true;
    } catch (e) {
      resultError = apiErrorMessage(e, 'Gagal mencatat transaksi gate.');
      return false;
    } finally {
      actionBusy = false;
      notifyListeners();
    }
  }

  Future<void> loadHistory({bool reset = false, String search = ''}) async {
    if (reset) {
      page = 1;
      history = [];
    }
    historyLoading = true;
    historyError = null;
    notifyListeners();
    try {
      final res = await _service.history(search: search, page: page);
      history = reset ? res.items : [...history, ...res.items];
      page = res.currentPage;
      lastPage = res.lastPage;
      totalRows = res.total;
    } catch (e) {
      historyError = apiErrorMessage(e, 'Gagal memuat riwayat gate.');
    } finally {
      historyLoading = false;
      notifyListeners();
    }
  }

  Future<void> nextPage(String search) async {
    if (historyLoading || page >= lastPage) {
      return;
    }
    page += 1;
    await loadHistory(search: search);
  }
}
