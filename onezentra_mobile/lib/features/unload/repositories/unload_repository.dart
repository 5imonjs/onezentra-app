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

  /// Finds the receiving behind a PO barcode. Exact match is mandatory —
  /// anything else answers 404 instead of opening the wrong unloading.
  /// Records that are already finished belong to Hasil Penerimaan.
  ///
  /// The server search is a LIKE over PO *and* driver name, ordered by
  /// creation date, so a single page can hold a CANCELLED row for this PO
  /// while the live PENDING receiving sits on a later page. Walk every page
  /// and prefer an active (PENDING / IN_PROGRESS) exact match; a finished
  /// exact match is only kept so the caller gets the "lihat di Hasil
  /// Penerimaan" message instead of a misleading 404.
  Future<UnloadSession> findByPo(String po) async {
    var code = po.trim();
    if (code.isEmpty) {
      throw const ApiException(
        'Masukkan / pindai barcode PO terlebih dahulu.',
        0,
      );
    }

    var wantedPo = code.toLowerCase();
    Map<String, dynamic>? activeMatch;
    Map<String, dynamic>? finishedMatch;
    var page = 1;
    var lastPage = 1;

    do {
      var query = Uri(
        queryParameters: {'search': code, 'per_page': '100', 'page': '$page'},
      ).query;
      var body = _expectObject(await _get('/receivings?$query'));
      var raw = body['data'];
      var candidates = raw is List
          ? raw
                .whereType<Map>()
                .map((item) => Map<String, dynamic>.from(item))
                .toList()
          : <Map<String, dynamic>>[];

      for (var candidate in candidates) {
        var doc = candidate['rencana_kirim'];
        var candidatePo = doc is Map
            ? doc['po_transporter']?.toString().toLowerCase()
            : null;
        if (candidatePo != wantedPo) {
          continue;
        }
        var status = candidate['status']?.toString();
        if (status == 'PENDING' || status == 'IN_PROGRESS') {
          activeMatch = candidate;
          break;
        }
        finishedMatch ??= candidate;
      }

      lastPage = _readLastPage(body['last_page']) ?? page;
      page++;
    } while (activeMatch == null && page <= lastPage);

    var exact = activeMatch ?? finishedMatch;
    if (exact == null) {
      throw ApiException(
        'Tidak ada bongkar berjalan dengan barcode "$code".',
        404,
      );
    }

    var session = UnloadSession.fromJson(exact);
    if (session.status != 'PENDING' && session.status != 'IN_PROGRESS') {
      throw ApiException(
        'Dokumen berstatus ${_statusLabel(session.status)} — '
        'lihat di Hasil Penerimaan.',
        422,
      );
    }
    return _expectSession(await _get('/receivings/${session.id}'));
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
        if (rencanaKirimItemId != null)
          'rencana_kirim_item_id': rencanaKirimItemId,
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

  static String _statusLabel(String status) => switch (status) {
    'PENDING' => 'Menunggu',
    'IN_PROGRESS' => 'Berjalan',
    'COMPLETED' => 'Selesai',
    'CANCELLED' => 'Dibatalkan',
    _ => status,
  };

  static int? _readLastPage(dynamic value) {
    if (value is num) {
      return value.toInt();
    }
    return int.tryParse(value?.toString() ?? '');
  }
}
