import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:onezentra_mobile/theme/app_colors.dart';

/// Pemindai barcode/QR kamera — hasil mentah dikembalikan ke layar pemanggil
/// untuk di-lookup sebagai nomor PO transporter / plat kendaraan / barcode
/// produk.
///
/// `title`, `hint`, dan `formats` bisa disesuaikan pemanggil: dokumen SJ
/// memakai QR/Code128, sedangkan barcode kemasan produk memakai format
/// numerik (EAN/Code128) supaya lebih cepat terbaca.
///
/// Karena controller-nya dibuat di sini (bukan oleh `MobileScanner`),
/// siklus hidup aplikasi harus ditangani manual — kalau tidak kamera tetap
/// menyala setelah app di-background dan error "camera in use" muncul saat
/// scanner dibuka lagi.
class ScannerScreen extends StatefulWidget {
  const ScannerScreen({
    super.key,
    this.title = 'Scan SJ / PO',
    this.hint = 'Arahkan kamera ke barcode SJ / dokumen pengiriman',
    this.formats = const [BarcodeFormat.all],
  });

  final String title;
  final String hint;
  final List<BarcodeFormat> formats;

  @override
  State<ScannerScreen> createState() => _ScannerScreenState();
}

class _ScannerScreenState extends State<ScannerScreen>
    with WidgetsBindingObserver {
  /// Dibuat manual (bukan oleh `MobileScanner`) supaya bisa memakai
  /// `widget.formats` dan daur ulang di `dispose`.
  late final MobileScannerController _controller;
  bool _handled = false;

  @override
  void initState() {
    super.initState();
    _controller = MobileScannerController(
      detectionSpeed: DetectionSpeed.noDuplicates,
      formats: widget.formats,
    );
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (!_controller.value.hasCameraPermission) {
      return;
    }
    switch (state) {
      case AppLifecycleState.resumed:
        _controller.start();
      case AppLifecycleState.inactive:
      case AppLifecycleState.hidden:
      case AppLifecycleState.paused:
      case AppLifecycleState.detached:
        _controller.stop();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _controller.dispose();
    super.dispose();
  }

  void _onDetect(BarcodeCapture capture) {
    if (_handled) {
      return;
    }
    final code = capture.barcodes
        .map((b) => b.rawValue?.trim() ?? '')
        .firstWhere((v) => v.isNotEmpty, orElse: () => '');
    if (code.isEmpty) {
      return;
    }
    _handled = true;
    Navigator.of(context).pop(code);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: Text(widget.title),
      ),
      body: Stack(
        children: [
          MobileScanner(
            controller: _controller,
            onDetect: _onDetect,
            // mobile_scanner 7.x: `errorBuilder` tidak lagi menerima widget
            // anak, jadi tampilannya dibangun penuh di [_ScannerError].
            errorBuilder: (context, error) => _ScannerError(error: error),
          ),
          Positioned.fill(child: _ScanFrameOverlay()),
          SafeArea(
            child: Column(
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    ValueListenableBuilder<MobileScannerState>(
                      valueListenable: _controller,
                      builder: (context, state, _) {
                        final torchOn = state.torchState == TorchState.on;
                        final torchAvailable =
                            state.torchState != TorchState.unavailable;
                        final canSwitch = (state.availableCameras ?? 0) > 1;
                        return Row(
                          children: [
                            if (torchAvailable)
                              _CircleAction(
                                icon: torchOn
                                    ? Icons.flashlight_on
                                    : Icons.flashlight_off,
                                tooltip: torchOn
                                    ? 'Matikan senter'
                                    : 'Nyalakan senter',
                                onPressed: _controller.toggleTorch,
                              ),
                            if (canSwitch)
                              _CircleAction(
                                icon: Icons.cameraswitch_outlined,
                                tooltip: 'Ganti kamera',
                                onPressed: _controller.switchCamera,
                              ),
                          ],
                        );
                      },
                    ),
                  ],
                ),
                const Spacer(),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
                  decoration: const BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [Colors.transparent, Color(0xCC000000)],
                    ),
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(
                        Icons.qr_code_scanner,
                        color: AppColors.primary300,
                        size: 28,
                      ),
                      const SizedBox(height: 8),
                      Text(
                        widget.hint,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 14,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _CircleAction extends StatelessWidget {
  const _CircleAction({
    required this.icon,
    required this.tooltip,
    required this.onPressed,
  });

  final IconData icon;
  final String tooltip;
  final Future<void> Function() onPressed;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(6),
      child: IconButton(
        onPressed: onPressed,
        tooltip: tooltip,
        icon: Icon(icon, color: Colors.white),
        style: IconButton.styleFrom(
          backgroundColor: Colors.black54,
          minimumSize: const Size(44, 44),
        ),
      ),
    );
  }
}

/// Bingkai area pindai + penanda sudut, biar operator tahu arahkan ke mana.
class _ScanFrameOverlay extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Center(
        child: FractionallySizedBox(
          widthFactor: 0.8,
          child: AspectRatio(
            aspectRatio: 1.4,
            child: DecoratedBox(
              decoration: BoxDecoration(
                border: Border.all(
                  color: AppColors.primary300.withValues(alpha: 0.9),
                  width: 2,
                ),
                borderRadius: BorderRadius.circular(20),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ScannerError extends StatelessWidget {
  const _ScannerError({required this.error});

  final MobileScannerException error;

  @override
  Widget build(BuildContext context) {
    final denied = error.errorCode == MobileScannerErrorCode.permissionDenied;
    final unsupported = error.errorCode == MobileScannerErrorCode.unsupported;

    final (icon, title, message) = denied
        ? (
            Icons.no_photography_outlined,
            'Izin kamera belum diberikan',
            'Aktifkan izin kamera untuk ONEZENTRA di pengaturan perangkat, '
                'lalu buka kembali pemindai.',
          )
        : unsupported
        ? (
            Icons.camera_alt_outlined,
            'Kamera tidak tersedia',
            'Perangkat ini tidak mendukung pemindaian. Gunakan input manual '
                'nomor PO / Nopol.',
          )
        : (
            Icons.error_outline,
            'Kamera gagal dibuka',
            error.errorDetails?.message ??
                'Tutup aplikasi lain yang memakai kamera, lalu coba lagi.',
          );

    return ColoredBox(
      color: Colors.black,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, color: AppColors.primary300, size: 44),
              const SizedBox(height: 14),
              Text(
                title,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w700,
                  fontSize: 16,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                message,
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.white70, fontSize: 13.5),
              ),
              const SizedBox(height: 18),
              OutlinedButton(
                onPressed: () => Navigator.of(context).maybePop(),
                style: OutlinedButton.styleFrom(
                  foregroundColor: Colors.white,
                  side: const BorderSide(color: Colors.white30),
                ),
                child: const Text('Kembali & ketik manual'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
