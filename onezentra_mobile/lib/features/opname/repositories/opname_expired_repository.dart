import 'package:onezentra_mobile/core/network/api_client.dart';
import 'package:onezentra_mobile/features/opname/models/opname_expired_models.dart';

/// Data access for Opname Expired: daftar wave expired dari backend.
///
/// Read-only untuk monitoring: `GET /opname-expired` membawa daftar wave
/// (barang + depo + expired + qty + status) plus meta ringkasan minggu.
class OpnameExpiredRepository {
  OpnameExpiredRepository({Future<dynamic> Function(String endpoint)? get})
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

  /// Daftar wave expired (default minggu terbaru). [weekStart] menimpa
  /// default; [status] / [source] / [search] meneruskan filter backend.
  Future<OpnameExpiredList> list({
    String? weekStart,
    String? status,
    String? source,
    String? search,
    int page = 1,
    int perPage = 20,
  }) async {
    var query = Uri(
      queryParameters: <String, String>{
        'page': '$page',
        'per_page': '$perPage',
        if (weekStart != null && weekStart.isNotEmpty) 'week_start': weekStart,
        if (status != null && status.isNotEmpty) 'status': status,
        if (source != null && source.isNotEmpty) 'source': source,
        if (search != null && search.isNotEmpty) 'search': search,
      },
    ).query;
    return OpnameExpiredList.fromJson(
      _expectObject(await _get('/opname-expired?$query')),
    );
  }
}
