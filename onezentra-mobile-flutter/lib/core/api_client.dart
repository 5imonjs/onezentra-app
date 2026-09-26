import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Base URL API — sama seperti web (`NEXT_PUBLIC_API_URL`) & app Expo
/// (`EXPO_PUBLIC_API_URL`). Di-override via `--dart-define=API_URL=...`.
///
/// `localhost` hanya bisa dijangkau dari emulator/simulator; untuk perangkat
/// fisik gunakan IP LAN (mis. `http://192.168.1.10:8000/api/v1`) atau HTTPS
/// domain production, dan build dengan dart-define tersebut.
const apiUrl = String.fromEnvironment(
  'API_URL',
  defaultValue: 'http://localhost:8000/api/v1',
);

const _tokenKey = 'ow_mobile_token';

/// Host:port API yang sedang dituju. ditampilkan pada pesan koneksi gagal
/// supaya salah konfigurasi `API_URL` (mis. `localhost` di emulator Android,
/// yang seharusnya `10.0.2.2`) langsung terlihat oleh operator — bukan hanya
/// di log debug.
String get apiHost {
  final uri = Uri.tryParse(apiUrl);
  if (uri == null || uri.host.isEmpty) {
    return apiUrl;
  }
  return uri.hasPort ? '${uri.host}:${uri.port}' : uri.host;
}

/// Pesan seragam saat tidak ada respons server (timeout/offline) — jauh lebih
/// berguna daripada pesan teknis Dio untuk operator gudang.
String get networkErrorMessage =>
    'Tidak dapat terhubung ke $apiHost. Periksa koneksi Anda.';

/// Pesan error konsisten dengan `getErrorMessage` web & `parseLoginError` Expo.
String parseLoginError(Object e) {
  if (e is DioException) {
    final data = e.response?.data;
    String validationMessage = '';
    if (data is Map) {
      final errors = data['errors'];
      if (errors is Map &&
          errors['email'] is List &&
          (errors['email'] as List).isNotEmpty) {
        validationMessage = '${errors['email'][0]}';
      } else if (data['message'] is String) {
        validationMessage = data['message'] as String;
      }
    }
    final isInvalidCredentials =
        e.response?.statusCode == 401 ||
        validationMessage.toLowerCase().contains('credentials');
    if (isInvalidCredentials) return 'Email atau password salah.';
    if (validationMessage.isNotEmpty) return validationMessage;
    if (e.response == null && !isNetworkNoise(e)) return networkErrorMessage;
    if (e.message != null && e.message!.isNotEmpty) return e.message!;
  }
  return 'Login gagal.';
}

String apiErrorMessage(Object e, [String fallback = 'Terjadi kesalahan']) {
  if (e is DioException) {
    final data = e.response?.data;
    if (data is Map) {
      if (e.response?.statusCode == 403) {
        final message = data['message'];
        return message is String && message.isNotEmpty
            ? message
            : 'Anda tidak memiliki izin untuk melakukan aksi ini.';
      }
      final errors = data['errors'];
      if (errors is Map) {
        final details = errors.values
            .expand((m) => m is List ? m : [m])
            .whereType<String>()
            .where((s) => s.isNotEmpty)
            .join(' ');
        if (details.isNotEmpty) return details;
      }
      final message = data['message'];
      if (message is String && message.isNotEmpty) return message;
    }
    // Tidak ada respons server → masalah jaringan, bukan validasi.
    if (e.response == null && !isNetworkNoise(e)) return networkErrorMessage;
    if (e.message != null && e.message!.isNotEmpty) return e.message!;
  }
  return fallback;
}

/// Exception yang tidak perlu dibedakan dari user's perspective (mis.
/// request dibatalkan karena pindah halaman).
bool isNetworkNoise(Object e) =>
    e is DioException && e.type == DioExceptionType.cancel;

/// Status HTTP yang berarti sesi/token sudah tidak valid.
bool isSessionExpired(Object e) {
  if (e is! DioException) return false;
  final code = e.response?.statusCode;
  return code == 401 || code == 403;
}

/// Klien HTTP tunggal + penjual/pemegang token sesi.
///
/// `onSessionEnded` dipanggil **satu kali** setiap sesi berakhir (logout
/// manual maupun 401 dari server) supaya seluruh provider bisa membersihkan
/// state sensitif bersamaan — tanpa itu, data user sebelumnya masih tertinggal
/// di memory setelah pergantian akun.
class ApiClient {
  ApiClient._();
  static final ApiClient instance = ApiClient._();

  final Dio dio = Dio(
    BaseOptions(
      baseUrl: apiUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 15),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    ),
  );

  final _storage = const FlutterSecureStorage();
  String? _token;
  bool _initialized = false;

  /// Dipanggil setelah token lokal dihapus (logout atau 401).
  VoidCallback? onSessionEnded;

  String? get token => _token;
  bool get hasToken => _token != null;

  /// Bootstrap klien. **Tidak pernah melempar**: `main()`.await`init()`,
  /// jadi error apa pun di sini membuat aplikasi tidak pernah menampilkan
  /// login sama sekali.
  Future<void> init() async {
    if (_initialized) {
      return;
    }
    _initialized = true;
    if (kDebugMode) {
      debugPrint('[ONEZENTRA] API base URL: $apiUrl');
    }
    await restoreToken();
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          if (_token != null) {
            options.headers['Authorization'] = 'Bearer $_token';
          }
          handler.next(options);
        },
        onError: (error, handler) async {
          // 401 di luar /mobile/login → sesi dianggap habis. Jangan hapus
          // token saat 403: itu soal izin, bukan autentikasi.
          if (error.response?.statusCode == 401 &&
              !error.requestOptions.path.contains('/mobile/login')) {
            await clearSession();
          }
          if (kDebugMode) {
            debugPrint(
              '[ONEZENTRA] ${error.requestOptions.method} '
              '${error.requestOptions.path} -> '
              '${error.response?.statusCode ?? error.type.name}',
            );
          }
          handler.next(error);
        },
      ),
    );
  }

  /// Baca token tersimpan. Kegagalan storage (mis. keystore Android rusak,
  /// plugin belum siap) diperlakukan sebagai "tidak ada sesi" — user tetap
  /// sampai ke layar login daripada melihat layar kosong.
  Future<void> restoreToken() async {
    try {
      _token = await _storage.read(key: _tokenKey);
    } catch (e) {
      _token = null;
      if (kDebugMode) {
        debugPrint('[ONEZENTRA] gagal membaca token tersimpan: $e');
      }
    }
  }

  /// Simpan/buang token. Error storage **tidak** dilempar: kalau `write` gagal,
  /// user tetap login untuk sesi berjalan (token dipakai dari memory) alih-alih
  /// mendapat "Login gagal." padahal kredensialnya benar.
  Future<void> persistToken(String? token) async {
    _token = token;
    try {
      if (token == null) {
        await _storage.delete(key: _tokenKey);
      } else {
        await _storage.write(key: _tokenKey, value: token);
      }
    } catch (e) {
      if (kDebugMode) {
        debugPrint('[ONEZENTRA] gagal menyimpan token: $e');
      }
    }
  }

  /// Buang token + beri tahu aplikasi. Idempoten: `onSessionEnded` hanya
  /// dipanggil bila sebelumnya memang ada sesi, jadi 401 dari beberapa
  /// request paralel tidak memicu rebuild berulang.
  Future<void> clearSession() async {
    final hadSession = _token != null;
    _token = null;
    try {
      await _storage.delete(key: _tokenKey);
    } catch (e) {
      if (kDebugMode) {
        debugPrint('[ONEZENTRA] gagal menghapus token: $e');
      }
    }
    if (hadSession) {
      onSessionEnded?.call();
    }
  }
}
