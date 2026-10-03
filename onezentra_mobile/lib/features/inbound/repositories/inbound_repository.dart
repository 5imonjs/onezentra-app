import 'package:onezentra_mobile/core/network/api_client.dart';
import 'package:onezentra_mobile/features/inbound/models/inbound_models.dart';

/// Data access for the Hasil Penerimaan (inbound history) menu.
///
/// Read-only: `GET /receivings` for the paged history and
/// `GET /receivings/{id}` for one record with its lines.
class InboundRepository {
  InboundRepository({Future<dynamic> Function(String endpoint)? get})
    : _get = get ?? ApiClient().get;

  /// Overrides the transport so widget tests can run without a server.
  final Future<dynamic> Function(String endpoint) _get;

  static Map<String, dynamic> _expectObject(dynamic response) {
    if (response is! Map) {
      throw const ApiException(
        'Respons server tidak valid. Silakan coba lagi.',
        0,
      );
    }
    return Map<String, dynamic>.from(response);
  }

  /// Paginated inbound history. [search] matches PO transporter and driver
  /// name server-side.
  Future<ReceivingPage> list({
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
    return ReceivingPage.fromJson(
      _expectObject(await _get('/receivings?$query')),
    );
  }

  /// One record with its document and received lines.
  Future<Receiving> show(int id) async {
    var body = _expectObject(await _get('/receivings/$id'));
    var data = body['data'];
    if (data is! Map) {
      throw const ApiException(
        'Respons server tidak memuat data penerimaan. Silakan coba lagi.',
        0,
      );
    }
    return Receiving.fromJson(Map<String, dynamic>.from(data));
  }
}
