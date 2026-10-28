import 'package:onezentra_mobile/core/network/api_client.dart';
import 'package:onezentra_mobile/features/validation/models/validation_models.dart';

/// GET transport for the validation endpoints, injectable for tests.
typedef ValidationGet = Future<dynamic> Function(String endpoint);

/// POST transport for the validation endpoints, injectable for tests.
typedef ValidationPost =
    Future<dynamic> Function(String endpoint, Map<String, dynamic> body);

/// Multipart POST transport for validation lines that carry a photo.
typedef ValidationPostMultipart =
    Future<dynamic> Function(
      String endpoint,
      Map<String, String> fields, {
      required String fileField,
      required String filePath,
    });

/// Data access for the Validasi SJ menu.
///
/// Mirrors the endpoints behind `/api/v1/sj-validations` used by the web app:
/// scan a PO barcode (`start-by-code`), validate lines (`{id}/scan`),
/// then `complete` or `cancel` the session.
///
/// Problem conditions require photo evidence, so [scanItem] switches to a
/// multipart request whenever the caller supplies a [photoPath].
class ValidationRepository {
  ValidationRepository({
    ValidationGet? get,
    ValidationPost? post,
    ValidationPostMultipart? postMultipart,
  }) : _get = get ?? _defaultGet,
       _post = post ?? _defaultPost,
       _postMultipart = postMultipart ?? _defaultPostMultipart;

  /// Overrides the transports so widget tests can exercise the flow without
  /// a server. Defaults hit [ApiClient].
  final ValidationGet _get;
  final ValidationPost _post;
  final ValidationPostMultipart _postMultipart;

  static Future<dynamic> _defaultGet(String endpoint) =>
      ApiClient().get(endpoint);

  static Future<dynamic> _defaultPost(
    String endpoint,
    Map<String, dynamic> body,
  ) => ApiClient().post(endpoint, body);

  static Future<dynamic> _defaultPostMultipart(
    String endpoint,
    Map<String, String> fields, {
    required String fileField,
    required String filePath,
  }) => ApiClient().postMultipart(
    endpoint,
    fields,
    fileField: fileField,
    filePath: filePath,
  );

  static Map<String, dynamic> _expectObject(dynamic response) {
    if (response is! Map) {
      throw const ApiException(
        'Respons server tidak valid. Silakan coba lagi.',
        0,
      );
    }
    return Map<String, dynamic>.from(response);
  }

  static SjValidation _expectSession(dynamic response) {
    var body = _expectObject(response);
    var data = body['data'];
    if (data is! Map) {
      throw const ApiException(
        'Respons server tidak memuat sesi validasi. Silakan coba lagi.',
        0,
      );
    }
    return SjValidation.fromJson(Map<String, dynamic>.from(data));
  }

  /// Paginated validation history, searchable by PO transporter.
  Future<ValidationHistoryPage> list({
    String? search,
    int page = 1,
    int perPage = 20,
  }) async {
    var query = Uri(
      queryParameters: {
        'page': '$page',
        'per_page': '$perPage',
        if (search != null && search.isNotEmpty) 'search': search,
      },
    ).query;
    return ValidationHistoryPage.fromJson(
      _expectObject(await _get('/sj-validations?$query')),
    );
  }

  /// Header counters. A payload without `data` degrades to zero counts
  /// instead of failing the whole screen.
  Future<ValidationStats> stats() async {
    var body = _expectObject(await _get('/sj-validations/stats'));
    var data = body['data'];
    if (data is! Map) {
      return const ValidationStats();
    }
    return ValidationStats.fromJson(Map<String, dynamic>.from(data));
  }

  /// Scan a PO barcode: opens the session (creates it, or resumes the
  /// existing `IN_PROGRESS` / `COMPLETED` one, exactly like the web flow).
  Future<SjValidation> startByCode(String scanCode) async {
    var code = scanCode.trim();
    if (code.isEmpty) {
      throw const ApiException(
        'Masukkan / pindai barcode PO terlebih dahulu.',
        0,
      );
    }
    return _expectSession(
      await _post('/sj-validations/start-by-code', {'scan_code': code}),
    );
  }

  /// Reloads one session (used after each line validation and when opening
  /// a history row).
  Future<SjValidation> show(int id) async =>
      _expectSession(await _get('/sj-validations/$id'));

  /// Validates one line: actual qty, condition, expiry, optional product
  /// barcode and stack measurements. Answers with the updated line.
  ///
  /// A [photoPath] turns the request into multipart form data with the file
  /// under `photo`, matching the web validation form.
  Future<SjValidationItem> scanItem({
    required int validationId,
    required int itemId,
    required double actualQty,
    String? barcode,
    String condition = 'FISIK_BAGUS',
    String? expiredDate,
    String? notes,
    int? tier,
    int? tinggiTumpukan,
    String? photoPath,
  }) async {
    var fields = <String, dynamic>{
      'sj_validation_item_id': itemId,
      'actual_qty': actualQty,
      if (barcode?.isNotEmpty ?? false) 'barcode': barcode,
      'condition': condition,
      if (expiredDate?.isNotEmpty ?? false) 'expired_date': expiredDate,
      if (notes != null && notes.isNotEmpty) 'notes': notes,
      'tier': ?tier,
      'tinggi_tumpukan': ?tinggiTumpukan,
    };
    var endpoint = '/sj-validations/$validationId/scan';
    var response = photoPath != null && photoPath.isNotEmpty
        ? await _postMultipart(
            endpoint,
            <String, String>{
              for (var entry in fields.entries) entry.key: '${entry.value}',
            },
            fileField: 'photo',
            filePath: photoPath,
          )
        : await _post(endpoint, fields);
    var body = _expectObject(response);
    var data = body['data'];
    if (data is! Map) {
      throw const ApiException(
        'Respons server tidak memuat item. Silakan coba lagi.',
        0,
      );
    }
    return SjValidationItem.fromJson(Map<String, dynamic>.from(data));
  }

  /// Mencatat barang di luar rencana kirim (deviation record) untuk sesi
  /// yang masih berjalan. Foto bukti wajib — request selalu multipart.
  /// Barcode mengunci barang ke master data (NPN) di server; bila tidak
  /// dikenal, kode + nama barang manual yang dipakai. Bila [npnId] dikirim
  /// (pilihan dari pencarian master), identitas & satuan wajib mengikuti
  /// master — server menimpa nilai manual ikutan.
  Future<SjValidationExtraItem> reportExtraItem({
    required int validationId,
    required double qty,
    required String photoPath,
    int? npnId,
    String? kodeBarang,
    String? namaBarang,
    String? satuan,
    String condition = 'FISIK_BAGUS',
    String? expiredDate,
    String? notes,
  }) async {
    var fields = <String, String>{
      'qty': '$qty',
      'condition': condition,
      if (npnId != null) 'npn_id': '$npnId',
      if (kodeBarang?.isNotEmpty ?? false) 'kode_barang': kodeBarang!,
      if (namaBarang?.isNotEmpty ?? false) 'nama_barang': namaBarang!,
      if (satuan?.isNotEmpty ?? false) 'satuan': satuan!,
      if (expiredDate?.isNotEmpty ?? false) 'expired_date': expiredDate!,
      if (notes != null && notes.isNotEmpty) 'notes': notes,
    };
    var response = await _postMultipart(
      '/sj-validations/$validationId/extra-items',
      fields,
      fileField: 'photo',
      filePath: photoPath,
    );
    var body = _expectObject(response);
    var data = body['data'];
    if (data is! Map) {
      throw const ApiException(
        'Respons server tidak memuat barang. Silakan coba lagi.',
        0,
      );
    }
    return SjValidationExtraItem.fromJson(Map<String, dynamic>.from(data));
  }

  /// Cari produk master NPN (nama / kode / barcode). Dipakai sheet "barang
  /// luar rencana" untuk mengunci identitas barang ke master setelah barcode
  /// discan atau diketik — pola yang sama dengan combobox Rencana Kirim web.
  /// Query kosong tidak memanggil server sama sekali.
  Future<List<NpnProduct>> searchProduct(String query) async {
    var q = query.trim();
    if (q.isEmpty) {
      return const [];
    }
    var body = _expectObject(
      await _get(
        '/npn/search-product?q=${Uri.encodeQueryComponent(q)}&limit=50',
      ),
    );
    var payload = _readMapSafe(body['data']);
    var raw = payload?['data'];
    if (raw is! List) {
      return const [];
    }
    return raw
        .whereType<Map>()
        .map((item) => NpnProduct.fromJson(Map<String, dynamic>.from(item)))
        .toList();
  }

  Map<String, dynamic>? _readMapSafe(dynamic value) =>
      value is Map ? Map<String, dynamic>.from(value) : null;

  /// Finishes the session. The server rejects it while lines are still
  /// `PENDING`; its Indonesian message is surfaced as-is.
  Future<SjValidation> complete(int id) async =>
      _expectSession(await _post('/sj-validations/$id/complete', const {}));

  /// Submits a standarisasi tumpukan for a product (tier × tinggi).
  /// The record is created `pending` — BLC approves it on web, and only
  /// then does the validation line unlock. Mirrors the web create form.
  Future<void> createStandarisasi({
    required int npnId,
    required int tier,
    required int tinggiTumpukan,
  }) async {
    _expectObject(
      await _post('/standarisasi-tumpukan', {
        'npn_id': npnId,
        'tier': tier,
        'tinggi_tumpukan': tinggiTumpukan,
      }),
    );
  }

  /// Cancels a running session.
  Future<void> cancel(int id) async {
    _expectObject(await _post('/sj-validations/$id/cancel', const {}));
  }

  /// Melaporkan label batch sudah tercetak fisik (jejak server lintas
  /// device, paritas tombol Cetak web). Idempoten; batch CANCELLED ditolak
  /// server dengan pesannya sendiri.
  Future<void> markPrinted(int batchId) async {
    _expectObject(await _post('/batches/$batchId/mark-printed', const {}));
  }
}
