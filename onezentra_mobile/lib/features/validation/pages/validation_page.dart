import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

import 'package:onezentra_mobile/core/theme/app_theme.dart';
import 'package:onezentra_mobile/features/auth/providers/auth_provider.dart';
import 'package:onezentra_mobile/features/gate/pages/gate_scanner_page.dart';
import 'package:onezentra_mobile/features/validation/models/validation_models.dart';
import 'package:onezentra_mobile/features/validation/pages/validation_session_page.dart';
import 'package:onezentra_mobile/features/validation/providers/validation_provider.dart';
import 'package:onezentra_mobile/features/validation/repositories/validation_repository.dart';
import 'package:onezentra_mobile/features/validation/widgets/validation_history_card.dart';
import 'package:onezentra_mobile/shared/widgets/app_widgets.dart';

/// Resolves a photo path; [fromCamera] selects camera vs gallery.
typedef ValidationPhotoPicker =
    Future<String?> Function({required bool fromCamera});

/// Validasi SJ — scan barcode PO untuk membuka sesi validasi, lalu lanjutkan
/// ke halaman pemrosesan sesi ([ValidationSessionPage]) tempat tiap produk
/// divalidasi satu per satu (qty aktual, kondisi, expired).
///
/// Mirrors the web app's `/validasi-sj` screen, adapted for a phone: the PO
/// scan accepts manual typing or the camera barcode scanner. Setelah "Mulai"
/// diklik, operator dialihkan ke halaman tersisa untuk pemrosesan produk agar
/// halaman scan tidak menumpuk bersama daftar item.
class ValidationPage extends StatefulWidget {
  const ValidationPage({
    super.key,
    this.repository,
    this.provider,
    this.openScanner,
    this.initialScanCode,
    this.pickPhoto,
  });

  /// Injectable so tests can run the screen against a fake repository.
  final ValidationRepository? repository;

  /// Injectable provider shared with [ValidationSessionPage] after Mulai so
  /// session state (the opened `active` session) survives the navigation.
  final ValidationProvider? provider;

  /// Opens the barcode scanner and resolves with the scanned code (null when
  /// the user backs out). Defaults to pushing [GateScannerPage]; tests inject
  /// a fake so no camera is ever started.
  final Future<String?> Function()? openScanner;

  /// PO barcode to validate immediately (e.g. handed off from Check In
  /// Point). The session starts automatically once, right after bootstrap.
  final String? initialScanCode;

  /// Injectable photo source so tests never open the camera or gallery.
  /// Defaults to the image picker with a compressed 1280px JPEG.
  final ValidationPhotoPicker? pickPhoto;

  @override
  State<ValidationPage> createState() => _ValidationPageState();
}

class _ValidationPageState extends State<ValidationPage> {
  late final ValidationProvider _provider =
      widget.provider ?? ValidationProvider(repository: widget.repository);
  final _scanController = TextEditingController();
  bool _autoStarted = false;

  @override
  void initState() {
    super.initState();
    // Deferred so `context.read` runs after the first frame, when the
    // inherited AuthProvider is guaranteed to be available.
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted) {
        return;
      }
      var user = context.read<AuthProvider>().user;
      var canView = user?.hasPermission('sj_validation.view') ?? false;
      var canCreate = user?.hasPermission('sj_validation.create') ?? false;
      await _provider.bootstrap(canView: canView);
      // Handoff from Check In Point: the PO is already known, so the
      // session opens by itself — the operator skips the scan entirely.
      // A view-only user still sees the PO in the field, but no request is
      // sent (the server would reject it with 403 anyway).
      var handoff = widget.initialScanCode?.trim();
      if (!_autoStarted && handoff != null && handoff.isNotEmpty) {
        _autoStarted = true;
        _scanController.text = handoff;
        if (canView && canCreate) {
          await _provider.start(handoff);
          if (mounted) {
            var session = _provider.active;
            if (session != null) {
              // Dialihkan ke halaman pemrosesan sesi tersisa agar daftar
              // produk tidak menumpuk bersama layar scan.
              // ignore: unawaited_futures
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => ValidationSessionPage(
                    provider: _provider,
                    session: session,
                  ),
                ),
              );
            }
          }
        }
      }
    });
  }

  @override
  void dispose() {
    _scanController.dispose();
    // Jangan dispose provider yang di-inject (shared dengan session page);
    // hanya dispose yang dibuat secara internal.
    if (widget.provider == null) {
      _provider.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) =>
      ChangeNotifierProvider<ValidationProvider>.value(
        value: _provider,
        child: Builder(builder: _buildPage),
      );

  Widget _buildPage(BuildContext context) {
    var user = context.watch<AuthProvider>().user;
    var canView = user?.hasPermission('sj_validation.view') ?? false;
    var canCreate = user?.hasPermission('sj_validation.create') ?? false;
    var validation = context.watch<ValidationProvider>();

    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        title: const Text('Validasi SJ'),
        elevation: 0,
        actions: [
          IconButton(
            onPressed: canView && !validation.isLoading
                ? () => validation.refresh()
                : null,
            tooltip: 'Muat ulang',
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: SafeArea(
        child: !canView
            ? _buildNoAccess()
            : RefreshIndicator(
                onRefresh: validation.refresh,
                color: AppTheme.primary600,
                child: LayoutBuilder(
                  builder: (context, constraints) {
                    // Same responsive rhythm as Check In Point: one column on
                    // phones, work + history side by side on tablets, and a
                    // wider gutter once the viewport can afford it.
                    var horizontalPadding = constraints.maxWidth >= 900
                        ? AppTheme.space8
                        : constraints.maxWidth >= 600
                        ? AppTheme.space6
                        : AppTheme.space4;
                    var work = Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _buildScanCard(validation, canCreate: canCreate),
                      ],
                    );
                    var history = ValidationHistoryCard(
                      validation: validation,
                      onOpen: (session) => validation.openSession(session.id),
                    );

                    return SingleChildScrollView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: EdgeInsets.fromLTRB(
                        horizontalPadding,
                        AppTheme.space4,
                        horizontalPadding,
                        AppTheme.space8,
                      ),
                      child: Center(
                        child: ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 960),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              _buildHeader(validation),
                              const SizedBox(height: AppTheme.space4),
                              work,
                              const SizedBox(height: AppTheme.space4),
                              history,
                            ],
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ),
      ),
    );
  }

  // ---------------------------------------------------------------------
  // No access
  // ---------------------------------------------------------------------

  Widget _buildNoAccess() => LayoutBuilder(
    builder: (context, constraints) {
      var horizontalPadding = constraints.maxWidth >= 900
          ? AppTheme.space8
          : constraints.maxWidth >= 600
          ? AppTheme.space6
          : AppTheme.space5;

      return SingleChildScrollView(
        padding: EdgeInsets.all(horizontalPadding),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 640),
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.all(AppTheme.space5),
              decoration: BoxDecoration(
                color: AppTheme.warningWell,
                borderRadius: AppTheme.radiusXl,
                border: Border.all(color: AppTheme.warningText),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(
                    Icons.lock_rounded,
                    size: 20,
                    color: AppTheme.warningText,
                  ),
                  const SizedBox(width: AppTheme.space3),
                  Expanded(
                    child: Text(
                      'Anda tidak memiliki izin untuk melihat Validasi SJ.',
                      style: GoogleFonts.roboto(
                        fontSize: 13,
                        height: 1.4,
                        color: AppTheme.warningText,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    },
  );

  // ---------------------------------------------------------------------
  // Dark header with the stats
  // ---------------------------------------------------------------------

  Widget _buildHeader(ValidationProvider validation) {
    var stats = [
      AppStatTile(
        label: 'Hari ini',
        value: validation.stats.hariIni,
        dotColor: Colors.white,
      ),
      AppStatTile(
        label: 'Berjalan',
        value: validation.stats.berjalan,
        dotColor: AppTheme.info,
      ),
      AppStatTile(
        label: 'Selesai',
        value: validation.stats.selesai,
        dotColor: AppTheme.success,
      ),
      AppStatTile(
        label: 'Batal',
        value: validation.stats.cancelled,
        dotColor: AppTheme.danger,
      ),
      AppStatTile(
        label: 'Total',
        value: validation.stats.total,
        dotColor: AppTheme.gray300,
      ),
    ];

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AppTheme.space5),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppTheme.ink900, AppTheme.ink800],
        ),
        borderRadius: AppTheme.radius2xl,
        boxShadow: [
          BoxShadow(
            color: AppTheme.ink900.withValues(alpha: 0.2),
            blurRadius: 20,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.1),
                  borderRadius: AppTheme.radiusLg,
                ),
                child: const Icon(
                  Icons.verified_rounded,
                  color: Colors.white,
                  size: 24,
                ),
              ),
              const SizedBox(width: AppTheme.space3),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Validasi SJ',
                      style: GoogleFonts.roboto(
                        fontSize: 18,
                        height: 1.2,
                        fontWeight: FontWeight.w700,
                        color: Colors.white,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Scan PO — validasi produk — selesaikan sesi',
                      style: GoogleFonts.roboto(
                        fontSize: 12,
                        height: 1.4,
                        color: AppTheme.gray400,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: AppTheme.space5),
          LayoutBuilder(
            builder: (context, constraints) {
              if (constraints.maxWidth < 520) {
                return Column(
                  children: [
                    Row(
                      children: [
                        Expanded(child: stats[0]),
                        const SizedBox(width: AppTheme.space2),
                        Expanded(child: stats[1]),
                      ],
                    ),
                    const SizedBox(height: AppTheme.space2),
                    Row(
                      children: [
                        Expanded(child: stats[2]),
                        const SizedBox(width: AppTheme.space2),
                        Expanded(child: stats[3]),
                      ],
                    ),
                    const SizedBox(height: AppTheme.space2),
                    Row(children: [Expanded(child: stats[4])]),
                  ],
                );
              }

              return Row(
                children: [
                  for (var i = 0; i < stats.length; i++) ...[
                    if (i > 0) const SizedBox(width: AppTheme.space2),
                    Expanded(child: stats[i]),
                  ],
                ],
              );
            },
          ),
          if (validation.statsError != null) ...[
            const SizedBox(height: AppTheme.space3),
            Text(
              'Statistik gagal dimuat — tarik untuk mencoba lagi.',
              style: GoogleFonts.roboto(fontSize: 11, color: AppTheme.gray400),
            ),
          ],
        ],
      ),
    );
  }

  // ---------------------------------------------------------------------
  // PO scan + message
  // ---------------------------------------------------------------------

  Widget _buildScanCard(
    ValidationProvider validation, {
    required bool canCreate,
  }) => AppCard(
    key: const ValueKey('validation-scan'),
    padding: const EdgeInsets.all(AppTheme.space5),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _iconBox(
              38,
              AppTheme.primary50,
              Icons.qr_code_scanner_rounded,
              iconColor: AppTheme.primary600,
            ),
            const SizedBox(width: AppTheme.space3),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Scan Dokumen',
                    style: GoogleFonts.roboto(
                      fontSize: 15,
                      height: 1.25,
                      fontWeight: FontWeight.w700,
                      color: AppTheme.foreground,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    'Pindai barcode PO / surat jalan, lalu Mulai',
                    style: GoogleFonts.roboto(
                      fontSize: 11.5,
                      height: 1.4,
                      color: AppTheme.gray400,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: AppTheme.space4),
        LayoutBuilder(
          builder: (context, constraints) {
            // Below 380px the start button would squeeze the input until the
            // PO is unreadable; stack them instead.
            var stacked = constraints.maxWidth < 380;
            var field = AppTextField(
              controller: _scanController,
              hint: 'Barcode PO...',
              prefixIcon: Icons.qr_code_scanner_rounded,
              enabled: canCreate && !validation.startBusy,
              suffixIcon: IconButton(
                tooltip: 'Pindai dengan kamera',
                onPressed: canCreate && !validation.startBusy
                    ? _openScanner
                    : null,
                icon: const Icon(Icons.photo_camera_rounded),
              ),
              textInputAction: TextInputAction.done,
              onEditingComplete: canCreate ? _submitScan : null,
            );
            var start = AppPrimaryButton(
              text: 'Mulai',
              height: 48,
              isFullWidth: stacked,
              leadingIcon: Icons.play_arrow_rounded,
              isLoading: validation.startBusy,
              onPressed: canCreate && !validation.startBusy
                  ? _submitScan
                  : null,
            );
            if (stacked) {
              return Column(
                children: [
                  field,
                  const SizedBox(height: AppTheme.space3),
                  start,
                ],
              );
            }
            return Row(
              children: [
                Expanded(child: field),
                const SizedBox(width: AppTheme.space3),
                // Natural width (not a fixed 104px box): a longer label such
                // as "Mulai" overflows a fixed box on narrow screens.
                start,
              ],
            );
          },
        ),
        if (!canCreate)
          _warningBox(
            'Anda tidak memiliki izin sj_validation.create untuk memulai sesi validasi.',
          ),
        if (validation.message != null) _buildBanner(validation.message!),
      ],
    ),
  );

  bool _hasPermission(String slug) =>
      context.read<AuthProvider>().user?.hasPermission(slug) ?? false;

  Future<void> _submitScan() async {
    if (!_hasPermission('sj_validation.create')) {
      return;
    }
    FocusScope.of(context).unfocus();
    // Uses the state field, not `context.read`: this State's context sits
    // above the ChangeNotifierProvider that owns the ValidationProvider.
    var code = _scanController.text;
    await _provider.start(code);
    var session = _provider.active;
    if (session != null) {
      _scanController.clear();
      if (mounted) {
        // Dialihkan ke halaman pemrosesan sesi tersisa agar daftar produk
        // tidak menumpuk bersama layar scan.
        // ignore: unawaited_futures
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) =>
                ValidationSessionPage(provider: _provider, session: session),
          ),
        );
      }
    }
  }

  /// Opens the camera scanner and, when a code is read, fills the scan field
  /// and starts the validation session immediately.
  Future<void> _openScanner() async {
    if (!_hasPermission('sj_validation.create')) {
      return;
    }
    var injected = widget.openScanner;
    var code = await (injected != null
        ? injected()
        : Navigator.of(context).push<String>(
            MaterialPageRoute(
              builder: (_) => const GateScannerPage(
                title: 'Pindai PO',
                hint: 'Arahkan kamera ke barcode PO / surat jalan.',
                subtitle:
                    'Hasil pindai langsung membuka sesi validasi dokumen.',
                cameraErrorHint:
                    'Kamera tidak dapat dijalankan. Masukkan barcode PO '
                    'secara manual di halaman Validasi SJ.',
              ),
            ),
          ));
    if (!mounted || code == null || code.isEmpty) {
      return;
    }
    _scanController.text = code;
    await _provider.start(code);
    var session = _provider.active;
    if (session != null && mounted) {
      _scanController.clear();
      // ignore: unawaited_futures
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) =>
              ValidationSessionPage(provider: _provider, session: session),
        ),
      );
    }
  }

  Widget _buildBanner(ValidationActionMessage message) => Container(
    margin: const EdgeInsets.only(top: AppTheme.space4),
    padding: const EdgeInsets.all(AppTheme.space3),
    decoration: BoxDecoration(
      color: message.success ? AppTheme.successWell : AppTheme.dangerWell,
      borderRadius: AppTheme.radiusLg,
      border: Border.all(
        color: message.success ? AppTheme.successText : AppTheme.dangerText,
      ),
    ),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(
          message.success ? Icons.check_circle_rounded : Icons.error_rounded,
          size: 18,
          color: message.success ? AppTheme.success : AppTheme.danger,
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            message.message,
            style: GoogleFonts.roboto(
              fontSize: 12.5,
              height: 1.4,
              color: AppTheme.gray700,
            ),
          ),
        ),
      ],
    ),
  );

  Widget _warningBox(String warning) => Container(
    width: double.infinity,
    margin: const EdgeInsets.only(top: AppTheme.space4),
    padding: const EdgeInsets.all(AppTheme.space3),
    decoration: BoxDecoration(
      color: AppTheme.warningWell,
      borderRadius: AppTheme.radiusLg,
      border: Border.all(color: AppTheme.warningText),
    ),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Icon(Icons.lock_rounded, size: 16, color: AppTheme.warningText),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            warning,
            style: GoogleFonts.roboto(
              fontSize: 12,
              height: 1.4,
              color: AppTheme.warningText,
            ),
          ),
        ),
      ],
    ),
  );

  Widget _iconBox(
    double size,
    Color background,
    IconData icon, {
    Color iconColor = Colors.white,
  }) => Container(
    width: size,
    height: size,
    decoration: BoxDecoration(
      color: background,
      borderRadius: AppTheme.radiusLg,
    ),
    child: Icon(icon, size: size * 0.5, color: iconColor),
  );
}
