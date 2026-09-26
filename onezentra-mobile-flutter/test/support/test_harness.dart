import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:onezentra_mobile/core/api_client.dart';
import 'package:onezentra_mobile/features/auth/auth_service.dart';
import 'package:onezentra_mobile/features/auth/auth_user.dart';
import 'package:onezentra_mobile/features/dashboard/dashboard_service.dart';
import 'package:onezentra_mobile/features/dashboard/models/dashboard_models.dart';
import 'package:onezentra_mobile/features/gate/gate_service.dart';
import 'package:onezentra_mobile/features/gate/models/gate_models.dart';
import 'package:onezentra_mobile/features/standarisasi/models/standarisasi_models.dart';
import 'package:onezentra_mobile/features/standarisasi/standarisasi_service.dart';
import 'package:onezentra_mobile/features/validation/models/validation_models.dart';
import 'package:onezentra_mobile/features/validation/validation_service.dart';

const storageChannel = MethodChannel(
  'plugins.it_nomads.com/flutter_secure_storage',
);
const tokenStorageKey = 'ow_mobile_token';

/// Isi fake untuk `FlutterSecureStorage` supaya token bisa diperiksa di test.
final Map<String, String> fakeSecureStorage = <String, String>{};

/// Bila diisi, setiap panggilan storage melempar error ini — mensimulasikan
/// keystore Android yang rusak / plugin yang belum siap.
Object? secureStorageError;

/// Pasang mock platform channel secure storage (dipanggil sekali per file test
/// setelah binding terinisialisasi).
void installSecureStorageMock() {
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      .setMockMethodCallHandler(storageChannel, (call) async {
        if (secureStorageError != null) {
          throw secureStorageError!;
        }
        final args = (call.arguments as Map?) ?? const <String, dynamic>{};
        final key = args['key'] as String?;
        switch (call.method) {
          case 'read':
            return key == null
                ? fakeSecureStorage.values.toList()
                : fakeSecureStorage[key];
          case 'write':
            fakeSecureStorage[key!] = '${args['value']}';
            return null;
          case 'delete':
            if (key != null) {
              fakeSecureStorage.remove(key);
            }
            return null;
          case 'deleteAll':
            fakeSecureStorage.clear();
            return null;
          case 'containsKey':
            return key != null && fakeSecureStorage.containsKey(key);
        }
        return null;
      });
}

/// Bersihkan singleton [ApiClient] + storage di antara test.
Future<void> resetApiClient({String? token}) async {
  fakeSecureStorage.clear();
  secureStorageError = null;
  ApiClient.instance.onSessionEnded = null;
  await ApiClient.instance.persistToken(token);
}

/// Adapter HTTP canned — mengembalikan body JSON apa adanya tanpa jaringan.
/// Dipakai untuk menguji kode parsing ([AuthService]) dengan payload asli.
class CannedHttpAdapter implements HttpClientAdapter {
  CannedHttpAdapter(this.body, {this.statusCode = 200});

  final Object body;
  final int statusCode;

  final List<RequestOptions> requests = <RequestOptions>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    return ResponseBody.fromString(
      jsonEncode(body),
      statusCode,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

/// Payload `/api/v1/mobile/login` sesuai respons backend (`AuthController`
/// `mobileLogin`) — diambil dari server dev, token di-fakerkan.
Map<String, dynamic> mobileLoginResponse() => <String, dynamic>{
  'message': 'Login successful',
  'token': 'fake-token-abc',
  'token_type': 'Bearer',
  'expires_at': '2026-09-26T01:22:10+00:00',
  'permissions': ['gate.view', 'gate.create', 'gate.in'],
  'user': <String, dynamic>{
    'id': 1,
    'kode_depo': 'ADMIN',
    'nama_depo': 'Admin Utama',
    'full_name': 'Admin Utama',
    'email': 'admin@onezentra.com',
    'level': 'admin_master',
    'status': 'active',
    'created_at': '2026-09-20T13:00:06.000000Z',
    'updated_at': '2026-09-24T20:02:50.000000Z',
    'two_factor_confirmed_at': null,
    'roles': <Map<String, dynamic>>[
      <String, dynamic>{
        'id': 1,
        'name': 'Admin Master',
        'slug': 'admin_master',
        'description': 'Semua menu + setting',
        'is_active': true,
        'pivot': <String, dynamic>{'user_id': 1, 'role_id': 1},
      },
    ],
  },
};

DioException dioError(
  int status, {
  String? message,
  DioExceptionType type = DioExceptionType.badResponse,
}) {
  return DioException(
    requestOptions: RequestOptions(path: '/test'),
    type: type,
    response: Response<dynamic>(
      requestOptions: RequestOptions(path: '/test'),
      statusCode: status,
      data: message == null ? null : {'message': message},
    ),
  );
}

DioException networkError() => DioException(
  requestOptions: RequestOptions(path: '/test'),
  type: DioExceptionType.connectionError,
  error: 'connection refused',
);

const testUser = AuthUser(
  id: 1,
  kodeDepo: 'DPO',
  namaDepo: 'Depo Test',
  fullName: 'Gate User',
  email: 'gate@example.com',
  level: 'staff_logistic',
  status: 'active',
  roles: [],
);

/// DashboardService yang bisa dikontrol dari test.
class FakeDashboardService extends DashboardService {
  FakeDashboardService() : super(null);

  DashboardSummary summaryResult = DashboardSummary.empty;
  Object? summaryError;
  int calls = 0;

  @override
  Future<DashboardSummary> summary({String kodeDepo = ''}) async {
    calls++;
    if (summaryError != null) {
      throw summaryError!;
    }
    return summaryResult;
  }
}

/// Ringkasan beranda dengan satu modul terisi — cukup untuk memeriksa kartu
/// statistik muncul dengan angka yang benar.
DashboardSummary dashboardSummary({
  Map<String, int> totals = const <String, int>{'gate': 12, 'sj_validation': 3},
  Map<String, int> new7d = const <String, int>{'gate': 4},
  DashboardAlerts alerts = const DashboardAlerts(),
  DashboardQuality quality = const DashboardQuality(),
  DashboardSla sla = const DashboardSla(),
  List<DashboardRecentItem> recent = const <DashboardRecentItem>[],
}) {
  return DashboardSummary(
    totals: totals,
    new7d: new7d,
    alerts: alerts,
    quality: quality,
    sla: sla,
    recent: recent,
  );
}

/// AuthService yang bisa dikontrol dari test.
class FakeAuthService extends AuthService {
  FakeAuthService() : super(null);

  int meCalls = 0;
  int loginCalls = 0;
  int logoutCalls = 0;
  Object? meError;
  Object? loginError;

  @override
  Future<AuthSession> me() async {
    meCalls++;
    if (meError != null) {
      throw meError!;
    }
    return const AuthSession(
      user: testUser,
      permissions: ['gate.view', 'gate.create'],
    );
  }

  @override
  Future<AuthSession> login({
    required String email,
    required String password,
  }) async {
    loginCalls++;
    if (loginError != null) {
      throw loginError!;
    }
    return const AuthSession(
      user: testUser,
      permissions: ['gate.view'],
      token: 'token-abc',
    );
  }

  @override
  Future<void> logout() async {
    logoutCalls++;
  }
}

/// GateService yang bisa dikontrol dari test.
class FakeGateService extends GateService {
  FakeGateService() : super(null);

  GateStats statsResult = GateStats.empty;
  Object? statsError;

  /// Kalau diisi, `gateIn`/`gateOut`/`verify` melempar — untuk menguji bahwa
  /// kegagalan tidak salah dibaca sebagai berhasil (pesan snackbar & getar).
  Object? actionError;
  GateHistoryPage historyResult = const GateHistoryPage(
    items: [],
    currentPage: 1,
    lastPage: 1,
    total: 0,
  );
  Object? lookupError;
  RencanaKirimSummary? lookupResult;
  final List<String> calls = <String>[];

  /// Kalau diisi, `history()` menahan respons sampai gate ini diselesaikan —
  /// test bisa benar-benar mengamati state "sedang memuat" (skeleton) alih-alih
  /// melewati frame yang selesai sebelum sempat dirender.
  Completer<void>? historyGate;

  @override
  Future<GateStats> stats() async {
    if (statsError != null) {
      throw statsError!;
    }
    return statsResult;
  }

  @override
  Future<GateHistoryPage> history({String search = '', int page = 1}) async {
    calls.add('history:$page:$search');
    await historyGate?.future;
    return historyResult;
  }

  @override
  Future<RencanaKirimSummary> lookup(String nomor) async {
    calls.add('lookup:$nomor');
    if (lookupError != null) {
      throw lookupError!;
    }
    return lookupResult ??
        const RencanaKirimSummary(
          id: 1,
          poTransporter: 'PO-1',
          nopol: 'B 1 AA',
          driverName: 'Budi',
          status: 'SCHEDULED',
        );
  }

  @override
  Future<String> gateIn(RencanaKirimSummary rk) async {
    calls.add('gateIn:${rk.poTransporter}');
    if (actionError != null) {
      throw actionError!;
    }
    return 'CHECKED_IN';
  }

  @override
  Future<String> gateOut(RencanaKirimSummary rk) async {
    calls.add('gateOut:${rk.poTransporter}');
    if (actionError != null) {
      throw actionError!;
    }
    return 'COMPLETED';
  }

  @override
  Future<String> verify(int rencanaKirimId) async {
    calls.add('verify:$rencanaKirimId');
    if (actionError != null) {
      throw actionError!;
    }
    return 'VERIFIED';
  }
}

RencanaKirimSummary rencana(
  String status, {
  int id = 1,
  String po = 'PO-1',
  String nopol = 'B 1 AA',
  String driver = 'Budi',
}) {
  return RencanaKirimSummary(
    id: id,
    poTransporter: po,
    nopol: nopol,
    driverName: driver,
    status: status,
  );
}

GateTransactionItem historyItem({
  int id = 1,
  String gateType = 'INBOUND',
  String po = 'PO-1',
  String nopol = 'B 1 AA',
  String driver = 'Budi',
  String rkStatus = 'CHECKED_IN',
  String scanTime = '2026-09-25T10:00:00Z',
}) {
  return GateTransactionItem(
    id: id,
    gateType: gateType,
    poTransporter: po,
    nopol: nopol,
    driverName: driver,
    scanTime: scanTime,
    rkStatus: rkStatus,
  );
}

/// ValidationService yang bisa dikontrol dari test.
class FakeValidationService extends ValidationService {
  FakeValidationService() : super(null);

  SjValidation? result;
  Object? startError;
  Object? showError;

  /// Kalau diisi, `show()` menahan respons sampai gate ini diselesaikan — test
  /// bisa melihat state "sedang menyegarkan" tanpa jalan pintas `pumpAndSettle`.
  Completer<void>? showGate;
  Object? scanError;
  Object? completeError;
  Object? deleteError;
  final List<String> calls = <String>[];

  /// Panggilan daftar & statistik dicatat terpisah dari [calls] supaya test
  /// yang mengecek "layar tidak membuka dokumen sendiri" tidak ikut gagal
  /// hanya karena worklist dimuat.
  final List<String> listCalls = <String>[];
  ValidationListPage listResult = const ValidationListPage(
    entries: [],
    currentPage: 1,
    lastPage: 1,
    total: 0,
  );
  Object? listError;
  ValidationStats statsResult = ValidationStats.empty;
  Object? statsError;
  int statsCalls = 0;

  /// Kalau diisi, `list()` menahan respons sampai gate ini diselesaikan —
  /// test bisa benar-benar mengamati state "sedang memuat" (skeleton) alih-alih
  /// melewati frame yang finished sebelum sempat dirender.
  Completer<void>? listGate;

  /// Override agar UI test bisa memaksa item tertentu jadi MISMATCH.
  bool nextItemIsMismatch = true;

  @override
  Future<ValidationListPage> list({
    String search = '',
    String? status,
    int page = 1,
  }) async {
    listCalls.add('list:$page:${status ?? '-'}:$search');
    if (listError != null) {
      throw listError!;
    }
    await listGate?.future;
    return listResult;
  }

  @override
  Future<ValidationStats> stats() async {
    statsCalls++;
    if (statsError != null) {
      throw statsError!;
    }
    return statsResult;
  }

  @override
  Future<SjValidation> startByCode(String scanCode) async {
    calls.add('start:$scanCode');
    if (startError != null) {
      throw startError!;
    }
    return result ?? sjValidation();
  }

  @override
  Future<SjValidation> startByRencanaKirim(int rencanaKirimId) async {
    calls.add('startRencana:$rencanaKirimId');
    if (startError != null) {
      throw startError!;
    }
    return result ?? sjValidation();
  }

  @override
  Future<SjValidation> show(int validationId) async {
    calls.add('show:$validationId');
    if (showError != null) {
      throw showError!;
    }
    await showGate?.future;
    return result ?? sjValidation();
  }

  @override
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
    calls.add(
      'scan:$itemId:$actualQty:${condition ?? '-'}:${photoPath ?? '-'}',
    );
    if (scanError != null) {
      throw scanError!;
    }
    return validationItem(
      id: itemId,
      actualQty: actualQty,
      barcode: barcode ?? '',
      condition: condition ?? conditionGood,
      expiredDate: expiredDate,
      status: nextItemIsMismatch ? statusMismatch : statusValidated,
    );
  }

  @override
  Future<SjValidation> complete(int validationId) async {
    calls.add('complete:$validationId');
    if (completeError != null) {
      throw completeError!;
    }
    return (result ?? sjValidation()).copyWith(status: statusCompleted);
  }

  @override
  Future<void> cancel(int validationId) async {
    calls.add('cancel:$validationId');
  }

  @override
  Future<SjValidation> deleteItem(int validationId, int itemId) async {
    calls.add('deleteItem:$itemId');
    if (deleteError != null) {
      throw deleteError!;
    }
    final current = result ?? sjValidation();
    return current.copyWith(
      items: current.items.where((i) => i.id != itemId).toList(),
    );
  }
}

/// StandarisasiService yang bisa dikontrol dari test.
class FakeStandarisasiService extends StandarisasiService {
  FakeStandarisasiService() : super(null);

  StandarisasiListPage listResult = const StandarisasiListPage(
    entries: [],
    currentPage: 1,
    lastPage: 1,
    total: 0,
  );
  StandarisasiStats statsResult = StandarisasiStats.empty;
  List<NpnProduct> productResult = const <NpnProduct>[];

  Object? listError;
  Object? statsError;
  Object? searchError;
  Object? createError;
  Object? approveError;
  Object? rejectError;

  /// Kalau diisi, `list()` menahan respons sampai gate selesai — test bisa
  /// benar-benar melihat skeleton tanpa melewati frame yang finished.
  Completer<void>? listGate;

  final List<String> calls = <String>[];

  /// Permintaan yang benar-benar terkirim (dipakai test form untuk memeriksa
  /// tier/tinggi yang sudah di-clamp).
  final List<({int npnId, int tier, int tinggi})> creates =
      <({int npnId, int tier, int tinggi})>[];
  final List<({int id, bool approve})> decisions = <({int id, bool approve})>[];

  @override
  Future<StandarisasiListPage> list({
    String search = '',
    String? status,
    int page = 1,
  }) async {
    calls.add('list:$page:${status ?? '-'}:$search');
    if (listError != null) {
      throw listError!;
    }
    await listGate?.future;
    return listResult;
  }

  @override
  Future<StandarisasiStats> stats({String search = ''}) async {
    calls.add('stats:$search');
    if (statsError != null) {
      throw statsError!;
    }
    return statsResult;
  }

  @override
  Future<List<NpnProduct>> searchProduct(String term) async {
    calls.add('search:$term');
    if (searchError != null) {
      throw searchError!;
    }
    return productResult;
  }

  @override
  Future<StandarisasiTumpukan> get(int id) async {
    calls.add('get:$id');
    return stackRow(id: id);
  }

  @override
  Future<StandarisasiTumpukan> create({
    required int npnId,
    required int tier,
    required int tinggiTumpukan,
  }) async {
    calls.add('create:$npnId:$tier:$tinggiTumpukan');
    creates.add((npnId: npnId, tier: tier, tinggi: tinggiTumpukan));
    if (createError != null) {
      throw createError!;
    }
    return stackRow(id: 99, npnId: npnId, tier: tier, tinggi: tinggiTumpukan);
  }

  @override
  Future<StandarisasiTumpukan> approve(int id) async {
    calls.add('approve:$id');
    decisions.add((id: id, approve: true));
    if (approveError != null) {
      throw approveError!;
    }
    return stackRow(id: id, status: standarisasiStatusApproved);
  }

  @override
  Future<StandarisasiTumpukan> reject(int id) async {
    calls.add('reject:$id');
    decisions.add((id: id, approve: false));
    if (rejectError != null) {
      throw rejectError!;
    }
    return stackRow(id: id, status: standarisasiStatusRejected);
  }
}

SjValidationItem validationItem({
  int id = 1,
  String kode = 'BRG-1',
  String nama = 'Beras Premium 5kg',
  double expectedQty = 100,
  double? actualQty,
  String satuan = 'KG',
  String condition = conditionGood,
  String status = statusPending,
  String barcode = '',
  String? expiredDate,
  int? umur,
  StandarisasiTumpukan? standarisasi,
}) {
  return SjValidationItem(
    id: id,
    kodeBarang: kode,
    namaBarang: nama,
    expectedQty: expectedQty,
    actualQty: actualQty,
    satuan: satuan,
    condition: condition,
    status: status,
    barcode: barcode,
    expiredDate: expiredDate,
    umur: umur,
    // Default-nya produk **sudah** punya standarisasi yang disetujui: tanpa
    // itu gerbang item akan mengarahkan operator ke halaman Standarisasi dan
    // form item tidak pernah terbuka. Test gerbang menyetelnya ke `pending`/null.
    standarisasi: standarisasi ?? approvedStack(),
  );
}

/// Item validasi yang produknya belum punya baris standarisasi **sama sekali**
/// (`standarisasi: null`) — bentuk item yang masih perlu diuji gerbangnya,
/// karena [validationItem] selalu menyertakan standarisasi yang disetujui.
SjValidationItem validationItemWithoutStack({int id = 1}) {
  return SjValidationItem(
    id: id,
    kodeBarang: 'BRG-1',
    namaBarang: 'Beras Premium 5kg',
    expectedQty: 100,
    actualQty: null,
    satuan: 'KG',
    condition: conditionGood,
    status: statusPending,
    barcode: '',
    expiredDate: null,
    umur: null,
  );
}

/// Standarisasi yang sudah disetujui BLC — kondisi yang membuat item boleh
/// diperiksa.
StandarisasiTumpukan approvedStack({
  int id = 1,
  int npnId = 1,
  int tier = 3,
  int tinggi = 2,
  NpnProduct? product,
}) {
  return StandarisasiTumpukan(
    id: id,
    npnId: npnId,
    tier: tier,
    tinggiTumpukan: tinggi,
    totalTierTinggi: tier * tinggi,
    status: standarisasiStatusApproved,
    npn: product,
    requestedByEmail: 'requester@onezentra.com',
    approvedByEmail: 'blc@onezentra.com',
    kodeDepo: 'DEP01',
    namaDepo: 'Depo Jakarta',
    createdAt: '2026-09-20T08:00:00Z',
    updatedAt: '2026-09-21T08:00:00Z',
  );
}

/// Baris daftar Standarisasi Tumpukan untuk test layar/daftarnya.
StandarisasiTumpukan stackRow({
  int id = 1,
  int npnId = 1,
  int tier = 3,
  int tinggi = 2,
  String status = standarisasiStatusPending,
  NpnProduct? product,
  String? requestedByEmail = 'requester@onezentra.com',
  String? approvedByEmail,
  String? kodeDepo = 'DEP01',
  String? namaDepo = 'Depo Jakarta',
}) {
  return StandarisasiTumpukan(
    id: id,
    npnId: npnId,
    tier: tier,
    tinggiTumpukan: tinggi,
    totalTierTinggi: tier * tinggi,
    status: status,
    npn: product ?? npnProduct(),
    requestedByEmail: requestedByEmail,
    approvedByEmail: approvedByEmail,
    kodeDepo: kodeDepo,
    namaDepo: namaDepo,
    createdAt: '2026-09-20T08:00:00Z',
    updatedAt: approvedByEmail == null ? null : '2026-09-21T08:00:00Z',
  );
}

/// Produk master untuk form/picker standarisasi.
NpnProduct npnProduct({
  int id = 1,
  String bosId = '1000001',
  String sapId = '2000001',
  String barcode = '8991002101215',
  String? name = 'Beras Premium 5kg',
}) {
  return NpnProduct(
    id: id,
    bosId: bosId,
    sapId: sapId,
    barcode: barcode,
    shortDescription: name,
  );
}

SjValidation sjValidation({
  int id = 7,
  String po = 'PO-7788',
  String nopol = 'B 9 ZZ',
  String driver = 'Siti',
  String status = statusInProgress,
  List<SjValidationItem>? items,
}) {
  return SjValidation(
    id: id,
    status: status,
    poTransporter: po,
    nopol: nopol,
    driverName: driver,
    destinationName: 'Gudang Jakarta',
    validatorName: 'Admin Utama',
    items: items ?? <SjValidationItem>[validationItem()],
  );
}

/// Baris "Daftar Validasi" — bentuknya mengikuti payload `GET /sj-validations`.
SjValidationSummary validationSummary({
  int id = 7,
  String po = 'PO-7788',
  String nopol = 'B 9 ZZ',
  String driver = 'Siti',
  String tujuan = 'Gudang Jakarta',
  String status = statusInProgress,
  String? startedAt = '2026-09-26T02:10:00.000000Z',
  String? completedAt,
}) {
  return SjValidationSummary(
    id: id,
    status: status,
    poTransporter: po,
    nopol: nopol,
    driverName: driver,
    destinationName: tujuan,
    validatorName: 'Admin Utama',
    startedAt: startedAt,
    completedAt: completedAt,
  );
}

/// Halaman daftar berisi satu entri + statistik yang konsisten.
ValidationListPage listPage(
  List<SjValidationSummary> entries, {
  int lastPage = 1,
}) {
  return ValidationListPage(
    entries: entries,
    currentPage: 1,
    lastPage: lastPage,
    total: entries.length,
  );
}
