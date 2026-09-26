import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Konfigurasi platform tidak bisa diuji lewat widget test, tapi salah satu
/// nilai yang salah di sini membuat aplikasi **tidak bisa di-build sama sekali**
/// tanpa pesan yang jelas. Contoh nyata: `mobile_scanner` sempat menuntut
/// minimal iOS 15.5, sedangkan proyek masih 13.0 — build gagal saat
/// `pod install`, jauh sebelum ada satu baris Dart yang bisa disalahkan.
void main() {
  group('konfigurasi iOS', () {
    /// Deployment target yang diuji. Tidak dibuat dinamis dari podspec plugin
    /// supaya nilainya terlihat eksplisit di test, dan naikkan versi plugin
    /// cukup berarti menyunting satu angka di sini.
    const minimumTarget = '15.5';

    test(
      'deployment target iOS tidak di bawah batas yang sudah divalidasi',
      () {
        final pbxproj = File('ios/Runner.xcodeproj/project.pbxproj');
        expect(
          pbxproj.existsSync(),
          isTrue,
          reason: 'project.pbxproj tidak ada',
        );

        final targets = RegExp(
          r'IPHONEOS_DEPLOYMENT_TARGET = ([0-9.]+);',
        ).allMatches(pbxproj.readAsStringSync()).toList();

        expect(
          targets,
          isNotEmpty,
          reason: 'target tidak ditemukan di pbxproj',
        );
        for (final match in targets) {
          final version = match.group(1)!;
          expect(
            _isAtLeast(version, minimumTarget),
            isTrue,
            reason:
                'IPHONEOS_DEPLOYMENT_TARGET $version di bawah $minimumTarget; '
                'build iOS akan gagal di pod install',
          );
        }
      },
    );

    test('podspec plugin yang terpasang tidak menuntut target lebih tinggi', () {
      // Plugin bisa menaikkan syaratnya kapan saja; test ini yang memberi
      // tahu lebih awal, lengkap dengan angka yang harus dinaikkan.
      final podspec = File(
        'ios/.symlinks/plugins/mobile_scanner/darwin/mobile_scanner.podspec',
      );
      expect(
        podspec.existsSync(),
        isTrue,
        reason:
            'podspec mobile_scanner tidak ditemukan — jalankan `flutter pub get`',
      );

      final required = RegExp(
        r"s\.ios\.deployment_target = '([0-9.]+)'",
      ).firstMatch(podspec.readAsStringSync());
      expect(
        required,
        isNotNull,
        reason: 'tidak bisa membaca deployment target dari podspec',
      );
      expect(
        _isAtLeast(minimumTarget, required!.group(1)!),
        isTrue,
        reason:
            'mobile_scanner ${required.group(1)} memakai Vision API yang butuh '
            'iOS ${required.group(1)}, sedangkan proyek disetel $minimumTarget',
      );
    });

    test('Podfile declares platform yang sama', () {
      final podfile = File('ios/Podfile');
      expect(podfile.existsSync(), isTrue, reason: 'Podfile tidak ada');

      final platform = RegExp(
        "^platform :ios, '([0-9.]+)'",
        multiLine: true,
      ).firstMatch(podfile.readAsStringSync());

      expect(
        platform,
        isNotNull,
        reason:
            'Podfile harus menyebut platform secara eksplisit; tanpa itu '
            'CocoaPods menebak sendiri dan build gagal dengan pesan yang membingungkan',
      );
      expect(_isAtLeast(platform!.group(1)!, minimumTarget), isTrue);
    });

    test('Info.plist mengizinkan API pada jaringan lokal (ATS)', () {
      final plist = File('ios/Runner/Info.plist');
      expect(plist.existsSync(), isTrue, reason: 'Info.plist tidak ada');
      final content = plist.readAsStringSync();

      expect(
        content,
        contains('NSAllowsLocalNetworking'),
        reason: 'tanpa ini login ke API di IP LAN ditolak iOS',
      );
    });

    test('penggunaan kamera dan galeri dijelaskan ke pengguna', () {
      final content = File('ios/Runner/Info.plist').readAsStringSync();

      for (final key in [
        'NSCameraUsageDescription',
        'NSPhotoLibraryUsageDescription',
      ]) {
        expect(
          content,
          contains(key),
          reason: '$key wajib ada agar iOS mengizinkan',
        );
      }
    });
  });

  group('konfigurasi macOS', () {
    test('sandbox mengizinkan request keluar (jaringan client)', () {
      // Tanpa entitlement ini aplikasi desktop di dalam App Sandbox tidak
      // pernah bisa menghubungi API: login gagal diam-diam tanpa satu pun
      // request yang menyentuh server.
      for (final file in [
        'macos/Runner/DebugProfile.entitlements',
        'macos/Runner/Release.entitlements',
      ]) {
        final path = File(file);
        expect(path.existsSync(), isTrue, reason: '$file tidak ada');
        expect(
          path.readAsStringSync(),
          contains('com.apple.security.network.client'),
          reason: '$file harus mengizinkan akses jaringan keluar',
        );
      }
    });
  });

  group('konfigurasi Android', () {
    test('cleartext hanya diaktifkan untuk build debug', () {
      final main = File('android/app/src/main/AndroidManifest.xml');
      final debug = File('android/app/src/debug/AndroidManifest.xml');

      expect(
        main.existsSync(),
        isTrue,
        reason: 'AndroidManifest.xml utama tidak ditemukan',
      );
      expect(
        debug.existsSync(),
        isTrue,
        reason:
            'AndroidManifest.xml debug tidak ditemukan — tanpa itu API '
            'http di IP LAN ditolak saat build pengembangan',
      );
      expect(
        main.readAsStringSync(),
        isNot(contains('usesCleartextTraffic')),
        reason: 'cleartext di build rilis membocorkan token lewat HTTP',
      );
      expect(debug.readAsStringSync(), contains('usesCleartextTraffic="true"'));
    });
  });
}

/// Bandingkan versi "15.5" vs "13.0" tanpa package versioning.
bool _isAtLeast(String version, String minimum) {
  final a = version.split('.').map(int.parse).toList();
  final b = minimum.split('.').map(int.parse).toList();
  for (var i = 0; i < b.length; i++) {
    final left = i < a.length ? a[i] : 0;
    if (left != b[i]) {
      return left > b[i];
    }
  }
  return true;
}
