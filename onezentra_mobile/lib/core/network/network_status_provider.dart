import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';

/// Status konektivitas perangkat untuk banner offline global.
///
/// `connectivity_plus` hanya melaporkan status radio (Wi-Fi/seluler), bukan
/// apakah server benar-benar terjangkau. Karena itu banner ini dipakai sebagai
/// peringatan dini; kegagalan request tetap ditangani oleh [ApiClient].
class NetworkStatusProvider extends ChangeNotifier {
  NetworkStatusProvider({
    Future<List<ConnectivityResult>> Function()? checkConnectivity,
    Stream<List<ConnectivityResult>> Function()? connectivityChanges,
  }) : _checkConnectivity =
           checkConnectivity ?? Connectivity().checkConnectivity,
       _connectivityChanges =
           connectivityChanges ?? (() => Connectivity().onConnectivityChanged);

  final Future<List<ConnectivityResult>> Function() _checkConnectivity;
  final Stream<List<ConnectivityResult>> Function() _connectivityChanges;

  StreamSubscription<List<ConnectivityResult>>? _subscription;
  bool _isOnline = true;
  bool _initialized = false;

  /// True saat perangkat punya jalur jaringan (Wi-Fi/seluler/ethernet).
  bool get isOnline => _isOnline;

  /// Hanya true setelah pengecekan pertama selesai, supaya banner tidak
  /// berkedip saat aplikasi baru dibuka.
  bool get isOffline => _initialized && !_isOnline;

  Future<void> init() async {
    await refresh();
    try {
      await _subscription?.cancel();
      _subscription = _connectivityChanges().listen(
        _apply,
        onError: (Object error) {
          debugPrint('NetworkStatusProvider.stream: $error');
        },
      );
    } catch (error) {
      // Plugin tidak tersedia (mis. widget test) — anggap online dan biarkan
      // ApiClient yang menentukan kegagalan jaringan sebenarnya.
      debugPrint('NetworkStatusProvider.listen: $error');
    }
  }

  /// Cek ulang saat app kembali ke foreground.
  Future<void> refresh() async {
    try {
      _apply(await _checkConnectivity());
    } catch (error) {
      debugPrint('NetworkStatusProvider.refresh: $error');
    } finally {
      _initialized = true;
      notifyListeners();
    }
  }

  void _apply(List<ConnectivityResult> results) {
    var online = results.any((result) => result != ConnectivityResult.none);
    if (online == _isOnline) {
      return;
    }
    _isOnline = online;
    notifyListeners();
  }

  @override
  void dispose() {
    _subscription?.cancel();
    _subscription = null;
    super.dispose();
  }
}
