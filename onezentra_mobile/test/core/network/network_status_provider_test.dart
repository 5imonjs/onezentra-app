import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'package:onezentra_mobile/core/network/network_status_provider.dart';
import 'package:onezentra_mobile/core/theme/app_theme.dart';
import 'package:onezentra_mobile/shared/widgets/network_banner.dart';

void main() {
  test('status awal online saat ada Wi-Fi', () async {
    var provider = NetworkStatusProvider(
      checkConnectivity: () async => [ConnectivityResult.wifi],
      connectivityChanges: () => const Stream.empty(),
    );

    await provider.init();

    expect(provider.isOnline, isTrue);
    expect(provider.isOffline, isFalse);
    provider.dispose();
  });

  test('status awal offline saat tidak ada koneksi', () async {
    var provider = NetworkStatusProvider(
      checkConnectivity: () async => [ConnectivityResult.none],
      connectivityChanges: () => const Stream.empty(),
    );

    await provider.init();

    expect(provider.isOnline, isFalse);
    expect(provider.isOffline, isTrue);
    provider.dispose();
  });

  test('perubahan koneksi dari stream memperbarui status', () async {
    var changes = StreamController<List<ConnectivityResult>>();
    var provider = NetworkStatusProvider(
      checkConnectivity: () async => [ConnectivityResult.wifi],
      connectivityChanges: () => changes.stream,
    );
    await provider.init();

    changes.add([ConnectivityResult.none]);
    await Future<void>.delayed(Duration.zero);
    expect(provider.isOffline, isTrue);

    changes.add([ConnectivityResult.mobile]);
    await Future<void>.delayed(Duration.zero);
    expect(provider.isOffline, isFalse);

    await changes.close();
    provider.dispose();
  });

  test('plugin tidak tersedia tidak menampilkan banner offline', () async {
    var provider = NetworkStatusProvider(
      checkConnectivity: () async => throw Exception('plugin tidak tersedia'),
      connectivityChanges: () => const Stream.empty(),
    );

    await provider.init();

    expect(provider.isOnline, isTrue);
    expect(provider.isOffline, isFalse);
    provider.dispose();
  });

  testWidgets('banner offline tampil dan konten tetap terlihat', (
    tester,
  ) async {
    var provider = NetworkStatusProvider(
      checkConnectivity: () async => [ConnectivityResult.none],
      connectivityChanges: () => const Stream.empty(),
    );
    await provider.init();
    addTearDown(provider.dispose);

    await tester.pumpWidget(
      ChangeNotifierProvider<NetworkStatusProvider>.value(
        value: provider,
        child: MaterialApp(
          theme: AppTheme.light,
          home: const NetworkBannerHost(
            child: Scaffold(body: Text('Konten halaman')),
          ),
        ),
      ),
    );

    expect(find.textContaining('Tidak ada koneksi internet'), findsOneWidget);
    expect(find.text('Konten halaman'), findsOneWidget);
  });
}
