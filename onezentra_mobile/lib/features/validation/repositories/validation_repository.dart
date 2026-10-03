import 'package:onezentra_mobile/core/network/api_client.dart';
import 'package:onezentra_mobile/features/validation/models/validation_models.dart';

/// GET transport for the validation endpoints, injectable for tests.
typedef ValidationGet = Future<dynamic> Function(String endpoint);

/// POST transport for the validation endpoints, injectable for tests.
typedef ValidationPost = Future<dynamic> Function(
  String endpoint,
  Map<String, dynamic> body,
);

/// Data access for the Validasi SJ menu.
///
/// Mirrors the endpoints behind `/api/v1/sj-validations` used by the web app:
/// scan a PO barcode (`start-by-code`), validate lines (`{id}/scan`),
/// then `complete` or `cancel` the session.
///
/// Photo upload is intentionally unsupported: the mobile app has no image
/// picker dependency, so a problem condition answers with the server's
/// "Foto wajib diunggah" message telling the operator to continue on web.
class ValidationRepository {
  ValidationRepository({ValidationGet? get, ValidationPost? post})
    : _get = get ?? _defaultGet,
      _post = post ?? _defaultPost;

  /// Overrides the transports so widget tests can exercise the flow without
  /// a server. Defaults hit [ApiClient].
  final ValidationGet _get;
  final ValidationPost _post;

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
      throw const ApiException('Masukkan / pindai barcode PO terlebih dahulu.', 0);
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
  }) async {
    var body = _expectObject(
      await _post('/sj-validations/$validationId/scan', {
        'sj_validation_item_id': itemId,
        'actual_qty': actualQty,
        if (barcode?.isNotEmpty ?? false) 'barcode': barcode,
        'condition': condition,
        if (expiredDate?.isNotEmpty ?? false) 'expired_date': expiredDate,
        if (notes != null && notes.isNotEmpty) 'notes': notes,
        if (tier != null) 'tier': tier,
        if (tinggiTumpukan != null) 'tinggi_tumpukan': tinggiTumpukan,
      }),
    );
    var data = body['data'];
    if (data is! Map) {
      throw const ApiException(
        'Respons server tidak memuat item. Silakan coba lagi.',
        0,
      );
    }
    return SjValidationItem.fromJson(Map<String, dynamic>.from(data));
  }

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
}
