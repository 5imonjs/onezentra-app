import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import 'package:onezentra_mobile/core/theme/app_theme.dart';

/// Full-screen barcode scanner for Check In Point.
///
/// Reads a PO / surat jalan code with the device camera and pops the raw
/// value ([Navigator.pop]) so the caller can look it up.
///
/// The copy defaults to the Check In Point wording; other menus (e.g.
/// Validasi SJ) override [title], [hint], [subtitle] and [cameraErrorHint].
class GateScannerPage extends StatefulWidget {
  const GateScannerPage({
    super.key,
    this.title = 'Pindai QR / Barcode',
    this.hint = 'Arahkan kamera ke QR / barcode PO atau surat jalan.',
    this.subtitle = 'Hasil pindai otomatis dicari di Check In Point.',
    this.cameraErrorHint =
        'Kamera tidak dapat dijalankan. Masukkan kode PO / Nopol '
        'secara manual di halaman Check In Point.',
  });
  final String title;
  final String hint;
  final String subtitle;
  final String cameraErrorHint;

  @override
  State<GateScannerPage> createState() => _GateScannerPageState();
}

class _GateScannerPageState extends State<GateScannerPage> {
  late final MobileScannerController _controller = MobileScannerController(
    detectionSpeed: DetectionSpeed.noDuplicates,
  );

  /// Guards against [MobileScanner.onDetect] firing again while the pop
  /// animation is still running.
  bool _handled = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _onDetect(BarcodeCapture capture) {
    if (_handled || !mounted || capture.barcodes.isEmpty) {
      return;
    }
    var value = capture.barcodes.first.rawValue?.trim();
    if (value == null || value.isEmpty) {
      return;
    }
    _handled = true;
    Navigator.of(context).pop(value);
  }

  Future<void> _toggleTorch() async {
    try {
      await _controller.toggleTorch();
    } on MobileScannerException catch (_) {
      // Torch is unavailable (web, no-flash devices) — ignore.
    }
    if (mounted) {
      setState(() {});
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: Colors.black,
    appBar: AppBar(
      backgroundColor: Colors.black,
      foregroundColor: AppTheme.foreground,
      elevation: 0,
      title: Text(
        widget.title,
        style: GoogleFonts.roboto(fontSize: 18, fontWeight: FontWeight.w600),
      ),
      actions: [
        if (!kIsWeb)
          ValueListenableBuilder<MobileScannerState>(
            valueListenable: _controller,
            builder: (context, state, _) => IconButton(
              tooltip: 'Lampu senter',
              onPressed: state.torchState == TorchState.unavailable
                  ? null
                  : _toggleTorch,
              icon: Icon(
                state.torchState == TorchState.on
                    ? Icons.flashlight_on_rounded
                    : Icons.flashlight_off_rounded,
              ),
            ),
          ),
        const SizedBox(width: AppTheme.space2),
      ],
    ),
    body: Stack(
      fit: StackFit.expand,
      children: [
        MobileScanner(
          controller: _controller,
          onDetect: _onDetect,
          errorBuilder: _buildError,
        ),
        _buildScanOverlay(),
      ],
    ),
  );

  /// Shown when the camera cannot start (permission denied, unsupported…).
  Widget _buildError(BuildContext context, MobileScannerException error) {
    var denied = error.errorCode == MobileScannerErrorCode.permissionDenied;
    return Container(
      color: Colors.black,
      padding: const EdgeInsets.all(AppTheme.space6),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            denied ? Icons.no_photography_rounded : Icons.videocam_off_rounded,
            size: 56,
            color: AppTheme.gray500,
          ),
          const SizedBox(height: AppTheme.space4),
          Text(
            denied
                ? 'Izin kamera ditolak. Aktifkan izin kamera di pengaturan '
                      'perangkat, lalu buka lagi.'
                : widget.cameraErrorHint,
            textAlign: TextAlign.center,
            style: GoogleFonts.roboto(
              color: AppTheme.gray500.withValues(alpha: 0.7),
              fontSize: 14.5,
              height: 1.5,
            ),
          ),
        ],
      ),
    );
  }

  /// Dark scrim around a clear scan window plus the aim instructions,
  /// mirroring the web app's barcode scanner overlay.
  Widget _buildScanOverlay() => LayoutBuilder(
    builder: (context, constraints) {
      var windowWidth = (constraints.maxWidth - 48)
          .clamp(200.0, 320.0)
          .toDouble();
      var windowHeight = (constraints.maxHeight * 0.3)
          .clamp(140.0, 200.0)
          .toDouble();

      return IgnorePointer(
        child: Stack(
          children: [
            Center(
              child: Container(
                width: windowWidth,
                height: windowHeight,
                decoration: BoxDecoration(
                  borderRadius: AppTheme.radiusLg,
                  border: Border.all(
                    color: AppTheme.gray500.withValues(alpha: 0.9),
                    width: 2,
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.6),
                      spreadRadius: 1000,
                    ),
                  ],
                ),
              ),
            ),
            Positioned(
              left: AppTheme.space5,
              right: AppTheme.space5,
              bottom:
                  constraints.maxHeight / 2 +
                  windowHeight / 2 +
                  AppTheme.space4,
              child: Column(
                children: [
                  Text(
                    widget.hint,
                    textAlign: TextAlign.center,
                    style: GoogleFonts.roboto(
                      color: AppTheme.gray500,
                      fontSize: 14.5,
                      fontWeight: FontWeight.w500,
                      height: 1.4,
                    ),
                  ),
                  const SizedBox(height: AppTheme.space2),
                  Text(
                    widget.subtitle,
                    textAlign: TextAlign.center,
                    style: GoogleFonts.roboto(
                      color: AppTheme.gray500.withValues(alpha: 0.7),
                      fontSize: 12.5,
                      height: 1.4,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      );
    },
  );
}
