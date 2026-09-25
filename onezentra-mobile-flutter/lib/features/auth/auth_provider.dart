import 'package:flutter/foundation.dart';
import 'package:onezentra_mobile/core/api_client.dart';
import 'package:onezentra_mobile/features/auth/auth_user.dart';

/// Mirror `src/store/auth.ts` (Expo) — sesi Bearer token di SecureStorage,
/// hidup antar restart & per-perangkat.
class AuthProvider extends ChangeNotifier {
  AuthUser? user;
  List<String> permissions = [];
  bool isLoading = false;
  bool isRestoring = true;

  bool get isAuthenticated => user != null;

  bool hasPermission(String slug) => permissions.contains(slug);

  bool hasRole(List<String> roles) {
    final u = user;
    if (u == null) return false;
    return roles.contains(u.level) || u.roles.any((r) => roles.contains(r.slug));
  }

  Future<void> login(String email, String password) async {
    isLoading = true;
    notifyListeners();
    try {
      final res = await ApiClient.instance.dio.post(
        '/mobile/login',
        data: {
          'email': email.trim(),
          'password': password,
          'device_name': '${defaultTargetPlatform.name}-mobile',
        },
      );
      final data = res.data as Map<String, dynamic>;
      await ApiClient.instance.persistToken(data['token'] as String?);
      user = AuthUser.fromJson(Map<String, dynamic>.from(data['user'] as Map));
      permissions = ((data['permissions'] as List?) ?? []).map((e) => '$e').toList();
    } finally {
      isLoading = false;
      notifyListeners();
    }
  }

  Future<void> logout() async {
    try {
      await ApiClient.instance.dio.post('/mobile/logout');
    } catch (_) {
      // abaikan — tetap bersihkan state lokal
    }
    await ApiClient.instance.persistToken(null);
    user = null;
    permissions = [];
    notifyListeners();
  }

  Future<void> restore() async {
    isRestoring = true;
    notifyListeners();
    try {
      if (ApiClient.instance.token == null) {
        user = null;
        permissions = [];
        return;
      }
      final res = await ApiClient.instance.dio.get('/user');
      final data = res.data as Map<String, dynamic>;
      user = AuthUser.fromJson(Map<String, dynamic>.from(data['user'] as Map));
      permissions = ((data['permissions'] as List?) ?? []).map((e) => '$e').toList();
    } catch (_) {
      await ApiClient.instance.persistToken(null);
      user = null;
      permissions = [];
    } finally {
      isRestoring = false;
      notifyListeners();
    }
  }

  void handleUnauthorized() {
    user = null;
    permissions = [];
    notifyListeners();
  }
}
