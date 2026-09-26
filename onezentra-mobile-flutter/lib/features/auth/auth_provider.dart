import 'package:flutter/foundation.dart';
import 'package:onezentra_mobile/core/api_client.dart';
import 'package:onezentra_mobile/features/auth/auth_service.dart';
import 'package:onezentra_mobile/features/auth/auth_user.dart';

/// State sesi aplikasi — satu-satunya sumber kebenaran "apakah user login".
///
/// Sesi disimpan sebagai Bearer token di SecureStorage (hidup antar restart &
/// per-perangkat). Pola ini konsisten dengan `GateProvider`: service di-inject
/// agar state bisa diuji tanpa jaringan.
class AuthProvider extends ChangeNotifier {
  AuthProvider([AuthService? service]) : _service = service ?? AuthService();

  final AuthService _service;

  AuthUser? user;
  List<String> permissions = [];
  bool isLoading = false;
  bool isRestoring = true;

  /// Pesan error saat memulihkan sesi gagal karena jaringan/server (bukan
  /// karena token invalid). Token sengaja **tidak** dibuang agar pengguna
  /// cukup menekan "Coba lagi", bukan login ulang dari nol.
  String? restoreError;

  bool get isAuthenticated => user != null;

  bool hasPermission(String slug) => permissions.contains(slug);

  /// Dipanggil `ApiClient` saat token dibuang (logout atau 401).
  void clearSession() {
    final changed = user != null || permissions.isNotEmpty || isRestoring;
    user = null;
    permissions = [];
    isRestoring = false;
    if (changed) {
      notifyListeners();
    }
  }

  Future<void> login(String email, String password) async {
    isLoading = true;
    restoreError = null;
    notifyListeners();
    try {
      final session = await _service.login(email: email, password: password);
      await ApiClient.instance.persistToken(session.token);
      user = session.user;
      permissions = session.permissions;
      restoreError = null;
    } finally {
      isLoading = false;
      notifyListeners();
    }
  }

  Future<void> logout() async {
    isLoading = true;
    notifyListeners();
    try {
      await _service.logout();
    } catch (_) {
      // Gagal revoke di server tidak boleh menahan logout lokal.
    }
    isLoading = false;
    await ApiClient.instance.clearSession();
    clearSession();
  }

  /// Pulihkan sesi dari storage. Dipanggil **satu kali** oleh `AppRoot`,
  /// bukan per layar — sebelumnya tiap layar memanggilnya lagi sehingga
  /// sesi yang baru dibuat langsung terhapus.
  Future<void> restore() async {
    isRestoring = true;
    restoreError = null;
    notifyListeners();

    if (!ApiClient.instance.hasToken) {
      clearSession();
      isRestoring = false;
      notifyListeners();
      return;
    }

    try {
      final session = await _service.me();
      user = session.user;
      permissions = session.permissions;
      restoreError = null;
    } catch (e) {
      if (isSessionExpired(e)) {
        // 401/403: token benar-benar tidak berlaku → buang & kembali ke login.
        await ApiClient.instance.clearSession();
        clearSession();
      } else {
        restoreError = apiErrorMessage(
          e,
          'Tidak dapat memuat sesi. Periksa koneksi lalu coba lagi.',
        );
        clearSession();
      }
    } finally {
      isRestoring = false;
      notifyListeners();
    }
  }
}
