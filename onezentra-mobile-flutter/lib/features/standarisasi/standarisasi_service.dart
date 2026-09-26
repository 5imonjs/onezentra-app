import 'package:dio/dio.dart';
import 'package:onezentra_mobile/core/api_client.dart';
import 'package:onezentra_mobile/features/standarisasi/models/standarisasi_models.dart';

/// Akses API Standarisasi Tumpukan — mirror `standarisasiTumpukan` di
/// `onezentra-web/src/lib/api.ts` dan `StandarisasiTumpukanController` di
/// backend.
///
/// Yang **tidak** dipindahkan ke mobile: `import`, `export`, `template`,
/// `bulk-delete`, `update`, dan `notify`. Semuanya operasi berkas atau
/// penghapusan massal yang dipakai di meja admin web, bukan di lapangan — dan
/// `update` sengaja tidak ikut karena backend sudah mengembalikan `pending`
/// (approval lama dibatalkan) bila isinya berubah, jadi mengubah isi sama
/// dengan meminta persetujuan baru.
class StandarisasiService {
  StandarisasiService([Dio? dio]) : _dio = dio ?? ApiClient.instance.dio;

  final Dio _dio;

  /// Daftar standarisasi — `search` mencocokkan kolom produk & nama depo,
  /// `status` menyaring satu status (null = semua).
  Future<StandarisasiListPage> list({
    String search = '',
    String? status,
    int page = 1,
  }) async {
    final res = await _dio.get(
      '/standarisasi-tumpukan',
      queryParameters: <String, dynamic>{
        'search': search,
        'per_page': 20,
        'page': page,
        if (status != null && status.isNotEmpty) 'status': status,
      },
    );
    final body = res.data as Map<String, dynamic>;
    final entries = ((body['data'] as List?) ?? const [])
        .whereType<Map>()
        .map((e) => StandarisasiTumpukan.fromJson(Map<String, dynamic>.from(e)))
        .toList();
    return StandarisasiListPage(
      entries: entries,
      currentPage: (body['current_page'] as num?)?.toInt() ?? page,
      lastPage: (body['last_page'] as num?)?.toInt() ?? page,
      total: (body['total'] as num?)?.toInt() ?? entries.length,
    );
  }

  Future<StandarisasiStats> stats({String search = ''}) async {
    final res = await _dio.get(
      '/standarisasi-tumpukan/stats',
      queryParameters: <String, dynamic>{'search': search},
    );
    final data = ((res.data as Map)['data'] as Map?) ?? const {};
    return StandarisasiStats.fromJson(Map<String, dynamic>.from(data));
  }

  /// Cari produk untuk form — `GET /standarisasi-tumpukan/search-product`.
  Future<List<NpnProduct>> searchProduct(String term) async {
    final res = await _dio.get(
      '/standarisasi-tumpukan/search-product',
      queryParameters: <String, dynamic>{'q': term},
    );
    return ((res.data as Map)['data'] as List? ?? const [])
        .whereType<Map>()
        .map((e) => NpnProduct.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  /// Detail satu baris (`GET /standarisasi-tumpukan/{id}`).
  Future<StandarisasiTumpukan> get(int id) async {
    final res = await _dio.get('/standarisasi-tumpukan/$id');
    return StandarisasiTumpukan.fromJson(_dataMap(res.data));
  }

  /// Buat permintaan baru (status `pending` di server, wajib disetujui BLC).
  Future<StandarisasiTumpukan> create({
    required int npnId,
    required int tier,
    required int tinggiTumpukan,
  }) async {
    final res = await _dio.post(
      '/standarisasi-tumpukan',
      data: <String, dynamic>{
        'npn_id': npnId,
        'tier': tier,
        'tinggi_tumpukan': tinggiTumpukan,
      },
    );
    return StandarisasiTumpukan.fromJson(_dataMap(res.data));
  }

  /// Setujui — `POST /standarisasi-tumpukan/{id}/approve` (tanpa body, sama
  /// seperti web).
  Future<StandarisasiTumpukan> approve(int id) async {
    final res = await _dio.post('/standarisasi-tumpukan/$id/approve');
    return StandarisasiTumpukan.fromJson(_dataMap(res.data));
  }

  /// Tolak — `POST /standarisasi-tumpukan/{id}/reject`.
  Future<StandarisasiTumpukan> reject(int id) async {
    final res = await _dio.post('/standarisasi-tumpukan/$id/reject');
    return StandarisasiTumpukan.fromJson(_dataMap(res.data));
  }

  Map<String, dynamic> _dataMap(Object? body) {
    final data = (body as Map)['data'];
    if (data is! Map) {
      throw StateError('Data standarisasi tidak dikembalikan server.');
    }
    return Map<String, dynamic>.from(data);
  }
}
