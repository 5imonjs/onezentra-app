import 'package:dio/dio.dart';
import 'package:onezentra_mobile/core/api_client.dart';
import 'package:onezentra_mobile/features/gate/models/gate_models.dart';

/// Akses API gate — mirror `gateTransactions` + `rencanaKirim.verify` di
/// `onezentra-web/src/lib/api.ts`.
class GateService {
  GateService([Dio? dio]) : _dio = dio ?? ApiClient.instance.dio;

  final Dio _dio;

  /// `nomor` bisa berupa PO transporter ATAU plat kendaraan — backend
  /// mencocokkan keduanya (lihat `GateTransactionController::byNoDokumen`).
  Future<RencanaKirimSummary> lookup(String nomor) async {
    final res = await _dio.get(
      '/gate-transactions/search/by-dokumen',
      queryParameters: {'po_transporter': nomor.trim()},
    );
    final data = res.data as Map<String, dynamic>;
    return RencanaKirimSummary.fromJson(
      Map<String, dynamic>.from(data['data'] as Map),
    );
  }

  /// Catat Gate IN. Mengembalikan status terbaru rencana kirim (dari
  /// `data.rencana_kirim.status`) supaya client bisa langsung menawarkan
  /// langkah berikutnya tanpa lookup ulang.
  Future<String> gateIn(RencanaKirimSummary rk) async {
    final res = await _dio.post(
      '/gate-transactions',
      data: {
        'rencana_kirim_id': rk.id,
        'gate_type': 'INBOUND',
        'nopol': rk.nopol,
        'driver_name': rk.driverName,
        'po_transporter': rk.poTransporter,
      },
    );
    return _rencanaKirimStatus(res.data);
  }

  Future<String> gateOut(RencanaKirimSummary rk) async {
    final res = await _dio.post(
      '/gate-transactions',
      data: {
        'rencana_kirim_id': rk.id,
        'gate_type': 'OUTBOUND',
        'nopol': rk.nopol,
        'driver_name': rk.driverName,
        'po_transporter': rk.poTransporter,
      },
    );
    return _rencanaKirimStatus(res.data);
  }

  /// Status rencana kirim pada respons pencatatan gate; string kosong bila
  /// server tidak mengirimnya (pemanggil memakai status yang sudah diketahui).
  String _rencanaKirimStatus(Object? body) {
    final data = ((body as Map?)?['data'] as Map?) ?? const {};
    final rencana = data['rencana_kirim'];
    return rencana is Map ? '${rencana['status'] ?? ''}' : '';
  }

  Future<String> verify(int rencanaKirimId) async {
    final res = await _dio.post('/rencana-kirim/$rencanaKirimId/verify');
    final data = ((res.data as Map)['data'] as Map?) ?? {};
    return '${data['status'] ?? ''}';
  }

  Future<GateStats> stats() async {
    final res = await _dio.get('/gate-transactions/stats');
    final data = ((res.data as Map)['data'] as Map?) ?? {};
    return GateStats.fromJson(Map<String, dynamic>.from(data));
  }

  Future<GateHistoryPage> history({String search = '', int page = 1}) async {
    final res = await _dio.get(
      '/gate-transactions',
      queryParameters: {'search': search, 'page': page, 'per_page': 20},
    );
    final body = res.data as Map<String, dynamic>;
    final items = ((body['data'] as List?) ?? [])
        .whereType<Map>()
        .map((e) => GateTransactionItem.fromJson(Map<String, dynamic>.from(e)))
        .toList();
    return GateHistoryPage(
      items: items,
      currentPage: (body['current_page'] as num?)?.toInt() ?? page,
      lastPage: (body['last_page'] as num?)?.toInt() ?? page,
      total: (body['total'] as num?)?.toInt() ?? items.length,
    );
  }
}

class GateHistoryPage {
  const GateHistoryPage({
    required this.items,
    required this.currentPage,
    required this.lastPage,
    required this.total,
  });

  final List<GateTransactionItem> items;
  final int currentPage;
  final int lastPage;
  final int total;
}
