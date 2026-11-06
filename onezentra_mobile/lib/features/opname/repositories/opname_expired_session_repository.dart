import 'package:onezentra_mobile/core/network/api_client.dart';
import 'package:onezentra_mobile/features/opname/models/opname_expired_session_models.dart';

typedef OpnameExpiredSessionGet = Future<dynamic> Function(String endpoint);

typedef OpnameExpiredSessionRequest =
    Future<dynamic> Function(String endpoint, Map<String, dynamic> body);

/// Multipart POST transport for counts that carry photo evidence.
typedef OpnameExpiredSessionPostMultipart =
    Future<dynamic> Function(
      String endpoint,
      Map<String, String> fields, {
      required String fileField,
      required String filePath,
    });

/// Data access for Opname Expired sessions (aturan A2).
///
/// Membawa siklus hidup sesi: list, show, start, tambah wave, verifikasi
/// item, submit, approve, revise, cancel, assign.
class OpnameExpiredSessionRepository {
  OpnameExpiredSessionRepository({
    OpnameExpiredSessionGet? get,
    OpnameExpiredSessionRequest? post,
    OpnameExpiredSessionRequest? put,
    OpnameExpiredSessionPostMultipart? postMultipart,
  }) : _get = get ?? ApiClient().get,
       _post =
           post ??
           ((String endpoint, Map<String, dynamic> body) =>
               ApiClient().post(endpoint, body)),
       _put =
           put ??
           ((String endpoint, Map<String, dynamic> body) =>
               ApiClient().put(endpoint, body)),
       _postMultipart = postMultipart ?? ApiClient().postMultipart;

  final OpnameExpiredSessionGet _get;
  final OpnameExpiredSessionRequest _post;
  final OpnameExpiredSessionRequest _put;
  final OpnameExpiredSessionPostMultipart _postMultipart;

  static Map<String, dynamic> _expectObject(dynamic response) {
    if (response is! Map) {
      throw const ApiException(
        'Respons server tidak valid. Silakan coba lagi.',
        0,
      );
    }
    return Map<String, dynamic>.from(response);
  }

  OpnameExpiredSession _sessionFromBody(Map<String, dynamic> body) {
    var data = body['data'];
    if (data is Map) {
      return OpnameExpiredSession.fromJson(Map<String, dynamic>.from(data));
    }
    throw const ApiException(
      'Respons server tidak valid. Silakan coba lagi.',
      0,
    );
  }

  /// Daftar sesi opname (default minggu terbaru; [mine] untuk petugas sendiri).
  Future<List<OpnameExpiredSession>> list({
    String? weekStart,
    String? kodeDepo,
    String? status,
    bool? mine,
  }) async {
    var query = Uri(
      queryParameters: <String, String>{
        'page': '1',
        'per_page': '50',
        if (weekStart != null && weekStart.isNotEmpty) 'week_start': weekStart,
        if (kodeDepo != null && kodeDepo.isNotEmpty) 'kode_depo': kodeDepo,
        if (status != null && status.isNotEmpty) 'status': status,
        if (mine == true) 'mine': '1',
      },
    ).query;
    var response = _expectObject(await _get('/opname-sessions?$query'));
    var raw = response['data'];
    var rawSessions = <dynamic>[];
    if (raw is List) {
      rawSessions = raw;
    } else if (raw is Map) {
      var inner = raw['data'];
      if (inner is List) {
        rawSessions = inner;
      }
    }
    return rawSessions
        .whereType<Map>()
        .map((e) => OpnameExpiredSession.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  /// Detail satu sesi dengan item verifikasi.
  Future<OpnameExpiredSession> show(int id) async {
    var body = _expectObject(await _get('/opname-sessions/$id'));
    var data = body['data'];
    if (data is! Map) {
      throw const ApiException(
        'Respons server tidak memuat data sesi. Silakan coba lagi.',
        0,
      );
    }
    return OpnameExpiredSession.fromJson(Map<String, dynamic>.from(data));
  }

  Future<OpnameExpiredSession> start(int id) async {
    var body = _expectObject(
      await _post('/opname-sessions/$id/start', <String, dynamic>{}),
    );
    return _sessionFromBody(body);
  }

  Future<OpnameExpiredSession> addWaves(int id, List<int> waveIds) async {
    var body = _expectObject(
      await _post('/opname-sessions/$id/waves', <String, dynamic>{
        'wave_ids': waveIds,
      }),
    );
    return _sessionFromBody(body);
  }

  /// Simpan hasil hitung satu baris. [photoPath] mengubah request menjadi
  /// multipart dengan file di field `photo` — wajib untuk kondisi
  /// bermasalah (FISIK_RUSAK dst.), sejajar form validasi SJ.
  Future<dynamic> verifyItem(
    int sessionId,
    int itemId,
    Map<String, dynamic> data, {
    String? photoPath,
  }) async {
    var endpoint = '/opname-sessions/$sessionId/items/$itemId';
    if (photoPath != null && photoPath.isNotEmpty) {
      return _expectObject(
        await _postMultipart(
          endpoint,
          {
            for (var entry in data.entries)
              entry.key: entry.value?.toString() ?? '',
          },
          fileField: 'photo',
          filePath: photoPath,
        ),
      );
    }
    return _expectObject(await _post(endpoint, data));
  }

  Future<OpnameExpiredSession> submit(int id) async {
    var body = _expectObject(await _post('/opname-sessions/$id/submit', {}));
    return _sessionFromBody(body);
  }

  Future<OpnameExpiredSession> approve(int id) async {
    var body = _expectObject(await _post('/opname-sessions/$id/approve', {}));
    return _sessionFromBody(body);
  }

  Future<OpnameExpiredSession> revise(int id, String reason) async {
    var body = _expectObject(
      await _post('/opname-sessions/$id/revise', <String, dynamic>{
        'reason': reason,
      }),
    );
    return _sessionFromBody(body);
  }

  Future<OpnameExpiredSession> cancel(int id, {String? notes}) async {
    var body = _expectObject(
      await _post(
        '/opname-sessions/$id/cancel',
        notes == null ? <String, dynamic>{} : <String, dynamic>{'notes': notes},
      ),
    );
    return _sessionFromBody(body);
  }

  Future<OpnameExpiredSession> assign(int id, int assignedTo) async {
    var body = _expectObject(
      await _put('/opname-sessions/$id/assign', <String, dynamic>{
        'assigned_to': assignedTo,
      }),
    );
    return _sessionFromBody(body);
  }
}
