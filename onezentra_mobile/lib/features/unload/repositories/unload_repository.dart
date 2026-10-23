import 'package:onezentra_mobile/core/network/api_client.dart';
import 'package:onezentra_mobile/features/unload/models/unload_models.dart';

/// GET transport for the unload endpoints, injectable for tests.
typedef UnloadGet = Future<dynamic> Function(String endpoint);

/// POST transport for the unload endpoints, injectable for tests.
typedef UnloadPost =
    Future<dynamic> Function(String endpoint, Map<String, dynamic> body);

/// Data access for the Bongkar (receiving execution) menu.
///
/// Scan a PO → open its receiving (exact PO match only, like the web app:
/// falling back to "first candidate" could finish the wrong unloading) →
/// start → scan lines → complete (or cancel).
class UnloadRepository {
  UnloadRepository({UnloadGet? get, UnloadPost? post})
    : _get = get ?? _defaultGet,
      _post = post ?? _defaultPost;

  /// Overrides the transports so widget tests can exercise the flow without
  /// a server. Defaults hit [ApiClient].
  final UnloadGet _get;
  final UnloadPost _post;

  static Future<dynamic> _defaultGet(String endpoint) =>
      ApiClient().get(endpoint);

  static Future<dynamic> _defaultPost(
    String endpoint,
    Map<String, dynamic> body,
  ) => ApiClient().post(endpoint, body);

  static Map<String, dynamic> _expectObject(dynamic response) {
    if (response is! Map) {
      throw const ApiException(
        'Respons server tidak valid. Silakan coba lagi.',
        0,
      );
    }
    return Map<String, dynamic>.from(response);
  }

  static UnloadSession _expectSession(dynamic response) {
    var body = _expectObject(response);
    var data = body['data'];
    if (data is! Map) {
      throw const ApiException(
        'Respons server tidak memuat sesi bongkar. Silakan coba lagi.',
        0,
      );
    }
    return UnloadSession.fromJson(Map<String, dynamic>.from(data));
  }

  /// Header counters returned by one grouped aggregate query.
  Future<UnloadStats> stats() async {
    var body = _expectObject(await _get('/receivings/stats'));
    var data = body['data'];
    if (data is! Map) {
      throw const ApiException(
        'Respons statistik receiving tidak valid. Silakan coba lagi.',
        0,
      );
    }
    return UnloadStats.fromJson(Map<String, dynamic>.from(data));
  }

  /// One page per active status, keeping the rendered list bounded.
  Future<UnloadReceivingPage> listActive({
    int page = 1,
    int perPage = 10,
  }) async {
    Future<Map<String, dynamic>> loadStatus(String status) async {
      var query = Uri(
        queryParameters: {
          'status': status,
          'per_page': '$perPage',
          'page': '$page',
        },
      ).query;
      return _expectObject(await _get('/receivings?$query'));
    }

    var pages = await Future.wait([
      loadStatus('PENDING'),
      loadStatus('IN_PROGRESS'),
    ]);
    var sessions = <UnloadSession>[];
    for (var index = 0; index < pages.length; index++) {
      var body = pages[index];
      var status = index == 0 ? 'PENDING' : 'IN_PROGRESS';
      var raw = body['data'];
      if (raw is List) {
        sessions.addAll(
          raw
              .whereType<Map>()
              .map(
                (row) => UnloadSession.fromJson(Map<String, dynamic>.from(row)),
              )
              .where((session) => session.status == status),
        );
      }
    }

    return UnloadReceivingPage(
      items: sessions,
      total:
          (_readInt(pages[0]['total']) ?? 0) +
          (_readInt(pages[1]['total']) ?? 0),
      page: page,
      lastPage: [
        _readLastPage(pages[0]['last_page']) ?? page,
        _readLastPage(pages[1]['last_page']) ?? page,
      ].reduce((a, b) => a > b ? a : b),
    );
  }

  /// Finds the receiving behind a PO barcode using one exact-match endpoint.
  /// Finished records stay in Riwayat > Penerimaan.
  Future<UnloadSession> findByPo(String po) async {
    var code = po.trim();
    if (code.isEmpty) {
      throw const ApiException(
        'Masukkan / pindai barcode PO terlebih dahulu.',
        0,
      );
    }

    var query = Uri(queryParameters: {'po_transporter': code}).query;
    return _expectSession(await _get('/receivings/search/by-po?$query'));
  }

  /// Starts the unloading (PENDING → IN_PROGRESS).
  Future<UnloadSession> start(int id) async =>
      _expectSession(await _post('/receivings/$id/start', const {}));

  /// Reloads one session with its plan and scanned lines.
  Future<UnloadSession> show(int id) async =>
      _expectSession(await _get('/receivings/$id'));

  /// Scans one unloaded line. The server creates a receiving item per
  /// call and keeps the running received total itself.
  Future<void> scan({
    required int receivingId,
    required String kodeBarang,
    required double actualQty,
    String? namaBarang,
    String? satuan,
    String condition = 'FISIK_BAGUS',
    String? barcode,
    String? notes,
    int? rencanaKirimItemId,
  }) async {
    if (kodeBarang.trim().isEmpty) {
      throw const ApiException('Kode barang tidak boleh kosong.', 0);
    }
    _expectObject(
      await _post('/receivings/$receivingId/scan', {
        'kode_barang': kodeBarang.trim(),
        'actual_qty': actualQty,
        if (namaBarang != null && namaBarang.isNotEmpty)
          'nama_barang': namaBarang,
        if (satuan != null && satuan.isNotEmpty) 'satuan': satuan,
        'condition': condition,
        if (barcode != null && barcode.isNotEmpty) 'barcode': barcode,
        if (notes != null && notes.isNotEmpty) 'notes': notes,
        'rencana_kirim_item_id': ?rencanaKirimItemId,
      }),
    );
  }

  /// Finishes the unloading: completes the receiving, releases the dock,
  /// marks the rencana COMPLETED and emails BLC.
  Future<UnloadSession> complete(int id, {required String barcode}) async =>
      _expectSession(
        await _post('/receivings/$id/complete', {'barcode': barcode}),
      );

  /// Cancels a running unloading.
  Future<void> cancel(int id) async {
    _expectObject(await _post('/receivings/$id/cancel', const {}));
  }

  static int? _readLastPage(dynamic value) {
    if (value is num) {
      return value.toInt();
    }
    return int.tryParse(value?.toString() ?? '');
  }

  static int? _readInt(dynamic value) {
    if (value is int) {
      return value;
    }
    if (value is num) {
      return value.toInt();
    }
    return int.tryParse(value?.toString() ?? '');
  }
}
