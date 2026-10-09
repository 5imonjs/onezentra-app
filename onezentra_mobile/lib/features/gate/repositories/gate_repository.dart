import 'package:onezentra_mobile/core/network/api_client.dart';
import 'package:onezentra_mobile/features/gate/models/gate_models.dart';

/// GET transport for the gate endpoints, injectable for tests.
typedef GateGet =
    Future<dynamic> Function(String endpoint, Map<String, String> query);

/// POST transport for the gate endpoints, injectable for tests.
typedef GatePost =
    Future<dynamic> Function(String endpoint, Map<String, dynamic> body);

/// Data access for the Check In Point (gate) menu.
///
/// Mirrors the endpoints behind `/api/v1/gate-transactions` and the
/// `rencana-kirim/{id}/verify` transition the web app uses.
class GateRepository {
  GateRepository({GateGet? get, GatePost? post})
    : _get = get ?? _defaultGet,
      _post = post ?? _defaultPost;

  /// Overrides the transports so widget tests can exercise the flow without
  /// a server. Defaults hit [ApiClient].
  final GateGet _get;
  final GatePost _post;

  static Future<dynamic> _defaultGet(
    String endpoint,
    Map<String, String> query,
  ) => ApiClient().get(_appendQuery(endpoint, query));

  static Future<dynamic> _defaultPost(
    String endpoint,
    Map<String, dynamic> body,
  ) => ApiClient().post(endpoint, body);

  /// `Uri(queryParameters:)` also encodes the value, so a plate like
  /// "B 1234 XY" survives the round trip.
  static String _appendQuery(String endpoint, Map<String, String> query) =>
      query.isEmpty
      ? endpoint
      : '$endpoint?${Uri(queryParameters: query).query}';

  static Map<String, dynamic> _expectObject(dynamic response) {
    if (response is! Map) {
      throw const ApiException(
        'Respons server tidak valid. Silakan coba lagi.',
        0,
      );
    }
    return Map<String, dynamic>.from(response);
  }

  /// Paginated gate history. [search] matches nopol, po_transporter and
  /// driver name server-side.
  Future<GateTransactionPage> list({
    String? search,
    int page = 1,
    int perPage = 20,
  }) async {
    var response = _expectObject(
      await _get('/gate-transactions', {
        'page': '$page',
        'per_page': '$perPage',
        if (search != null && search.isNotEmpty) 'search': search,
      }),
    );
    return GateTransactionPage.fromJson(response);
  }

  /// Header counters. A payload without `data` degrades to zero counts
  /// instead of failing the whole screen.
  Future<GateStats> stats() async {
    var response = _expectObject(
      await _get('/gate-transactions/stats', const {}),
    );
    var data = response['data'];
    if (data is! Map) {
      return const GateStats();
    }
    return GateStats.fromJson(Map<String, dynamic>.from(data));
  }

  /// Looks up one rencana kirim by exact PO transporter or plate number.
  Future<RencanaKirim> findByNoDokumen(String nomor) async {
    var response = _expectObject(
      await _get('/gate-transactions/search/by-dokumen', {
        'po_transporter': nomor,
      }),
    );
    var data = response['data'];
    var rencanaKirim = data is Map
        ? RencanaKirim.fromJson(Map<String, dynamic>.from(data))
        : null;
    if (rencanaKirim?.id == null) {
      throw const ApiException('Rencana kirim tidak ditemukan.', 404);
    }
    return rencanaKirim!;
  }

  /// Records a gate scan. The server rejects a type that does not match the
  /// document status; its Indonesian message is surfaced as-is.
  Future<GateTransaction> record({
    required RencanaKirim rencanaKirim,
    required String gateType,
  }) async {
    var id = rencanaKirim.id;
    if (id == null) {
      throw const ApiException(
        'Dokumen tidak lengkap. Cari ulang PO / Nopol.',
        0,
      );
    }

    var response = _expectObject(
      await _post('/gate-transactions', {
        'rencana_kirim_id': id,
        'gate_type': gateType,
        'nopol': rencanaKirim.nopol,
        'driver_name': rencanaKirim.driverName,
        'po_transporter': rencanaKirim.poTransporter,
      }),
    );
    var data = response['data'];
    if (data is! Map) {
      throw const ApiException(
        'Respons server tidak valid. Silakan coba lagi.',
        0,
      );
    }
    return GateTransaction.fromJson(Map<String, dynamic>.from(data));
  }

  /// Verifies the rencana kirim behind a `CHECKED_IN` document.
  Future<String> verify(int rencanaKirimId) async {
    var response = _expectObject(
      await _post('/rencana-kirim/$rencanaKirimId/verify', const {}),
    );
    var data = response['data'];
    if (data is! Map) {
      return 'VERIFIED';
    }
    return _readStatus(Map<String, dynamic>.from(data)) ?? 'VERIFIED';
  }

  static String? _readStatus(Map<String, dynamic> json) {
    var status = json['status'];
    return status?.toString();
  }
}
