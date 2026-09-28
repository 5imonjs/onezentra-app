import 'dart:io';

import 'package:onezentra_mobile/core/network/api_client.dart';
import 'package:onezentra_mobile/features/auth/models/auth_models.dart';

/// Auth Repository - handles authentication API calls
class AuthRepository {
  final ApiClient _apiClient;

  /// Dependencies are injectable so widget tests can run without a network.
  AuthRepository({ApiClient? apiClient})
    : _apiClient = apiClient ?? ApiClient();

  /// Login with email and password (mobile endpoint)
  Future<AuthResponse> login({
    required String email,
    required String password,
    String? deviceName,
  }) async {
    final request = LoginRequest(
      email: email,
      password: password,
      deviceName: deviceName ?? defaultDeviceName,
    );

    try {
      final response = await _apiClient.post(
        '/mobile/login',
        request.toJson(),
        requireAuth: false,
      );
      return AuthResponse.fromJson(Map<String, dynamic>.from(response as Map));
    } on ApiException catch (e) {
      throw ApiException(localizeMessage(e.message), e.statusCode, e.data);
    }
  }

  /// Logout (mobile endpoint)
  Future<void> logout() async {
    await _apiClient.post('/mobile/logout', {});
  }

  /// Get current user profile
  Future<User> getUser() async {
    final response = await _apiClient.get('/user');
    return User.fromJson(
      (response as Map<String, dynamic>)['user'] as Map<String, dynamic>,
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
    final body = <String, dynamic>{};
    if (fullName != null) body['full_name'] = fullName;
    if (email != null) body['email'] = email;
    if (currentPassword != null) body['current_password'] = currentPassword;
    if (password != null) body['password'] = password;
    if (passwordConfirmation != null)
      body['password_confirmation'] = passwordConfirmation;

    final response = await _apiClient.put('/user', body);
    return User.fromJson(
      (response as Map<String, dynamic>)['user'] as Map<String, dynamic>,
    );
  }

  /// Label stored as the Sanctum token name so each device can be recognised
  /// (and revoked) from the `personal_access_tokens` table.
  ///
  /// The previous hard-coded `'flutter_mobile'` made every device
  /// indistinguishable in the tokens table.
  static String get defaultDeviceName {
    final os =
        _platformLabels[Platform.operatingSystem] ?? Platform.operatingSystem;
    final version =
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
  static String localizeMessage(String message) {
    return _messageTranslations[message.trim().toLowerCase()] ?? message;
  }
}
