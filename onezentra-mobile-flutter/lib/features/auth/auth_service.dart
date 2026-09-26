import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:onezentra_mobile/core/api_client.dart';
import 'package:onezentra_mobile/features/auth/auth_user.dart';

/// Hasil autentikasi: user + permission + token (token hanya ada saat login).
class AuthSession {
  const AuthSession({
    required this.user,
    required this.permissions,
    this.token,
  });

  final AuthUser user;
  final List<String> permissions;

  /// `null` saat sesi dipulihkan dari storage (token sudah dibaca terpisah).
  final String? token;

  static List<String> permissionList(Object? raw) =>
      ((raw as List?) ?? []).map((e) => '$e').toList();

  static Map<String, dynamic> userMap(Object? raw) =>
      Map<String, dynamic>.from(raw as Map);
}

/// Akses endpoint autentikasi — mirror `AuthController` (`mobileLogin`,
/// `mobileLogout`, `user`) di backend. Dipisah dari provider supaya state
/// bisa diuji tanpa jaringan.
class AuthService {
  AuthService([Dio? dio]) : _dio = dio ?? ApiClient.instance.dio;

  final Dio _dio;

  Future<AuthSession> login({
    required String email,
    required String password,
  }) async {
    final res = await _dio.post(
      '/mobile/login',
      data: {
        'email': email.trim(),
        'password': password,
        'device_name': '${defaultTargetPlatform.name}-mobile',
      },
    );
    final data = Map<String, dynamic>.from(res.data as Map);
    return AuthSession(
      user: AuthUser.fromJson(AuthSession.userMap(data['user'])),
      permissions: AuthSession.permissionList(data['permissions']),
      token: data['token'] as String?,
    );
  }

  Future<AuthSession> me() async {
    final res = await _dio.get('/user');
    final data = Map<String, dynamic>.from(res.data as Map);
    return AuthSession(
      user: AuthUser.fromJson(AuthSession.userMap(data['user'])),
      permissions: AuthSession.permissionList(data['permissions']),
    );
  }

  Future<void> logout() async {
    await _dio.post('/mobile/logout');
  }
}
