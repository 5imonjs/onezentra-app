import 'package:flutter_test/flutter_test.dart';

import 'package:onezentra_mobile/core/app_update/app_update_checker.dart';

/// Logika keputusan update wajib/opsional — murni, tanpa jaringan/plugin.
void main() {
  const latest = AppUpdateInfo(
    versionName: '1.1.0',
    versionCode: 3,
    apkUrl: 'https://example.test/releases/onezentra-3.apk',
    sha256: 'deadbeef',
    notes: 'Perbaikan scan',
    force: false,
    minSupportedCode: 2,
  );

  test('belum ada rilis — aplikasi berjalan seperti biasa', () {
    expect(
      decideAppUpdate(installedBuild: 1, latest: null),
      AppUpdateDecision.upToDate,
    );
  });

  test('under minimum supported — wajib', () {
    expect(
      decideAppUpdate(installedBuild: 1, latest: latest),
      AppUpdateDecision.force,
    );
  });

  test('baru dirilis di atas build terinstal — tawaran opsional', () {
    expect(
      decideAppUpdate(installedBuild: 2, latest: latest),
      AppUpdateDecision.optional,
    );
  });

  test('sama atau lebih baru — tidak ada aksi', () {
    expect(
      decideAppUpdate(installedBuild: 3, latest: latest),
      AppUpdateDecision.upToDate,
    );
  });

  test('flag force memaksa walau build sudah mencukupi', () {
    const forced = AppUpdateInfo(
      versionName: '1.1.1',
      versionCode: 4,
      apkUrl: 'https://example.test/releases/onezentra-4.apk',
      sha256: null,
      notes: null,
      force: true,
      minSupportedCode: 0,
    );
    expect(
      decideAppUpdate(installedBuild: 3, latest: forced),
      AppUpdateDecision.force,
    );
  });

  test('fromJson memakai release tertinggi dari bentuk server', () {
    var parsed = AppUpdateInfo.fromJson(const {
      'release': {
        'version_name': '1.1.0',
        'version_code': 3,
        'apk_url': 'https://example.test/a.apk',
        'sha256': 'a1b2c3',
        'notes': 'Perbaikan scan',
        'force': false,
      },
      'min_supported_code': 2,
    });
    expect(parsed?.versionName, '1.1.0');
    expect(parsed?.versionCode, 3);
    expect(parsed?.minSupportedCode, 2);
    expect(parsed?.force, isFalse);
  });

  test('fromJson menyerahkan null untuk bentuk tak dikenal / tanpa rilis', () {
    expect(
      AppUpdateInfo.fromJson(const {'release': null, 'min_supported_code': 0}),
      isNull,
    );
    expect(AppUpdateInfo.fromJson(const {'release': 'oops'}), isNull);
  });
}
