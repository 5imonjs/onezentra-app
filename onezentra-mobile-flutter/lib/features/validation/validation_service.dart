import 'package:dio/dio.dart';
import 'package:onezentra_mobile/core/api_client.dart';
import 'package:onezentra_mobile/features/validation/models/validation_models.dart';

/// Akses API Validasi Dokumen — mirror `sjValidations` di
/// `onezentra-web/src/lib/api.ts` (`list`, `stats`, `lookup`, `startByCode`,
/// `scan`, `complete`, `cancel`).
///
/// `lookup` tidak dipakai mobile: alur Check In sudah membawa dokumennya lewat
/// `start/{rencanaKirim}`, jadi tidak perlu round-trip mencari dulu.
class ValidationService {
  ValidationService([Dio? dio]) : _dio = dio ?? ApiClient.instance.dio;

  final Dio _dio;

  /// Daftar validasi — dasar layar Validasi Dokumen: operator melihat dokumen
  /// yang masih berjalan dan melanjutkannya tanpa scan ulang.
  ///
  /// `status` (null = semua) dan `search` (cocok sebagian pada PO transporter)
  /// ditangani backend `SjValidationController::index`.
  Future<ValidationListPage> list({
    String search = '',
    String? status,
    int page = 1,
  }) async {
    final res = await _dio.get(
      '/sj-validations',
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
        .map((e) => SjValidationSummary.fromJson(Map<String, dynamic>.from(e)))
        .toList();
    return ValidationListPage(
      entries: entries,
      currentPage: (body['current_page'] as num?)?.toInt() ?? page,
      lastPage: (body['last_page'] as num?)?.toInt() ?? page,
      total: (body['total'] as num?)?.toInt() ?? entries.length,
    );
  }

  Future<ValidationStats> stats() async {
    final res = await _dio.get('/sj-validations/stats');
    final data = ((res.data as Map)['data'] as Map?) ?? const {};
    return ValidationStats.fromJson(Map<String, dynamic>.from(data));
  }

  /// Mulai (atau lanjutkan) validasi dari barcode/nomor PO transporter.
  ///
  /// Backend mengembalikan record yang sudah ada bila pernah dimulai, jadi
  /// scan ulang dokumen yang sama tidak menggandakan data.
  Future<SjValidation> startByCode(String scanCode) async {
    final res = await _dio.post(
      '/sj-validations/start-by-code',
      data: {'scan_code': scanCode.trim()},
    );
    return _parseValidation(res.data);
  }

  /// Mulai validasi dari dokumen yang **sudah diketahui** (hasil scan di tab
  /// Check In) — `POST /sj-validations/start/{rencanaKirim}`.
  ///
  /// Dipakai supaya operator tidak perlu scan/ketik PO yang sama dua kali:
  /// endpoint ini menerima id rencana kirim, jadi pointer dokumen sudah jelas.
  Future<SjValidation> startByRencanaKirim(int rencanaKirimId) async {
    final res = await _dio.post('/sj-validations/start/$rencanaKirimId');
    return _parseValidation(res.data);
  }

  Future<SjValidation> show(int validationId) async {
    final res = await _dio.get('/sj-validations/$validationId');
    return _parseValidation(res.data);
  }

  /// Simpan hasil pemeriksaan fisik satu item.
  ///
  /// Backend membandingkan `actual_qty` dengan `expected_qty` dan menandai item
  /// `MISMATCH` bila berbeda — jadi client tidak pernah menentukan status
  /// sendiri. `photoPath` wajib diisi untuk kondisi bermasalah.
  ///
  /// `tier` / `tinggi_tumpukan` sengaja tidak dikirim dari mobile: backend punya
  /// jalur `upsertStandarisasiTumpukan` untuknya, tetapi di web pun form item
  /// tidak pernah mengisinya — item tanpa standarisasi terverifikasi
  /// diarahkan ke halaman Standarisasi lebih dulu. Mengirimnya hanya membuat
  /// baris `pending` yang tidak bisa disetujui dari layar ini.
  Future<SjValidationItem> scanItem({
    required int validationId,
    required int itemId,
    required double actualQty,
    String? barcode,
    String? expiredDate,
    String? condition,
    String? notes,
    String? photoPath,
  }) async {
    // `?key: value` (null-aware element) dipakai agar field opsional tidak
    // terkirim sebagai `null` — backend membedakan "tidak diisi" dari 0/kosong.
    final trimmedBarcode = barcode?.trim();
    final trimmedNotes = notes?.trim();
    final payload = <String, dynamic>{
      'sj_validation_item_id': itemId,
      'actual_qty': actualQty,
      if (trimmedBarcode != null && trimmedBarcode.isNotEmpty)
        'barcode': trimmedBarcode,
      if (expiredDate != null && expiredDate.isNotEmpty)
        'expired_date': expiredDate,
      'condition': ?condition,
      if (trimmedNotes != null && trimmedNotes.isNotEmpty)
        'notes': trimmedNotes,
    };

    if (photoPath != null && photoPath.isNotEmpty) {
      payload['photo'] = await MultipartFile.fromFile(photoPath);
    }

    final res = await _dio.post(
      '/sj-validations/$validationId/scan',
      data: FormData.fromMap(payload),
    );
    final data = (res.data as Map)['data'];
    if (data is! Map) {
      throw StateError('Item validasi tidak dikembalikan server.');
    }
    return SjValidationItem.fromJson(Map<String, dynamic>.from(data));
  }

  Future<SjValidation> complete(int validationId) async {
    final res = await _dio.post('/sj-validations/$validationId/complete');
    return _parseValidation(res.data);
  }

  Future<void> cancel(int validationId) async {
    await _dio.post('/sj-validations/$validationId/cancel');
  }

  /// Hapus satu item (salah input / baris tidak perlu diperiksa).
  Future<SjValidation> deleteItem(int validationId, int itemId) async {
    final res = await _dio.delete(
      '/sj-validations/$validationId/items/$itemId',
    );
    return _parseValidation(res.data);
  }

  SjValidation _parseValidation(Object? body) {
    final data = (body as Map)['data'];
    if (data is! Map) {
      throw StateError('Data validasi tidak dikembalikan server.');
    }
    return SjValidation.fromJson(Map<String, dynamic>.from(data));
  }
}
