import 'package:dio/dio.dart';
import 'package:onezentra_mobile/core/api_client.dart';
import 'package:onezentra_mobile/features/gate/models/gate_models.dart';

/// Akses API gate — mirror `gateTransactions` + `rencanaKirim.verify` di
/// `onezentra-web/src/lib/api.ts`.
class GateService {
  GateService([Dio? dio]) : _dio = dio ?? ApiClient.instance.dio;

  final Dio _dio;

  Future<RencanaKirimSummary> lookup(String poTransporter) async {
    final res = await _dio.get(
      '/gate-transactions/search/by-dokumen',
      queryParameters: {'po_transporter': poTransporter.trim()},
    );
    final data = res.data as Map<String, dynamic>;
    return RencanaKirimSummary.fromJson(
      Map<String, dynamic>.from(data['data'] as Map),
    );
  }

  Future<void> gateIn(RencanaKirimSummary rk) async {
    await _dio.post(
      '/gate-transactions',
      data: {
        'rencana_kirim_id': rk.id,
        'gate_type': 'INBOUND',
        'nopol': rk.nopol,
        'driver_name': rk.driverName,
        'po_transporter': rk.poTransporter,
      },
    );
  }

  Future<void> gateOut(RencanaKirimSummary rk) async {
    await _dio.post(
      '/gate-transactions',
      data: {
        'rencana_kirim_id': rk.id,
        'gate_type': 'OUTBOUND',
        'nopol': rk.nopol,
        'driver_name': rk.driverName,
        'po_transporter': rk.poTransporter,
      },
    );
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
