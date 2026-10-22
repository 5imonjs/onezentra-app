import 'dart:async';

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
  bool _isRefreshing = false;
  bool _refreshFailed = false;
  Future<bool>? _refreshFuture;
  String? _error;
  int? _errorStatusCode;
  Duration? _retryAfter;

  User? get user => _user;
  String? get token => _token;
  DateTime? get expiresAt => _expiresAt;
  bool get isLoading => _isLoading;
  bool get isRefreshing => _isRefreshing;
  bool get refreshFailed => _refreshFailed;
  String? get error => _error;
  int? get errorStatusCode => _errorStatusCode;

  /// Wait time requested by the server after a 429, used by the login screen
  /// to keep the submit button disabled until the throttle window ends.
  Duration? get retryAfter => _retryAfter;
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
    if (_isLoading) {
      return false;
    }

    _setLoading(true);
    _clearError();

    try {
      var response = await _repository.login(
        email: email,
        password: password,
        deviceName: deviceName,
      );

      var token = response.token;
      if (token == null || token.trim().isEmpty) {
        throw const ApiException(
          'Respons login tidak memuat token. Silakan coba lagi.',
          0,
        );
      }

      var user = response.user;
      var expiresAt = response.expiresAt == null
          ? null
          : DateTime.tryParse(response.expiresAt!);

      // Persist first, then publish the new state. If storage fails, the
      // provider must not claim to be authenticated while login() returns
      // false.
      await _apiClient.setAuth(
        token,
        user.toJson(),
        expiresAt: response.expiresAt,
      );

      _token = token;
      _user = user;
      _expiresAt = expiresAt;
      _refreshFailed = false;

      _setLoading(false);
      return true;
    } on ApiException catch (e) {
      _setError(e.message, retryAfter: e.retryAfter, statusCode: e.statusCode);
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

  /// Logout user.
  ///
  /// The local session is cleared before the revoke request finishes so an
  /// offline device never makes the user wait for the HTTP timeout. The
  /// request is started first, while the token is still attached, then left
  /// to finish in the background.
  Future<void> logout() async {
    if (_isLoading) {
      return;
    }

    _setLoading(true);

    var revoke = _repository.logout();
    unawaited(revoke.catchError((_) {}));

    _token = null;
    _user = null;
    _expiresAt = null;
    _error = null;
    _errorStatusCode = null;
    _retryAfter = null;
    _refreshFailed = false;

    try {
      await _apiClient.clearAuth();
    } finally {
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
    _refreshFailed = false;
    _error = 'Sesi Anda telah berakhir. Silakan login kembali.';
    _errorStatusCode = 401;
    _retryAfter = null;
    notifyListeners();
  }

  /// Refresh user data from server.
  ///
  /// Concurrent callers share one request: the app lifecycle observer and the
  /// initial HomePage fetch can overlap, and two profile requests could race
  /// and publish stale permissions. The returned future reports success so
  /// the UI can show a retry banner without hiding the current menu.
  Future<bool> refreshUser() {
    if (!isAuthenticated) {
      return Future.value(false);
    }

    var inFlight = _refreshFuture;
    if (inFlight != null) {
      return inFlight;
    }

    var future = _runRefresh();
    _refreshFuture = future;
    return future;
  }

  Future<bool> _runRefresh() async {
    var token = _token;
    if (token == null) {
      return false;
    }

    _setRefreshing(true);

    try {
      var user = await _repository.getUser();

      // A logout or a fresh login can land while the request is in flight.
      // Never publish a profile belonging to the previous session.
      if (_token != token) {
        return false;
      }

      _user = user;
      await _apiClient.setAuth(
        token,
        user.toJson(),
        expiresAt: _expiresAt?.toIso8601String(),
      );

      // The session can end while the refreshed profile is being persisted.
      // Do not let that write resurrect the token that logout just removed.
      if (_token != token) {
        if (_token == null) {
          await _apiClient.clearAuth();
        }
        return false;
      }

      _refreshFailed = false;
      notifyListeners();
      return true;
    } catch (_) {
      if (_token == token) {
        _refreshFailed = true;
      }
      return false;
    } finally {
      _refreshFuture = null;
      _setRefreshing(false);
    }
  }

  void _setRefreshing(bool value) {
    if (_isRefreshing == value) {
      return;
    }
    _isRefreshing = value;
    notifyListeners();
  }

  /// Update profile
  Future<bool> updateProfile({
    String? fullName,
    String? email,
    String? currentPassword,
    String? password,
    String? passwordConfirmation,
  }) async {
    if (_isLoading) {
      return false;
    }

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
      _setError(e.message, statusCode: e.statusCode);
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

  void _setError(String error, {Duration? retryAfter, int? statusCode}) {
    _error = error;
    _retryAfter = retryAfter;
    _errorStatusCode = statusCode;
    notifyListeners();
  }

  void _clearError() {
    _error = null;
    _retryAfter = null;
    _errorStatusCode = null;
  }

  /// Public method to clear error
  void clearError() {
    if (_error == null) {
      return;
    }
    _clearError();
    notifyListeners();
  }

  /// Server API yang sedang dipakai aplikasi.
  String get apiBaseUrl => _apiClient.baseUrl;

  /// Label asal URL: build (dart-define), kustom (pilihan pengguna), bawaan.
  String get apiBaseUrlSource => _apiClient.baseUrlSource;

  /// Ganti server API saat runtime. Sesi lokal dibuang karena token milik
  /// server sebelumnya; pengguna harus login ulang. Mengembalikan URL
  /// ternormalisasi yang dipakai, atau pesan error bila input tidak valid.
  Future<String?> setApiBaseUrl(String? url) async {
    try {
      var effective = await _apiClient.setBaseUrl(url);
      _token = null;
      _user = null;
      _expiresAt = null;
      _error = null;
      _errorStatusCode = null;
      _retryAfter = null;
      notifyListeners();
      return effective;
    } on ApiException catch (e) {
      _setError(e.message, statusCode: e.statusCode);
      return null;
    }
  }
}
