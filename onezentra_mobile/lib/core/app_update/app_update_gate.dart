import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'package:onezentra_mobile/core/app_update/app_update_checker.dart';
import 'package:onezentra_mobile/core/theme/app_theme.dart';
import 'package:onezentra_mobile/shared/widgets/app_widgets.dart';

/// Gerbang update aplikasi (Android, tanpa store).
///
/// Saat app dibuka sekali, tanya server "versi terbaru ada?". Jika ya:
/// - wajib (di bawah atau lewat build minimum / di-pin `force`): SELURUH
///   permukaan app digantikan layar unduh — pengguna harus memasang APK
///   terbaru lebih dahulu (pasca-install otomatis tersinkron);
/// - opsional: satu dialog tawaran, bisa ditutup.
///
/// Gagal cek (offline/API down) TIDAK menghalangi aplikasi — update adalah
/// satu cupang, bukan satu gembok akses data.
class AppUpdateGate extends StatefulWidget {
  const AppUpdateGate({required this.child, this.service, super.key});

  final Widget child;
  final AppUpdateService? service;

  @override
  State<AppUpdateGate> createState() => _AppUpdateGateState();
}

class _AppUpdateGateState extends State<AppUpdateGate> {
  AppUpdateInfo? _info;
  AppUpdateDecision _decision = AppUpdateDecision.upToDate;
  bool _optionalDialogShown = false;

  AppUpdateService get _service => widget.service ?? AppUpdateService();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _check());
  }

  Future<void> _check() async {
    var latest = await _service.fetchLatest();
    if (!mounted) {
      return;
    }
    try {
      var current = await AppVersion.current();
      var decision = decideAppUpdate(
        installedBuild: current.versionCode,
        latest: latest,
      );
      if (decision == AppUpdateDecision.upToDate) {
        return;
      }
      setState(() {
        _decision = decision;
        _info = latest;
      });
      if (decision == AppUpdateDecision.optional && !_optionalDialogShown) {
        _optionalDialogShown = true;
        WidgetsBinding.instance.addPostFrameCallback((_) => _showOptional());
      }
    } on Object {
      // pubspec tidak terbaca — jangan halangi aplikasi hanya karena
      // pengecekan versi.
    }
  }

  Future<void> _openUpdate() async {
    var url = _info?.apkUrl;
    if (url == null) {
      return;
    }
    try {
      await AppUpdateChannel.openUpdateUrl(url);
    } on Object catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Gagal membuka unduhan: $error')),
        );
      }
    }
  }

  Future<void> _showOptional() async {
    var info = _info;
    if (info == null || !mounted) {
      return;
    }
    var colors = context.colors;
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        icon: Icon(Icons.system_update_alt_rounded, color: colors.foreground),
        title: const Text('Pembaruan tersedia'),
        content: Text(
          'Versi ${info.versionName} sudah tersedia dan berisi perbaikan '
          'terbaru.${info.notes != null && info.notes!.trim().isNotEmpty ? '\n\n${info.notes}' : ''}',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('Nanti'),
          ),
          FilledButton.icon(
            onPressed: () {
              Navigator.of(dialogContext).pop();
              _openUpdate();
            },
            icon: const Icon(Icons.download_rounded, size: 16),
            label: const Text('Unduh'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_decision == AppUpdateDecision.force && _info != null) {
      return _ForceUpdateScreen(
        info: _info!,
        onUpdate: _openUpdate,
        onRetry: _check,
      );
    }
    return widget.child;
  }
}

/// Layar penuh untuk rilis wajib — pesan jelas & satu aksi.
class _ForceUpdateScreen extends StatelessWidget {
  const _ForceUpdateScreen({
    required this.info,
    required this.onUpdate,
    required this.onRetry,
  });

  final AppUpdateInfo info;
  final Future<void> Function() onUpdate;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    var colors = context.colors;
    var shortSha = info.sha256 != null && info.sha256!.length >= 16
        ? info.sha256!.substring(0, 16)
        : null;

    return Scaffold(
      backgroundColor: colors.background,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(AppTheme.space5),
          child: ConstrainedBox(
            constraints: BoxConstraints(
              minHeight: MediaQuery.of(context).size.height * 0.75,
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  width: 84,
                  height: 84,
                  decoration: const BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [AppTheme.primary500, AppTheme.primary700],
                    ),
                    borderRadius: AppTheme.radiusXl,
                  ),
                  child: const Icon(
                    Icons.system_update_rounded,
                    size: 40,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: AppTheme.space5),
                Text(
                  'Pembaruan wajib',
                  style: GoogleFonts.roboto(
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                    color: colors.foreground,
                  ),
                ),
                const SizedBox(height: AppTheme.space2),
                Text(
                  'Aplikasi Anda sudah tidak dapat digunakan. Versi baru '
                  '(${info.versionName}) harus dipasang dulu agar data dan '
                  'sinkronisasi tetap aman.',
                  textAlign: TextAlign.center,
                  style: GoogleFonts.roboto(
                    fontSize: 13,
                    height: 1.5,
                    color: colors.textSecondary,
                  ),
                ),
                if (info.notes != null && info.notes!.trim().isNotEmpty) ...[
                  const SizedBox(height: AppTheme.space4),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(AppTheme.space3),
                    decoration: BoxDecoration(
                      color: colors.surfaceCard,
                      borderRadius: AppTheme.radiusLg,
                      border: Border.all(color: colors.border),
                    ),
                    child: Text(
                      info.notes!.trim(),
                      style: GoogleFonts.roboto(
                        fontSize: 12,
                        height: 1.5,
                        color: colors.textMuted,
                      ),
                    ),
                  ),
                ],
                const SizedBox(height: AppTheme.space5),
                AppPrimaryButton(
                  text: 'Unduh & Instal (v${info.versionName})',
                  leadingIcon: Icons.download_rounded,
                  onPressed: onUpdate,
                ),
                const SizedBox(height: AppTheme.space2),
                AppSecondaryButton(
                  text: 'Coba Lagi',
                  onPressed: onRetry,
                  width: 160,
                  height: 44,
                ),
                if (shortSha != null) ...[
                  const SizedBox(height: AppTheme.space4),
                  Text(
                    'SHA256 $shortSha…',
                    style: GoogleFonts.robotoMono(
                      fontSize: 10,
                      color: colors.textMuted,
                    ),
                  ),
                ],
                const SizedBox(height: AppTheme.space2),
                Text(
                  'Jika unduh gagal, hubungi supervisor — sha256 dan versi akan '
                  'cocok dengan rilis di server.',
                  textAlign: TextAlign.center,
                  style: GoogleFonts.roboto(
                    fontSize: 10,
                    height: 1.4,
                    color: colors.textMuted,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
