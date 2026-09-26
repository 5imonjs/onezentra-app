import 'package:dio/dio.dart';
import 'package:onezentra_mobile/core/api_client.dart';
import 'package:onezentra_mobile/features/dashboard/models/dashboard_models.dart';

/// Akses API Beranda — satu request `GET /dashboard/summary` untuk seluruh
/// angka di layar.
///
/// Endpoint ini sama dengan yang dipakai web (`dashboard.summary` di
/// `lib/api.ts`), jadi tidak ada kontrak baru di backend. Ringkasan
/// transactional per modul (gate hari ini, validasi berjalan) tetap diambil
/// dari endpoint modulnya masing-masing oleh provider layar tersebut.
class DashboardService {
  DashboardService([Dio? dio]) : _dio = dio ?? ApiClient.instance.dio;

  final Dio _dio;

  /// [kodeDepo] opsional hanya berlaku untuk user global; user depo otomatis
  /// ter-scope ke deponya oleh backend.
  Future<DashboardSummary> summary({String kodeDepo = ''}) async {
    final res = await _dio.get(
      '/dashboard/summary',
      queryParameters: <String, dynamic>{
        if (kodeDepo.isNotEmpty) 'kode_depo': kodeDepo,
      },
    );
    final data = (res.data as Map)['data'];
    if (data is! Map) {
      throw StateError('Ringkasan dashboard tidak dikembalikan server.');
    }
    return DashboardSummary.fromJson(Map<String, dynamic>.from(data));
  }
}
