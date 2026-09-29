import 'package:flutter/foundation.dart';
import 'package:onezentra_mobile/features/auth/models/auth_models.dart';
import 'package:onezentra_mobile/features/auth/repositories/auth_repository.dart';
import 'package:onezentra_mobile/core/network/api_client.dart';

/// Auth Provider - manages authentication state
class AuthProvider extends ChangeNotifier {

  /// Dependencies are injectable so widget tests can substitute the repository
  /// without touching the network or the platform storage.
  AuthProvider({AuthRepository? repository, ApiClient? apiClient})
    : _repository = repository ?? AuthRepository(),
      _apiClient = apiClient ?? ApiClient();
  final AuthRepository _repository;
  final ApiClient _apiClient;

  User? _user;
  String? _token;
  DateTime? _expiresAt;
  bool _isLoading = false;
  String? _error;

  User? get user => _user;
  String? get token => _token;
  DateTime? get expiresAt => _expiresAt;
  bool get isLoading => _isLoading;
  String? get error => _error;
  bool get isAuthenticated => _token != null && _user != null;
  bool get isAdmin => _user?.isAdmin ?? false;

  /// Initialize auth state from storage
  Future<void> init() async {
    await _apiClient.init();

    _token = _apiClient.token;
    _expiresAt = _apiClient.expiresAt;

    var storedUser = _apiClient.user;
    if (storedUser != null) {
      try {
        _user = User.fromJson(storedUser);
      } catch (_) {
        // Profile written by an incompatible app version: drop the session
        // instead of crashing on the splash screen.
        _user = null;
      }
    }

    if (_token != null && (_user == null || _apiClient.isExpired)) {
      await _apiClient.clearAuth();
      _token = null;
      _user = null;
      _expiresAt = null;
    }

    notifyListeners();
  }

  /// Login user
  Future<bool> login({
    required String email,
    required String password,
    String? deviceName,
  }) async {
    // Guard against a double tap or the keyboard "done" action while a
    // request is already running (the button state is not enough).
    if (_isLoading) return false;

    _setLoading(true);
    _clearError();

    try {
      var response = await _repository.login(
        email: email,
        password: password,
        deviceName: deviceName,
      );

      _token = response.token;
      _user = response.user;
      _expiresAt = response.expiresAt == null
          ? null
          : DateTime.tryParse(response.expiresAt!);

      // Save to storage via ApiClient
      await _apiClient.setAuth(
        _token!,
        _user!.toJson(),
        expiresAt: response.expiresAt,
      );

      _setLoading(false);
      return true;
    } on ApiException catch (e) {
      _setError(e.message);
      _setLoading(false);
      return false;
    } catch (e, stack) {
      // Every expected failure is already an [ApiException]; anything landing
      // here is a bug or an unmapped platform error. The generic message is
      // useless on its own, so the cause is logged for `flutter logs`.
      debugPrint('AuthProvider.login: unhandled ${e.runtimeType}: $e');
      debugPrintStack(stackTrace: stack, maxFrames: 8);
      _setError('Terjadi kesalahan tidak terduga. Silakan coba lagi.');
      _setLoading(false);
      return false;
    }
  }

  /// Logout user
  Future<void> logout() async {
    _setLoading(true);

    try {
      await _repository.logout();
    } catch (_) {
      // Ignore logout errors, clear local state anyway
    } finally {
      _token = null;
      _user = null;
      _expiresAt = null;
      _error = null;
      await _apiClient.clearAuth();
      _setLoading(false);
    }
  }

  /// Called by [ApiClient] when the server rejects the stored token: the local
  /// session is dropped and the user is explained why they are back on login.
  void handleSessionExpired() {
    _token = null;
    _user = null;
    _expiresAt = null;
    _isLoading = false;
    _error = 'Sesi Anda telah berakhir. Silakan login kembali.';
    notifyListeners();
  }

  /// Refresh user data from server
  Future<void> refreshUser() async {
    if (!isAuthenticated) return;

    try {
      var user = await _repository.getUser();
      _user = user;
      await _apiClient.setAuth(
        _token!,
        _user!.toJson(),
        expiresAt: _expiresAt?.toIso8601String(),
      );
      notifyListeners();
    } catch (_) {
      // Ignore refresh errors
    }
  }

  /// Update profile
  Future<bool> updateProfile({
    String? fullName,
    String? email,
    String? currentPassword,
    String? password,
    String? passwordConfirmation,
  }) async {
    if (_isLoading) return false;

    _setLoading(true);
    _clearError();

    try {
      // The profile response omits `permissions`, so keep the list the
      // session already had instead of dropping every permission check.
      var user = await _repository.updateProfile(
        fullName: fullName,
        email: email,
        currentPassword: currentPassword,
        password: password,
        passwordConfirmation: passwordConfirmation,
      );

      _user = user.permissions == null
          ? user.withPermissions(_user?.permissions)
          : user;
      await _apiClient.setAuth(
        _token!,
        _user!.toJson(),
        expiresAt: _expiresAt?.toIso8601String(),
      );
      _setLoading(false);
      return true;
    } on ApiException catch (e) {
      _setError(e.message);
      _setLoading(false);
      return false;
    } catch (_) {
      _setError('Gagal memperbarui profil. Silakan coba lagi.');
      _setLoading(false);
      return false;
    }
  }

  void _setLoading(bool loading) {
    _isLoading = loading;
    notifyListeners();
  }

  void _setError(String error) {
    _error = error;
    notifyListeners();
  }

  void _clearError() {
    _error = null;
  }

  /// Public method to clear error
  void clearError() {
    if (_error == null) return;
    _clearError();
    notifyListeners();
  }
}
