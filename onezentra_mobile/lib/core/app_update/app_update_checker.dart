import 'package:flutter/services.dart';

import 'package:onezentra_mobile/core/network/api_client.dart';

/// Keputusan update aplikasi — hasil murni (pure) agar mudah diuji.
enum AppUpdateDecision { upToDate, optional, force }

/// Info versi dari server (`GET /app/update-info`).
class AppUpdateInfo {
  const AppUpdateInfo({
    required this.versionName,
    required this.versionCode,
    required this.apkUrl,
    required this.sha256,
    required this.notes,
    required this.force,
    required this.minSupportedCode,
  });

  final String versionName;
  final int versionCode;
  final String apkUrl;
  final String? sha256;
  final String? notes;

  /// Paksa update walau build installed belum di bawah min_supported.
  final bool force;
  final int minSupportedCode;

  static AppUpdateInfo? fromJson(Map<String, dynamic> json) {
    var release = json['release'];
    if (release is! Map) {
      return null;
    }
    var code = release['version_code'];
    var apkUrl = release['apk_url'];
    if (code is! num || release['version_name'] == null || apkUrl is! String) {
      return null;
    }
    return AppUpdateInfo(
      versionName: release['version_name']?.toString() ?? '',
      versionCode: code.toInt(),
      apkUrl: apkUrl,
      sha256: release['sha256']?.toString(),
      notes: release['notes']?.toString(),
      force: release['force'] == true,
      minSupportedCode: (json['min_supported_code'] as num?)?.toInt() ?? 0,
    );
  }
}

/// Versi terinstal, dibaca dari pubspec.yaml yang dibundel — pengganti
/// package_info_plus yang tidak kompatibel dengan stack kita.
class AppVersion {
  const AppVersion({required this.versionName, required this.versionCode});

  final String versionName;
  final int versionCode;

  static Future<AppVersion> current() async {
    var raw = await rootBundle.loadString('pubspec.yaml');
    var match = RegExp(
      r'version:\s*([0-9]+(?:\.[0-9]+)*)\+([0-9]+)',
    ).firstMatch(raw);
    if (match == null) {
      throw StateError('pubspec.yaml tidak memuat baris `version: x.y.z+n`');
    }
    return AppVersion(
      versionName: match.group(1)!,
      versionCode: int.parse(match.group(2)!),
    );
  }
}

/// Logika keputusan yang murni — satu-satunya kaki yang diuji unit:
/// - di bawah min_supported → wajib;
/// - ada rilis lebih tinggi → tawaran;
/// - flag force pada rilis → wajib walau di atas min_supported.
AppUpdateDecision decideAppUpdate({
  required int installedBuild,
  required AppUpdateInfo? latest,
}) {
  if (latest == null) {
    return AppUpdateDecision.upToDate;
  }
  var minRequired = latest.minSupportedCode > 0 ? latest.minSupportedCode : 0;
  if (installedBuild < minRequired || latest.force) {
    return AppUpdateDecision.force;
  }
  if (installedBuild < latest.versionCode) {
    return AppUpdateDecision.optional;
  }
  return AppUpdateDecision.upToDate;
}

/// Kanal platform untuk membuka URL APK (bukan plugin url_launcher).
class AppUpdateChannel {
  static const MethodChannel channel = MethodChannel(
    'onezentra_mobile/updates',
  );

  static Future<void> openUpdateUrl(String url) =>
      channel.invokeMethod('openUpdateUrl', {'url': url});
}

/// Mengambil rilis terbaru dari server. Gagal (offline/API down) diam-diam
/// menghasilkan null — aplikasi tidak boleh tersangkut gara-gara pengecekan.
class AppUpdateService {
  AppUpdateService({this.get = _apiGet});

  final Future<dynamic> Function(String endpoint) get;

  static Future<dynamic> _apiGet(String endpoint) =>
      ApiClient().get(endpoint, requireAuth: false);

  Future<AppUpdateInfo?> fetchLatest({String platform = 'android'}) async {
    try {
      var response = await get('/app/update-info?platform=$platform');
      if (response is Map) {
        return AppUpdateInfo.fromJson(Map<String, dynamic>.from(response));
      }
      return null;
    } catch (_) {
      return null;
    }
  }
}
