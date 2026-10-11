import 'dart:io';

import 'package:flutter/foundation.dart';

import 'package:onezentra_mobile/core/network/api_client.dart';
import 'package:onezentra_mobile/features/auth/models/auth_models.dart';

/// Auth Repository - handles authentication API calls
class AuthRepository {
  /// Dependencies are injectable so widget tests can run without a network.
  AuthRepository({
    ApiClient? apiClient,
    Future<dynamic> Function(String endpoint, Map<String, dynamic> body)? post,
  }) : _apiClient = apiClient ?? ApiClient(),
       _post = post ?? _defaultPost;
  final ApiClient _apiClient;

  /// Overrides the transport so tests can exercise the response handling
  /// without a server. Defaults to [ApiClient.post].
  final Future<dynamic> Function(String endpoint, Map<String, dynamic> body)
  _post;

  static Future<dynamic> _defaultPost(
    String endpoint,
    Map<String, dynamic> body,
  ) => ApiClient().post(endpoint, body, requireAuth: false);

  /// Login with email and password (mobile endpoint)
  Future<AuthResponse> login({
    required String email,
    required String password,
    String? deviceName,
  }) async {
    var request = LoginRequest(
      email: email,
      password: password,
      deviceName: deviceName ?? defaultDeviceName,
    );

    try {
      var response = await _post('/mobile/login', request.toJson());

      // A 2xx with an empty or non-object body (HTML error page from a proxy,
      // an empty 204, ...) would make `as Map` throw a TypeError, which the
      // caller could only report as "unexpected error". Reject it here with a
      // message that actually points at the cause.
      if (response is! Map) {
        throw const ApiException(
          'Respons server tidak valid. Periksa alamat API pada konfigurasi app.',
          0,
        );
      }

      var body = Map<String, dynamic>.from(response);
      if (body['user'] is! Map) {
        throw const ApiException(
          'Respons login tidak memuat data pengguna. Silakan coba lagi.',
          0,
        );
      }

      return AuthResponse.fromJson(body);
    } on ApiException catch (e) {
      throw ApiException(localizeMessage(e.message), e.statusCode, e.data);
    } on FormatException catch (e) {
      throw ApiException(
        'Respons server tidak dapat dibaca (${e.message}).',
        0,
      );
    } on TypeError {
      throw const ApiException(
        'Data dari server tidak lengkap atau tidak valid.',
        0,
      );
    }
  }

  /// Logout (mobile endpoint)
  Future<void> logout() async {
    await _apiClient.post('/mobile/logout', {});
  }

  /// Get current user profile
  Future<User> getUser() async {
    var response = await _apiClient.get('/user');

    if (response is! Map) {
      throw const ApiException(
        'Respons server tidak valid. Silakan coba lagi.',
        0,
      );
    }

    var user = (response as Map<String, dynamic>)['user'];
    if (user is! Map) {
      throw const ApiException(
        'Respons server tidak memuat data profil. Silakan coba lagi.',
        0,
      );
    }

    // `/user` returns `permissions` beside `user`, the same shape as login.
    return User.fromJson(
      userJsonWithPermissions(
        Map<String, dynamic>.from(user),
        response['permissions'],
      ),
    );
  }

  /// Update user profile
  Future<User> updateProfile({
    String? fullName,
    String? email,
    String? currentPassword,
    String? password,
    String? passwordConfirmation,
  }) async {
    var body = <String, dynamic>{};
    if (fullName != null) {
      body['full_name'] = fullName;
    }
    if (email != null) {
      body['email'] = email;
    }
    if (currentPassword != null) {
      body['current_password'] = currentPassword;
    }
    if (password != null) {
      body['password'] = password;
    }
    if (passwordConfirmation != null) {
      body['password_confirmation'] = passwordConfirmation;
    }

    var response = await _apiClient.put('/user', body);

    // Same hazard as `login`: a 2xx without an object payload would throw a
    // TypeError that the caller could only report as a generic failure.
    if (response is! Map) {
      throw const ApiException(
        'Respons server tidak valid. Silakan coba lagi.',
        0,
      );
    }

    var user = (response as Map<String, dynamic>)['user'];
    if (user is! Map) {
      throw const ApiException(
        'Respons server tidak memuat data profil. Silakan coba lagi.',
        0,
      );
    }

    return User.fromJson(Map<String, dynamic>.from(user));
  }

  /// Label stored as the Sanctum token name so each device can be recognised
  /// (and revoked) from the `personal_access_tokens` table.
  ///
  /// The previous hard-coded `'flutter_mobile'` made every device
  /// indistinguishable in the tokens table.
  static String get defaultDeviceName {
    // dart:io's Platform throws UnsupportedError in a web build. The label is
    // resolved without touching dart:io so login cannot crash before the
    // request is even sent.
    if (kIsWeb) {
      return 'Web';
    }

    var os =
        _platformLabels[Platform.operatingSystem] ?? Platform.operatingSystem;
    var version =
        RegExp(
          r'[\d.]+',
        ).firstMatch(Platform.operatingSystemVersion)?.group(0) ??
        '';
    return version.isEmpty ? os : '$os $version';
  }

  static const Map<String, String> _platformLabels = {
    'android': 'Android',
    'ios': 'iOS',
    'macos': 'macOS',
    'windows': 'Windows',
    'linux': 'Linux',
  };

  /// The API answers in English while the app UI is Indonesian, so the messages
  /// a user can actually trigger are translated here instead of being shown
  /// as raw API text.
  static const Map<String, String> _messageTranslations = {
    'the provided credentials are incorrect.': 'Email atau password salah.',
    'your account is inactive.':
        'Akun Anda tidak aktif. Silakan hubungi admin.',
  };

  /// Public so the mapping can be covered by a unit test without a network.
  static String localizeMessage(String message) =>
      _messageTranslations[message.trim().toLowerCase()] ?? message;
}
