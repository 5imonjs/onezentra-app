import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

/// API Client for OneZentra Mobile
///
/// Handles all HTTP requests with authentication.
///
/// The bearer token is stored in [FlutterSecureStorage] (iOS Keychain / Android
/// EncryptedSharedPreferences) instead of [SharedPreferences] so it cannot be
/// read from a plain-text backup. The user profile is not a secret, so it
/// stays in [SharedPreferences].
class ApiClient {
  // Singleton pattern
  factory ApiClient() => _instance;
  ApiClient._internal();

  static final ApiClient _instance = ApiClient._internal();

  /// Base URL of the OneZentra API.
  ///
  /// Can be overridden per build without touching the source:
  /// `flutter run --dart-define=API_BASE_URL=http://192.168.1.5:8000/api/v1`
  static const String _overrideBaseUrl = String.fromEnvironment('API_BASE_URL');

  /// The Android emulator cannot reach the host machine on `localhost`.
  ///
  /// [kIsWeb] is checked first: `Platform.isAndroid` throws UnsupportedError
  /// in a web build (dart:io is not implemented there).
  static String get _platformBaseUrl {
    if (kIsWeb) return 'http://localhost:8000/api/v1';
    return Platform.isAndroid
        ? 'http://10.0.2.2:8000/api/v1' // host machine, seen from the Android emulator
        : 'http://localhost:8000/api/v1'; // iOS simulator / desktop
  }

  static String get resolvedBaseUrl =>
      _overrideBaseUrl.isNotEmpty ? _overrideBaseUrl : _platformBaseUrl;

  /// Hard limit per request, so a dead network can never leave a loading
  /// indicator (or the login button) spinning forever.
  static const Duration requestTimeout = Duration(seconds: 20);

  static const String _tokenKey = 'auth_token';
  static const String _expiresAtKey = 'auth_token_expires_at';
  static const String _userKey = 'auth_user';

  static const FlutterSecureStorage _secureStorage = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  String? _token;
  Map<String, dynamic>? _user;
  DateTime? _expiresAt;

  /// Called when the server rejects the stored token, so the app can drop the
  /// local session and send the user back to the login screen.
  void Function()? onUnauthorized;

  String get baseUrl => resolvedBaseUrl;
  String? get token => _token;
  Map<String, dynamic>? get user => _user;
  DateTime? get expiresAt => _expiresAt;
  bool get isAuthenticated => _token != null && _user != null && !isExpired;

  /// The Sanctum token carries its own expiry. A token that is about to expire
  /// is treated as expired so we fail fast instead of waiting for a 401.
  bool get isExpired {
    var expiry = _expiresAt;
    if (expiry == null) return false;
    return !DateTime.now().isBefore(
      expiry.subtract(const Duration(seconds: 30)),
    );
  }

  /// Initialize the client (load token from storage)
  Future<void> init() async {
    _token = await _readSecure(_tokenKey);

    var prefs = await SharedPreferences.getInstance();
    if (_token == null) {
      // One-time migration from the previous plain-text storage.
      var legacyToken = prefs.getString(_tokenKey);
      if (legacyToken != null && legacyToken.isNotEmpty) {
        _token = legacyToken;
        await _writeSecure(_tokenKey, legacyToken);
        await prefs.remove(_tokenKey);
      }
    }

    var expiresAt = await _readSecure(_expiresAtKey);
    _expiresAt = expiresAt == null ? null : DateTime.tryParse(expiresAt);

    var userJson = prefs.getString(_userKey);
    if (userJson != null && userJson.isNotEmpty) {
      _user = _decodeMap(userJson);
    }
  }

  /// Set auth token and user data
  Future<void> setAuth(
    String token,
    Map<String, dynamic> user, {
    String? expiresAt,
  }) async {
    var expiry = expiresAt == null ? null : DateTime.tryParse(expiresAt);

    _token = token;
    _user = user;
    _expiresAt = expiry;

    await _writeSecure(_tokenKey, token);
    if (expiry == null) {
      await _secureStorage.delete(key: _expiresAtKey);
    } else {
      await _writeSecure(_expiresAtKey, expiry.toIso8601String());
    }

    var prefs = await SharedPreferences.getInstance();
    await prefs.setString(_userKey, jsonEncode(user));
  }

  /// Clear auth data (logout)
  Future<void> clearAuth() async {
    _token = null;
    _user = null;
    _expiresAt = null;

    await _secureStorage.delete(key: _tokenKey);
    await _secureStorage.delete(key: _expiresAtKey);

    var prefs = await SharedPreferences.getInstance();
    await prefs.remove(_userKey);
  }

  /// Get headers for authenticated requests
  Map<String, String> _getHeaders({bool requireAuth = true}) {
    var headers = <String, String>{
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    if (requireAuth && _token != null) {
      headers['Authorization'] = 'Bearer $_token';
    }

    return headers;
  }

  /// Handle response and throw on error
  dynamic _handleResponse(http.Response response, String endpoint) {
    var body = _decodeBody(response);

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return body;
    }

    if (response.statusCode == 401 && !endpoint.contains('login')) {
      unawaited(_handleUnauthorized());
    }

    throw ApiException(
      _errorMessage(response.statusCode, body),
      response.statusCode,
      body,
    );
  }

  /// Decodes a JSON object body, tolerating empty bodies and non-JSON error
  /// pages (proxy/gateway HTML) instead of throwing a [FormatException].
  Map<String, dynamic>? _decodeBody(http.Response response) {
    if (response.bodyBytes.isEmpty) return null;
    try {
      return _decodeMap(utf8.decode(response.bodyBytes));
    } catch (_) {
      return null;
    }
  }

  Map<String, dynamic>? _decodeMap(String raw) {
    var decoded = jsonDecode(raw);
    return decoded is Map<String, dynamic> ? decoded : null;
  }

  /// Builds a message the user can act on, in the language of the app.
  String _errorMessage(int statusCode, Map<String, dynamic>? body) {
    if (statusCode == 401) return 'Sesi berakhir. Silakan login kembali.';
    if (statusCode == 403) return 'Anda tidak memiliki akses ke data ini.';
    if (statusCode == 429) {
      return 'Terlalu banyak percobaan. Tunggu 1 menit lalu coba lagi.';
    }
    if (statusCode >= 500) {
      return 'Server sedang bermasalah. Silakan coba lagi nanti.';
    }

    var validationError = _firstValidationMessage(body);
    if (validationError != null) return validationError;

    var serverMessage = body?['message']?.toString();
    if (serverMessage != null && serverMessage.isNotEmpty) return serverMessage;

    return 'Permintaan gagal (HTTP $statusCode).';
  }

  /// Laravel validation errors arrive as `{"errors": {"email": ["..."]}}`.
  String? _firstValidationMessage(Map<String, dynamic>? body) {
    var errors = body?['errors'];
    if (errors is! Map) return null;

    for (var messages in errors.values) {
      if (messages is List && messages.isNotEmpty) {
        return messages.first.toString();
      }
    }
    return null;
  }

  Future<void> _handleUnauthorized() async {
    await clearAuth();
    onUnauthorized?.call();
  }

  /// GET request
  Future<dynamic> get(String endpoint, {bool requireAuth = true}) => _send(
    endpoint,
    () => http.get(
      _uri(endpoint),
      headers: _getHeaders(requireAuth: requireAuth),
    ),
    requireAuth: requireAuth,
  );

  /// POST request
  Future<dynamic> post(
    String endpoint,
    Map<String, dynamic> body, {
    bool requireAuth = true,
  }) => _send(
    endpoint,
    () => http.post(
      _uri(endpoint),
      headers: _getHeaders(requireAuth: requireAuth),
      body: jsonEncode(body),
    ),
    requireAuth: requireAuth,
  );

  /// PUT request
  Future<dynamic> put(
    String endpoint,
    Map<String, dynamic> body, {
    bool requireAuth = true,
  }) => _send(
    endpoint,
    () => http.put(
      _uri(endpoint),
      headers: _getHeaders(requireAuth: requireAuth),
      body: jsonEncode(body),
    ),
    requireAuth: requireAuth,
  );

  /// PATCH request
  Future<dynamic> patch(
    String endpoint,
    Map<String, dynamic> body, {
    bool requireAuth = true,
  }) => _send(
    endpoint,
    () => http.patch(
      _uri(endpoint),
      headers: _getHeaders(requireAuth: requireAuth),
      body: jsonEncode(body),
    ),
    requireAuth: requireAuth,
  );

  /// DELETE request
  Future<dynamic> delete(String endpoint, {bool requireAuth = true}) => _send(
    endpoint,
    () => http.delete(
      _uri(endpoint),
      headers: _getHeaders(requireAuth: requireAuth),
    ),
    requireAuth: requireAuth,
  );

  Uri _uri(String endpoint) => Uri.parse('$baseUrl$endpoint');

  /// Runs an HTTP call with a hard timeout and maps transport failures to
  /// messages the user can understand.
  Future<dynamic> _send(
    String endpoint,
    Future<http.Response> Function() request, {
    required bool requireAuth,
  }) async {
    if (requireAuth && isExpired) {
      unawaited(_handleUnauthorized());
      throw const ApiException('Sesi berakhir. Silakan login kembali.', 401);
    }

    http.Response response;
    try {
      response = await request().timeout(requestTimeout);
    } on Object catch (error) {
      throw mapTransportError(error);
    }

    return _handleResponse(response, endpoint);
  }

  /// Translates a transport failure into an [ApiException] carrying a message
  /// the user can act on.
  ///
  /// Exposed for tests: [HttpClient] cannot be stubbed, so the mapping itself
  /// is verified directly. Any failure not listed still becomes an
  /// [ApiException] rather than escaping as a raw error, because the login
  /// screen can only surface a generic message for unmapped exceptions.
  static ApiException mapTransportError(Object error) {
    if (error is ApiException) return error;

    if (error is TimeoutException) {
      return const ApiException(
        'Server tidak merespons. Periksa koneksi Anda lalu coba lagi.',
        0,
      );
    }
    if (error is HandshakeException) {
      return const ApiException(
        'Koneksi aman tidak dapat dibuat. Periksa konfigurasi server.',
        0,
      );
    }
    if (error is TlsException) {
      return const ApiException(
        'Sertifikat server ditolak. Periksa konfigurasi keamanan server.',
        0,
      );
    }
    if (error is http.ClientException) {
      return const ApiException(
        'Gagal menghubungi server. Periksa koneksi Anda.',
        0,
      );
    }
    if (error is SocketException) {
      return const ApiException(
        'Tidak ada koneksi ke server. Periksa jaringan Anda.',
        0,
      );
    }
    if (error is HttpException) {
      // Truncated response or incomplete headers. Common against
      // `php artisan serve`, whose single-threaded PHP server drops
      // connections when a second request overlaps the first.
      return const ApiException(
        'Koneksi ke server terputus di tengah transfer. Silakan coba lagi.',
        0,
      );
    }

    debugPrint(
      'ApiClient: unhandled transport error ${error.runtimeType}: $error',
    );
    return const ApiException(
      'Tidak ada koneksi ke server. Periksa jaringan Anda.',
      0,
    );
  }

  /// Secure storage is not available on every platform (e.g. a Linux host used
  /// for `flutter test -d linux`), so a failure must not break the session.
  Future<String?> _readSecure(String key) async {
    try {
      return await _secureStorage.read(key: key);
    } catch (_) {
      return null;
    }
  }

  Future<void> _writeSecure(String key, String value) async {
    try {
      await _secureStorage.write(key: key, value: value);
    } catch (_) {
      // The token stays in memory for this run; the next login will retry.
    }
  }
}

/// Custom exception for API errors
class ApiException implements Exception {
  const ApiException(this.message, this.statusCode, [this.data]);
  final String message;
  final int statusCode;
  final dynamic data;

  /// The stored token was rejected or has expired.
  bool get isUnauthorized => statusCode == 401;

  /// The login endpoint is rate limited (throttle:10,1 on the server).
  bool get isRateLimited => statusCode == 429;

  /// The request never reached the server (offline, DNS, TLS, timeout).
  bool get isConnectionIssue => statusCode == 0;

  @override
  String toString() => 'ApiException: $message (Status: $statusCode)';
}
