import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Base URL API — sama seperti web (`NEXT_PUBLIC_API_URL`) & app Expo
/// (`EXPO_PUBLIC_API_URL`). Di-override via `--dart-define=API_URL=...`.
const apiUrl = String.fromEnvironment(
  'API_URL',
  defaultValue: 'http://localhost:8000/api/v1',
);
final apiRoot = apiUrl.replaceFirst(RegExp(r'/api/v1/?$'), '');

const _tokenKey = 'ow_mobile_token';

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
    if (e.message != null && e.message!.isNotEmpty) return e.message!;
  }
  return 'Login gagal.';
}

String apiErrorMessage(Object e, [String fallback = 'Terjadi kesalahan']) {
  if (e is DioException) {
    final data = e.response?.data;
    if (data is Map) {
      if (e.response?.statusCode == 403) {
        return (data['message'] as String?) ??
            'Anda tidak memiliki izin untuk melakukan aksi ini.';
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
      if (data['message'] is String && (data['message'] as String).isNotEmpty) {
        return data['message'] as String;
      }
    }
    if (e.message != null && e.message!.isNotEmpty) return e.message!;
  }
  return fallback;
}

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
  VoidCallback? onUnauthorized;

  String? get token => _token;

  Future<void> init() async {
    _token = await _storage.read(key: _tokenKey);
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          if (_token != null) {
            options.headers['Authorization'] = 'Bearer $_token';
          }
          handler.next(options);
        },
        onError: (error, handler) {
          // 401 di luar /mobile/login → buang token lokal (mirror interceptor Expo).
          if (error.response?.statusCode == 401 &&
              !(error.requestOptions.path.contains('/mobile/login'))) {
            _token = null;
            _storage.delete(key: _tokenKey);
            onUnauthorized?.call();
          }
          handler.next(error);
        },
      ),
    );
  }

  Future<void> persistToken(String? token) async {
    _token = token;
    if (token == null) {
      await _storage.delete(key: _tokenKey);
    } else {
      await _storage.write(key: _tokenKey, value: token);
    }
  }
}
