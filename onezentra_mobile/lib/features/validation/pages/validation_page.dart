import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import 'package:onezentra_mobile/core/printer/thermal_label.dart';
import 'package:onezentra_mobile/core/theme/app_theme.dart';
import 'package:onezentra_mobile/features/auth/providers/auth_provider.dart';
import 'package:onezentra_mobile/features/gate/pages/gate_scanner_page.dart';
import 'package:onezentra_mobile/features/validation/models/validation_models.dart';
import 'package:onezentra_mobile/features/validation/providers/validation_provider.dart';
import 'package:onezentra_mobile/features/validation/repositories/validation_repository.dart';
import 'package:onezentra_mobile/features/validation/widgets/label_print_sheet.dart';
import 'package:onezentra_mobile/features/validation/widgets/validation_history_card.dart';
import 'package:onezentra_mobile/shared/widgets/app_widgets.dart';

/// Resolves a photo path; [fromCamera] selects camera vs gallery.
typedef ValidationPhotoPicker =
    Future<String?> Function({required bool fromCamera});

/// Validasi SJ — scan barcode PO untuk membuka sesi validasi, validasi
/// tiap produk (qty aktual, kondisi, expired), lalu selesaikan sesi.
///
/// Mirrors the web app's `/validasi-sj` screen, adapted for a phone: the PO
/// scan accepts manual typing or the camera barcode scanner, and each line
/// is validated through a bottom sheet.
class ValidationPage extends StatefulWidget {
  const ValidationPage({
    super.key,
    this.repository,
    this.openScanner,
    this.initialScanCode,
    this.pickPhoto,
  });

  /// Injectable so tests can run the screen against a fake repository.
  final ValidationRepository? repository;

  /// Opens the barcode scanner and resolves with the scanned code (null when
  /// the user backs out). Defaults to pushing [GateScannerPage]; tests inject
  /// a fake so no camera is ever started.
  final Future<String?> Function()? openScanner;

  /// PO barcode to validate immediately (e.g. handed off from Check In
  /// Point). The session starts automatically once, right after bootstrap.
  final String? initialScanCode;

  /// Injectable photo source so tests never open the camera or gallery.
  /// Defaults to [ImagePicker] with a compressed 1280px JPEG.
  final ValidationPhotoPicker? pickPhoto;

  @override
  State<ValidationPage> createState() => _ValidationPageState();
}

class _ValidationPageState extends State<ValidationPage> {
  late final ValidationProvider _provider = ValidationProvider(
    repository: widget.repository,
  );
  final _scanController = TextEditingController();
  bool _autoStarted = false;

  @override
  void initState() {
    super.initState();
    // Deferred so `context.read` runs after the first frame, when the
    // inherited AuthProvider is guaranteed to be available.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) {
        return;
      }
      var user = context.read<AuthProvider>().user;
      var canView = user?.hasPermission('sj_validation.view') ?? false;
      var canCreate = user?.hasPermission('sj_validation.create') ?? false;
      _provider.bootstrap(canView: canView);
      // Handoff from Check In Point: the PO is already known, so the
      // session opens by itself — the operator skips the scan entirely.
      // A view-only user still sees the PO in the field, but no request is
      // sent (the server would reject it with 403 anyway).
      var handoff = widget.initialScanCode?.trim();
      if (!_autoStarted && handoff != null && handoff.isNotEmpty) {
        _autoStarted = true;
        _scanController.text = handoff;
        if (canView && canCreate) {
          _provider.start(handoff);
        }
      }
    });
  }

  @override
  void dispose() {
    _scanController.dispose();
    _provider.dispose();
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
    var canValidate = user?.hasPermission('sj_validation.validate') ?? false;
    var canComplete = user?.hasPermission('sj_validation.complete') ?? false;
    var canCancel = user?.hasPermission('sj_validation.cancel') ?? false;
    var canPrintLabels =
        canValidate || (user?.hasPermission('penerimaan.view') ?? false);
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
                    var isWide = constraints.maxWidth >= 820;
                    var horizontalPadding = constraints.maxWidth >= 900
                        ? AppTheme.space8
                        : constraints.maxWidth >= 600
                        ? AppTheme.space6
                        : AppTheme.space4;
                    var work = Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _buildScanCard(validation, canCreate: canCreate),
                        if (validation.active != null) ...[
                          const SizedBox(height: AppTheme.space4),
                          _buildActiveCard(
                            validation.active!,
                            validation: validation,
                            canValidate: canValidate,
                            canComplete: canComplete,
                            canCancel: canCancel,
                            canPrintLabels: canPrintLabels,
                            canCreateStandarisasi:
                                user?.hasPermission('standarisasi.create') ??
                                false,
                          ),
                        ],
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
                              SizedBox(
                                height: isWide
                                    ? AppTheme.space5
                                    : AppTheme.space4,
                              ),
                              if (isWide)
                                Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Expanded(flex: 3, child: work),
                                    const SizedBox(width: AppTheme.space4),
                                    Expanded(flex: 2, child: history),
                                  ],
                                )
                              else ...[
                                work,
                                const SizedBox(height: AppTheme.space4),
                                history,
                              ],
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
    if (_provider.active != null) {
      _scanController.clear();
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
    if (_provider.active != null) {
      _scanController.clear();
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

  // ---------------------------------------------------------------------
  // Active session
  // ---------------------------------------------------------------------

  Widget _buildActiveCard(
    SjValidation session, {
    required ValidationProvider validation,
    required bool canValidate,
    required bool canComplete,
    required bool canCancel,
    required bool canPrintLabels,
    required bool canCreateStandarisasi,
  }) {
    var doc = session.document;
    // `can_correct_completed` is computed server-side from the user's
    // `sj_validation.edit_completed` permission AND the Receiving status.
    var canEditItems =
        canValidate && (session.isRunning || session.canCorrectCompleted);
    var statusHeading = session.isRunning
        ? 'SESI BERJALAN'
        : 'SESI ${ValidationStatus.label(session.status).toUpperCase()}';
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AppTheme.space4),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppTheme.ink900, AppTheme.ink800],
        ),
        borderRadius: AppTheme.radius2xl,
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  '$statusHeading • ${session.validatedCount}/'
                  '${session.totalItemCount} ITEM',
                  style: GoogleFonts.roboto(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.8,
                    color: AppTheme.gray400,
                  ),
                ),
              ),
              AppBadge(
                text: ValidationStatus.label(session.status),
                variant: _statusVariant(session.status),
              ),
              IconButton(
                onPressed: validation.actionBusy
                    ? null
                    : validation.clearActive,
                tooltip: 'Tutup',
                visualDensity: VisualDensity.compact,
                icon: Icon(
                  Icons.close_rounded,
                  size: 18,
                  color: Colors.white.withValues(alpha: 0.6),
                ),
              ),
            ],
          ),
          // Web parity: lines without an approved standarisasi stay locked
          // until BLC approves — the operator sees why at a glance.
          if (session.isRunning &&
              session.items.any((item) => item.isPending && !item.canValidate))
            _standarisasiBanner(),
          const SizedBox(height: AppTheme.space2),
          Row(
            children: [
              Expanded(
                child: _darkField(
                  'PO Transporter',
                  doc?.poTransporter ?? session.scanCode ?? '-',
                ),
              ),
              const SizedBox(width: AppTheme.space3),
              Expanded(
                child: _darkField(
                  'No. Polisi',
                  doc?.nopol ?? '-',
                  highlight: true,
                ),
              ),
            ],
          ),
          const SizedBox(height: AppTheme.space3),
          _darkField('Driver', doc?.driverName ?? '-'),
          const SizedBox(height: AppTheme.space3),
          ClipRRect(
            borderRadius: AppTheme.radiusFull,
            child: LinearProgressIndicator(
              value: session.totalItemCount == 0
                  ? 0
                  : session.validatedCount / session.totalItemCount,
              minHeight: 6,
              backgroundColor: Colors.white.withValues(alpha: 0.1),
              valueColor: const AlwaysStoppedAnimation<Color>(AppTheme.success),
            ),
          ),
          if (session.startedAt != null || session.durationSeconds != null)
            Padding(
              padding: const EdgeInsets.only(top: AppTheme.space2),
              child: Text(
                [
                  if (session.startedAt != null)
                    'Mulai ${_formatDateTime(session.startedAt)}',
                  if (session.durationSeconds != null)
                    'Durasi ${_formatDuration(session.durationSeconds)}',
                ].join(' • '),
                style: GoogleFonts.roboto(
                  fontSize: 10.5,
                  color: AppTheme.gray400,
                ),
              ),
            ),
          const SizedBox(height: AppTheme.space4),
          ...[
            for (var i = 0; i < session.items.length; i++) ...[
              _itemTile(
                session.items[i],
                validation: validation,
                canValidate: canEditItems,
                canPrintLabels: canPrintLabels,
                canCreateStandarisasi: canCreateStandarisasi,
              ),
              if (i != session.items.length - 1)
                const SizedBox(height: AppTheme.space2),
            ],
          ],
          if (session.isRunning) ...[
            const SizedBox(height: AppTheme.space4),
            if (canComplete)
              _buildCompleteSection(session, validation)
            else
              _inlineWarning(
                'Anda tidak memiliki izin sj_validation.complete untuk menyelesaikan sesi.',
              ),
            if (canCancel) ...[
              const SizedBox(height: AppTheme.space2),
              Align(
                child: TextButton.icon(
                  onPressed: validation.actionBusy
                      ? null
                      : () => _confirmCancel(validation),
                  style: TextButton.styleFrom(
                    foregroundColor: AppTheme.dangerText,
                    textStyle: GoogleFonts.roboto(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  icon: const Icon(Icons.cancel_rounded, size: 18),
                  label: const Text('Batalkan sesi'),
                ),
              ),
            ],
            const SizedBox(height: AppTheme.space2),
          ] else if (session.isCompleted && !session.canCorrectCompleted) ...[
            const SizedBox(height: AppTheme.space4),
            _inlineWarning(
              'Sesi selesai. Koreksi item hanya dapat dilakukan supervisor '
              'selama Receiving belum ditutup.',
            ),
          ] else if (session.isCancelled) ...[
            const SizedBox(height: AppTheme.space4),
            _inlineWarning(
              'Sesi dibatalkan; label dan data validasi ini tidak berlaku.',
            ),
          ],
        ],
      ),
    );
  }

  Widget _itemTile(
    SjValidationItem item, {
    required ValidationProvider validation,
    required bool canValidate,
    required bool canPrintLabels,
    required bool canCreateStandarisasi,
  }) {
    // Web parity: without an approved standarisasi the line routes to the
    // standarisasi input, never to validation.
    var tapAction = !canValidate || validation.actionBusy
        ? null
        : () => item.canValidate
              ? _openItemSheet(item)
              : _openStandarisasiSheet(item, canCreate: canCreateStandarisasi);
    return InkWell(
      onTap: tapAction,
      borderRadius: AppTheme.radiusLg,
      child: Container(
        padding: const EdgeInsets.all(AppTheme.space3),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.07),
          borderRadius: AppTheme.radiusLg,
          border: Border.all(
            color: !item.canValidate
                ? AppTheme.warningText.withValues(alpha: 0.5)
                : Colors.white.withValues(alpha: 0.08),
          ),
        ),
        child: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: item.isPending
                    ? Colors.white.withValues(alpha: 0.1)
                    : AppTheme.success.withValues(alpha: 0.2),
                borderRadius: AppTheme.radiusLg,
              ),
              child: Icon(
                item.isPending
                    ? Icons.hourglass_empty_rounded
                    : item.status == 'VALIDATED'
                    ? Icons.check_circle_rounded
                    : Icons.warning_rounded,
                size: 18,
                color: item.isPending
                    ? AppTheme.gray400
                    : item.status == 'VALIDATED'
                    ? AppTheme.success
                    : AppTheme.warning,
              ),
            ),
            const SizedBox(width: AppTheme.space3),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    item.namaBarang ?? item.kodeBarang ?? 'Item #${item.id}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.roboto(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'Ekspektasi ${_formatQty(item.expectedQty)}'
                    '${item.actualQty != null ? ' • Aktual ${_formatQty(item.actualQty)}' : ''}'
                    '${item.satuan != null ? ' ${item.satuan}' : ''}'
                    ' • ${ValidationItemStatus.label(item.status)}',
                    style: GoogleFonts.robotoMono(
                      fontSize: 11,
                      color: AppTheme.gray400,
                    ),
                  ),
                  // Same numbers the selisih email reports: signed
                  // difference plus the server-mapped reason.
                  if (item.selisih != null && item.selisih != 0)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(
                        'Selisih ${_formatSigned(item.selisih!)}'
                        '${item.selisihReason != null ? ' • ${item.selisihReason}' : ''}',
                        style: GoogleFonts.roboto(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: item.selisih! < 0
                              ? AppTheme.danger
                              : AppTheme.success,
                        ),
                      ),
                    ),
                  if (!item.canValidate)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(
                        item.standarisasi?.status == 'pending'
                            ? 'Standarisasi menunggu approve BLC'
                            : 'Butuh input standarisasi tumpukan',
                        style: GoogleFonts.roboto(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: AppTheme.warning,
                        ),
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(width: AppTheme.space2),
            // Aksi trailing dibungkus Wrap: pada layar sempit (badge kondisi
            // + badge tercetak + tombol cetak) melipat ke baris berikut
            // daripada meluber keluar kartu.
            Flexible(
              child: Wrap(
                spacing: AppTheme.space2,
                runSpacing: AppTheme.space2,
                alignment: WrapAlignment.end,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  if (item.isPending && canValidate && item.canValidate)
                    _quickOkButton(item, validation)
                  else if (item.isPending && canValidate && !item.canValidate)
                    _standarisasiButton(
                      item,
                      validation,
                      canCreate: canCreateStandarisasi,
                    )
                  else if (!item.isPending && canValidate && item.canValidate)
                    _editButton(item)
                  else
                    AppBadge(
                      text: ValidationCondition.label(item.condition),
                      variant: item.condition == 'FISIK_BAGUS'
                          ? AppBadgeVariant.gray
                          : AppBadgeVariant.warning,
                    ),
                  // Item yang sudah divalidasi punya batch label dari server,
                  // jadi operator bisa mencetak (atau mencetak ulang) labelnya
                  // di sini. Badge tercetak mengikuti printed_at server
                  // (mark-printed), sinkron lintas device seperti web.
                  if (canPrintLabels && item.canPrintLabel) ...[
                    if (item.batch?.isPrinted == true)
                      const AppBadge(
                        text: 'Tercetak',
                        variant: AppBadgeVariant.success,
                      ),
                    _printLabelButton(item),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Tombol cetak label untuk item yang sudah tervalidasi.
  Widget _printLabelButton(SjValidationItem item) => OutlinedButton.icon(
    onPressed: () => _openPrintSheet(item),
    style: OutlinedButton.styleFrom(
      foregroundColor: AppTheme.gray200,
      side: BorderSide(color: Colors.white.withValues(alpha: 0.15)),
      // Tema memaksa minimumSize full-width (Size(double.infinity, 52));
      // di dalam Row tak terbatas itu crash (minWidth tak hingga), jadi
      // kunci ulang ke lebar konten dan biarkan tinggi tumbuh saat text
      // scale diperbesar.
      minimumSize: const Size(0, 40),
      padding: const EdgeInsets.symmetric(horizontal: AppTheme.space3),
      shape: const RoundedRectangleBorder(borderRadius: AppTheme.radiusLg),
      textStyle: GoogleFonts.roboto(
        fontSize: 12.5,
        fontWeight: FontWeight.w700,
      ),
    ),
    icon: const Icon(Icons.print_rounded, size: 16),
    label: Text(item.batch?.isPrinted == true ? 'Cetak Ulang' : 'Cetak Label'),
  );

  /// Explicit edit affordance for an already validated line (running session
  /// or a supervisor correcting a completed one).
  Widget _editButton(SjValidationItem item) => OutlinedButton.icon(
    onPressed: () => _openItemSheet(item),
    style: OutlinedButton.styleFrom(
      foregroundColor: AppTheme.gray200,
      side: BorderSide(color: Colors.white.withValues(alpha: 0.15)),
      minimumSize: const Size(0, 40),
      padding: const EdgeInsets.symmetric(horizontal: AppTheme.space3),
      shape: const RoundedRectangleBorder(borderRadius: AppTheme.radiusLg),
      textStyle: GoogleFonts.roboto(
        fontSize: 12.5,
        fontWeight: FontWeight.w700,
      ),
    ),
    icon: const Icon(Icons.edit_rounded, size: 16),
    label: const Text('Ubah'),
  );

  /// Buka panel cetak label dan tampilkan hasilnya ke operator.
  /// Setelah cetak fisik, status dilaporkan ke server (mark-printed) agar
  /// badge tercetak sinkron lintas device — paritas tombol Cetak web.
  Future<void> _openPrintSheet(SjValidationItem item) async {
    var batch = item.batch;
    var printed = await LabelPrintSheet.show(
      context,
      label: BatchLabelData(
        batchId: batch?.id,
        batchNumber: batch?.batchNumber,
        barcodeLabel: batch?.barcodeLabel,
        kodeBarang: item.kodeBarang,
        namaBarang: item.namaBarang,
        actualQty: item.actualQty,
        satuan: item.satuan,
        expiredDate: item.expiredDate,
        condition: item.condition,
      ),
    );
    if (!mounted) {
      return;
    }
    if (printed ?? false) {
      // Lapor ke server dulu supaya badge tercetak sinkron; gagal lapor
      // tidak membatalkan cetakan fisik (paritas web).
      var reported = true;
      String? reportWarning;
      if (batch != null && batch.id > 0) {
        reported = await context.read<ValidationProvider>().markLabelPrinted(
          batch.id,
        );
        if (!mounted) {
          return;
        }
        var message = context.read<ValidationProvider>().message;
        if (!reported && message?.success == false) {
          reportWarning = message?.message;
        }
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            reported
                ? 'Label ${batch?.barcodeLabel ?? ''} tercetak.'
                : (reportWarning ?? 'Label tercetak, status gagal dilaporkan.'),
          ),
          backgroundColor: reported ? AppTheme.success : AppTheme.warning,
        ),
      );
    }
  }

  /// Amber shortcut into the standarisasi input for a locked line.
  Widget _standarisasiButton(
    SjValidationItem item,
    ValidationProvider validation, {
    required bool canCreate,
  }) => FilledButton.icon(
    onPressed: validation.actionBusy
        ? null
        : () => _openStandarisasiSheet(item, canCreate: canCreate),
    style: FilledButton.styleFrom(
      backgroundColor: AppTheme.warningText,
      // Dark ink on the pale amber surface; white-on-yellow was unreadable.
      foregroundColor: AppTheme.ink900,
      minimumSize: const Size(0, 40),
      padding: const EdgeInsets.symmetric(horizontal: AppTheme.space3),
      shape: const RoundedRectangleBorder(borderRadius: AppTheme.radiusLg),
      textStyle: GoogleFonts.roboto(
        fontSize: 12.5,
        fontWeight: FontWeight.w700,
      ),
    ),
    icon: const Icon(Icons.layers_rounded, size: 16),
    label: const Text('Standarisasi'),
  );

  Future<void> _openStandarisasiSheet(
    SjValidationItem item, {
    required bool canCreate,
  }) async {
    // Same modal-route rule as the validation sheet: re-expose the
    // page-scoped provider explicitly.
    await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => ChangeNotifierProvider<ValidationProvider>.value(
        value: _provider,
        child: _StandarisasiSheet(item: item, canCreate: canCreate),
      ),
    );
  }

  static String _formatQty(double? value) {
    if (value == null) {
      return '-';
    }
    return value == value.truncateToDouble() ? '${value.toInt()}' : '$value';
  }

  /// Signed qty like the selisih email (`+5`, `-3`).
  static String _formatSigned(double value) {
    var body = _formatQty(value.abs());
    if (value > 0) {
      return '+$body';
    }
    if (value < 0) {
      return '-$body';
    }
    return body;
  }

  static String _formatDateTime(DateTime? value) {
    if (value == null) {
      return '—';
    }
    var local = value.toLocal();
    String two(int part) => part.toString().padLeft(2, '0');
    return '${two(local.day)}/${two(local.month)}/${local.year} '
        '${two(local.hour)}:${two(local.minute)}';
  }

  static String _formatDuration(int? seconds) {
    if (seconds == null || seconds < 0) {
      return '—';
    }
    var duration = Duration(seconds: seconds);
    if (duration.inHours > 0) {
      return '${duration.inHours}j ${duration.inMinutes.remainder(60)}m';
    }
    if (duration.inMinutes > 0) {
      return '${duration.inMinutes}m';
    }
    return '${duration.inSeconds}d';
  }

  static AppBadgeVariant _statusVariant(String status) => switch (status) {
    'IN_PROGRESS' => AppBadgeVariant.primary,
    'COMPLETED' => AppBadgeVariant.success,
    'CANCELLED' => AppBadgeVariant.danger,
    _ => AppBadgeVariant.gray,
  };

  /// One-tap "matches" validation: actual = expected, condition good.
  /// When the expected qty is unknown the sheet opens instead, so the
  /// operator always enters a real number.
  Widget _quickOkButton(SjValidationItem item, ValidationProvider validation) {
    var expected = item.expectedQty;
    // The fast path may only skip the sheet when it would produce exactly the
    // same complete record: qty known, expiry already captured, good condition.
    // Otherwise open the sheet so expiry and condition are not bypassed.
    var needsSheet =
        expected == null ||
        !item.hasExpiredDate ||
        item.condition != 'FISIK_BAGUS';
    return FilledButton.icon(
      onPressed: validation.actionBusy
          ? null
          : () {
              if (needsSheet) {
                _openItemSheet(item);
                return;
              }
              validation.validateItem(
                itemId: item.id,
                actualQty: expected,
                expiredDate: item.expiredDate,
              );
            },
      style: FilledButton.styleFrom(
        backgroundColor: AppTheme.success,
        // Dark ink keeps the green CTA readable in the dark theme.
        foregroundColor: AppTheme.ink900,
        minimumSize: const Size(0, 40),
        padding: const EdgeInsets.symmetric(horizontal: AppTheme.space3),
        shape: const RoundedRectangleBorder(borderRadius: AppTheme.radiusLg),
        textStyle: GoogleFonts.roboto(
          fontSize: 12.5,
          fontWeight: FontWeight.w700,
        ),
      ),
      icon: const Icon(Icons.check_rounded, size: 16),
      label: const Text('Sesuai'),
    );
  }

  Future<void> _openItemSheet(SjValidationItem item) async {
    // The sheet lives on a modal route above this page, so the page-scoped
    // provider is re-exposed explicitly — otherwise `context.read` inside
    // the sheet throws ProviderNotFoundException.
    await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => ChangeNotifierProvider<ValidationProvider>.value(
        value: _provider,
        child: _ItemValidationSheet(item: item, pickPhoto: widget.pickPhoto),
      ),
    );
  }

  Future<void> _confirmComplete(ValidationProvider validation) async {
    var items = validation.active?.items ?? const <SjValidationItem>[];
    var mismatches = items
        .where((item) => item.selisih != null && item.selisih != 0)
        .toList();
    var totalSelisih = mismatches.fold<double>(
      0,
      (sum, item) => sum + (item.selisih ?? 0),
    );
    var confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: AppTheme.surfaceCard,
        title: Text(
          'Selesaikan validasi?',
          style: GoogleFonts.roboto(fontSize: 16, fontWeight: FontWeight.w700),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Sesi selesai → dokumen siap diproses Receiving.',
              style: GoogleFonts.roboto(
                fontSize: 13,
                height: 1.4,
                color: AppTheme.gray600,
              ),
            ),
            if (mismatches.isNotEmpty) ...[
              const SizedBox(height: AppTheme.space2),
              Text(
                '${mismatches.length} item selisih '
                '(${_formatSigned(totalSelisih)}): email selisih terkirim ke '
                'penerima terdaftar.',
                style: GoogleFonts.roboto(
                  fontSize: 13,
                  height: 1.4,
                  fontWeight: FontWeight.w600,
                  color: AppTheme.warningText,
                ),
              ),
            ],
            const SizedBox(height: AppTheme.space2),
            Text(
              'Email validasi terkirim ke BLC.',
              style: GoogleFonts.roboto(
                fontSize: 12.5,
                height: 1.4,
                color: AppTheme.gray500,
              ),
            ),
          ],
        ),
        actions: [
          // "Batal" di sini berarti "jangan selesaikan dulu", BUKAN "batalkan
          // validasi". Setelah tombol batalkan sesi dihapus dari mobile, label
          // "Batal" hanya menambah ambiguitas — operator bisa mengira sedang
          // membatalkan sesi. "Kembali" menyebut aksi yang sebenarnya terjadi:
          // dialog tertutup, tidak ada perubahan.
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Kembali'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            style: FilledButton.styleFrom(
              backgroundColor: AppTheme.success,
              foregroundColor: AppTheme.ink900,
            ),
            child: const Text('Ya, Selesaikan'),
          ),
        ],
      ),
    );
    if ((confirmed ?? false) && mounted) {
      await validation.completeActive();
    }
  }

  Future<void> _confirmCancel(ValidationProvider validation) async {
    var session = validation.active;
    if (session == null) {
      return;
    }
    var po = session.document?.poTransporter ?? session.scanCode ?? 'PO ini';
    var confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: AppTheme.surfaceCard,
        title: Text(
          'Batalkan sesi validasi?',
          style: GoogleFonts.roboto(fontSize: 16, fontWeight: FontWeight.w700),
        ),
        content: Text(
          'Sesi $po akan dibatalkan. Label yang sudah tercetak tidak berlaku '
          'lagi dan tindakan ini tidak dapat diurungkan.',
          style: GoogleFonts.roboto(
            fontSize: 13,
            height: 1.4,
            color: AppTheme.gray600,
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Kembali'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            style: FilledButton.styleFrom(
              backgroundColor: AppTheme.danger,
              foregroundColor: AppTheme.ink900,
            ),
            child: const Text('Ya, Batalkan'),
          ),
        ],
      ),
    );
    if ((confirmed ?? false) && mounted) {
      await validation.cancelActive();
    }
  }

  /// Amber reminder mirroring the web banner: validation stays locked
  /// until BLC approves the standarisasi tumpukan.
  Widget _standarisasiBanner() => Container(
    width: double.infinity,
    margin: const EdgeInsets.only(top: AppTheme.space3),
    padding: const EdgeInsets.all(AppTheme.space3),
    decoration: BoxDecoration(
      color: AppTheme.warningDark,
      borderRadius: AppTheme.radiusLg,
      border: Border.all(color: AppTheme.warningText),
    ),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Icon(Icons.layers_rounded, size: 18, color: AppTheme.warning),
        const SizedBox(width: 8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Standarisasi Tumpukan Belum Disetujui',
                style: GoogleFonts.roboto(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w700,
                  color: AppTheme.warningText,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                'Isi standarisasi per produk di bawah. Setelah disetujui '
                'BLC, validasi otomatis terbuka.',
                style: GoogleFonts.roboto(
                  fontSize: 11.5,
                  height: 1.4,
                  color: AppTheme.warning,
                ),
              ),
            ],
          ),
        ),
      ],
    ),
  );

  Widget _darkField(String label, String value, {bool highlight = false}) =>
      Container(
        padding: const EdgeInsets.symmetric(
          horizontal: AppTheme.space3,
          vertical: AppTheme.space2,
        ),
        decoration: highlight
            ? const BoxDecoration(
                color: AppTheme.primary100,
                borderRadius: AppTheme.radiusLg,
              )
            : BoxDecoration(
                color: Colors.white.withValues(alpha: 0.07),
                borderRadius: AppTheme.radiusLg,
                border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
              ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: GoogleFonts.roboto(
                fontSize: 10,
                fontWeight: FontWeight.w500,
                color: highlight ? AppTheme.primary800 : AppTheme.gray400,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              value,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: GoogleFonts.robotoMono(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: highlight ? AppTheme.primary950 : Colors.white,
              ),
            ),
          ],
        ),
      );

  Widget _inlineWarning(String warning) => Container(
    width: double.infinity,
    padding: const EdgeInsets.all(AppTheme.space3),
    decoration: BoxDecoration(
      color: AppTheme.warningDark,
      borderRadius: AppTheme.radiusLg,
      border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
    ),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Icon(Icons.lock_rounded, size: 16, color: AppTheme.warning),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            warning,
            style: GoogleFonts.roboto(
              fontSize: 12,
              height: 1.4,
              color: AppTheme.warning,
            ),
          ),
        ),
      ],
    ),
  );

  /// Complete section: the button stays disabled while lines are still
  /// pending — the server would reject the attempt anyway, so the operator
  /// is told exactly how many lines are left instead of failing on tap.
  /// Paritas web: label fisik wajib menempel — item tervalidasi yang
  /// labelnya belum dilaporkan tercetak ikut mengunci tombol.
  Widget _buildCompleteSection(
    SjValidation session,
    ValidationProvider validation,
  ) {
    var pending = session.items.where((item) => item.isPending).length;
    var missingExpired = session.items
        .where((item) => !item.isPending && !item.hasExpiredDate)
        .length;
    var unprinted = session.items
        .where(
          (item) =>
              !item.isPending &&
              item.hasLabel &&
              !(item.batch?.isPrinted ?? false),
        )
        .length;
    var blocked = pending > 0 || missingExpired > 0 || unprinted > 0;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _darkActionButton(
          label: pending > 0
              ? 'Selesaikan ($pending item tersisa)'
              : missingExpired > 0
              ? 'Lengkapi $missingExpired tanggal expired'
              : unprinted > 0
              ? 'Cetak $unprinted label dulu'
              : 'Selesaikan Validasi ✓',
          background: AppTheme.success,
          // Dark ink on green avoids the white-on-green contrast trap.
          foreground: AppTheme.ink900,
          loading: validation.actionBusy,
          onPressed: blocked ? null : () => _confirmComplete(validation),
        ),
        if (blocked) ...[
          const SizedBox(height: AppTheme.space2),
          Text(
            pending > 0
                ? 'Validasi dulu $pending item di atas — tombol aktif otomatis.'
                : missingExpired > 0
                ? 'Isi tanggal expired $missingExpired item di atas — server juga menolak sesi tanpa tanggal expired.'
                : 'Cetak label $unprinted item di atas — tombol aktif setelah semua dilaporkan tercetak.',
            textAlign: TextAlign.center,
            style: GoogleFonts.roboto(fontSize: 11.5, color: AppTheme.gray400),
          ),
        ],
      ],
    );
  }

  Widget _darkActionButton({
    required String label,
    required Color background,
    required Color foreground,
    required VoidCallback? onPressed,
    bool outline = false,
    bool loading = false,
  }) => SizedBox(
    width: double.infinity,
    child: FilledButton(
      onPressed: loading ? null : onPressed,
      style: FilledButton.styleFrom(
        backgroundColor: background,
        foregroundColor: foreground,
        disabledBackgroundColor: background.withValues(alpha: 0.6),
        disabledForegroundColor: foreground.withValues(alpha: 0.75),
        minimumSize: const Size(0, 44),
        side: outline
            ? BorderSide(color: Colors.white.withValues(alpha: 0.4))
            : null,
        shape: const RoundedRectangleBorder(borderRadius: AppTheme.radiusLg),
        textStyle: GoogleFonts.roboto(
          fontSize: 13.5,
          fontWeight: FontWeight.w700,
        ),
      ),
      child: loading
          ? SizedBox(
              width: 16,
              height: 16,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: foreground,
              ),
            )
          : Text(label, textAlign: TextAlign.center),
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

/// Small counter chip in the dark header.
/// Bottom sheet for validating one line: actual qty, condition, expiry,
/// optional product barcode / notes / stack measurements.
///
/// The sheet writes through [ValidationProvider] directly and pops `true`
/// when the line was saved, so the caller can refresh its own state.
class _ItemValidationSheet extends StatefulWidget {
  const _ItemValidationSheet({required this.item, this.pickPhoto});
  final SjValidationItem item;
  final ValidationPhotoPicker? pickPhoto;

  @override
  State<_ItemValidationSheet> createState() => _ItemValidationSheetState();
}

class _ItemValidationSheetState extends State<_ItemValidationSheet> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _qtyController = TextEditingController(
    text: _initialQty(widget.item),
  );
  final _barcodeController = TextEditingController();
  final _notesController = TextEditingController();
  final _expiredController = TextEditingController();
  String _condition = 'FISIK_BAGUS';
  DateTime? _expiredDate;
  String? _photoPath;
  bool _pickingPhoto = false;
  bool _saving = false;
  String? _error;
  String? _photoError;

  static String _initialQty(SjValidationItem item) {
    var value = item.actualQty ?? item.expectedQty;
    if (value == null) {
      return '';
    }
    return value == value.truncateToDouble() ? '${value.toInt()}' : '$value';
  }

  @override
  void initState() {
    super.initState();
    _condition = ValidationCondition.values.contains(widget.item.condition)
        ? widget.item.condition
        : 'FISIK_BAGUS';
    _expiredDate = DateTime.tryParse(widget.item.expiredDate ?? '');
    _expiredController.text = _formatDate(_expiredDate);
  }

  @override
  void dispose() {
    _qtyController.dispose();
    _barcodeController.dispose();
    _notesController.dispose();
    _expiredController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    var item = widget.item;
    // Panel gelap mengikuti aplikasi (dark-first): teks token terang di
    // file ini hanya terbaca di atas permukaan gelap.
    return Container(
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        border: Border.all(color: AppTheme.gray300),
      ),
      padding: EdgeInsets.only(
        left: AppTheme.space5,
        right: AppTheme.space5,
        top: AppTheme.space4,
        bottom: MediaQuery.of(context).viewInsets.bottom + AppTheme.space5,
      ),
      child: SafeArea(
        top: false,
        child: SingleChildScrollView(
          child: Form(
            key: _formKey,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    decoration: const BoxDecoration(
                      color: AppTheme.gray300,
                      borderRadius: AppTheme.radiusFull,
                    ),
                  ),
                ),
                const SizedBox(height: AppTheme.space4),
                Text(
                  item.namaBarang ?? item.kodeBarang ?? 'Item',
                  style: GoogleFonts.roboto(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: AppTheme.foreground,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  '${item.kodeBarang ?? '-'} • Ekspektasi ${_formatQty(item.expectedQty)}'
                  '${item.satuan != null ? ' ${item.satuan}' : ''}',
                  style: GoogleFonts.robotoMono(
                    fontSize: 12,
                    color: AppTheme.gray500,
                  ),
                ),
                const SizedBox(height: AppTheme.space4),
                AppTextField(
                  controller: _qtyController,
                  label: 'Qty aktual',
                  hint: '0',
                  prefixIcon: Icons.inventory_rounded,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  textInputAction: TextInputAction.next,
                  validator: (value) {
                    var qty = double.tryParse(
                      (value ?? '').replaceAll(',', '.'),
                    );
                    if (qty == null || qty < 0) {
                      return 'Isi qty aktual dengan angka ≥ 0';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: AppTheme.space3),
                Text(
                  'Kondisi',
                  style: Theme.of(context).textTheme.labelLarge?.copyWith(
                    fontWeight: FontWeight.w600,
                    color: AppTheme.gray700,
                  ),
                ),
                const SizedBox(height: AppTheme.space2),
                // Chips instead of a dropdown: every option is visible, one
                // tap to pick — no open-scroll-close dance per item.
                Wrap(
                  spacing: AppTheme.space2,
                  runSpacing: AppTheme.space2,
                  children: [
                    for (var value in ValidationCondition.values)
                      _conditionChip(value),
                  ],
                ),
                if (ValidationCondition.requiresPhoto.contains(_condition))
                  Padding(
                    padding: const EdgeInsets.only(top: AppTheme.space3),
                    child: _buildPhotoField(),
                  ),
                const SizedBox(height: AppTheme.space3),
                // Required, not hidden in "optional": the server blocks
                // completion without it and Opname Expired depends on it.
                AppTextField(
                  controller: _expiredController,
                  label: 'Tanggal expired *',
                  hint: 'Wajib diisi',
                  prefixIcon: Icons.calendar_today_rounded,
                  readOnly: true,
                  onTap: _pickDate,
                  validator: (_) => _expiredDate == null
                      ? 'Tanggal expired wajib diisi'
                      : null,
                ),
                const SizedBox(height: AppTheme.space3),
                // Rarely needed on a fast pass — tucked away so the common
                // case stays: qty → kondisi → expired → simpan.
                ExpansionTile(
                  title: Text(
                    'Detail lainnya (opsional)',
                    style: GoogleFonts.roboto(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: AppTheme.gray600,
                    ),
                  ),
                  iconColor: AppTheme.gray500,
                  collapsedIconColor: AppTheme.gray500,
                  tilePadding: EdgeInsets.zero,
                  childrenPadding: EdgeInsets.zero,
                  shape: const Border(),
                  children: [
                    AppTextField(
                      controller: _barcodeController,
                      label: 'Barcode produk',
                      hint: 'Scan / ketik barcode kemasan',
                      prefixIcon: Icons.barcode_reader,
                    ),
                    const SizedBox(height: AppTheme.space3),
                    AppTextField(
                      controller: _notesController,
                      label: 'Catatan',
                      hint: 'Keterangan tambahan',
                      prefixIcon: Icons.note_rounded,
                      maxLines: 2,
                    ),
                  ],
                ),
                if (_error != null) ...[
                  const SizedBox(height: AppTheme.space3),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(AppTheme.space3),
                    decoration: BoxDecoration(
                      color: AppTheme.dangerWell,
                      borderRadius: AppTheme.radiusLg,
                      border: Border.all(color: AppTheme.dangerText),
                    ),
                    child: Text(
                      _error!,
                      style: GoogleFonts.roboto(
                        fontSize: 12.5,
                        height: 1.4,
                        color: AppTheme.dangerText,
                      ),
                    ),
                  ),
                ],
                const SizedBox(height: AppTheme.space4),
                AppPrimaryButton(
                  text: 'Simpan Validasi',
                  isLoading: _saving,
                  onPressed:
                      _saving ||
                          _pickingPhoto ||
                          (ValidationCondition.requiresPhoto.contains(
                                _condition,
                              ) &&
                              _photoPath == null)
                      ? null
                      : _save,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  static String _formatQty(double? value) {
    if (value == null) {
      return '-';
    }
    return value == value.truncateToDouble() ? '${value.toInt()}' : '$value';
  }

  Widget _conditionChip(String value) {
    var selected = _condition == value;
    return InkWell(
      onTap: () => setState(() => _condition = value),
      borderRadius: AppTheme.radiusFull,
      child: Container(
        padding: const EdgeInsets.symmetric(
          horizontal: AppTheme.space4,
          vertical: AppTheme.space2,
        ),
        decoration: BoxDecoration(
          color: selected ? AppTheme.primary600 : AppTheme.surfaceCard,
          borderRadius: AppTheme.radiusFull,
          border: Border.all(
            color: selected ? AppTheme.primary600 : AppTheme.gray300,
          ),
        ),
        child: Text(
          ValidationCondition.label(value),
          style: GoogleFonts.roboto(
            fontSize: 12.5,
            fontWeight: FontWeight.w600,
            color: selected ? Colors.white : AppTheme.gray700,
          ),
        ),
      ),
    );
  }

  Widget _buildPhotoField() => Container(
    width: double.infinity,
    padding: const EdgeInsets.all(AppTheme.space3),
    decoration: BoxDecoration(
      color: AppTheme.warningWell,
      borderRadius: AppTheme.radiusLg,
      border: Border.all(color: AppTheme.warningText),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Icon(
              Icons.photo_camera_rounded,
              size: 16,
              color: AppTheme.warningText,
            ),
            const SizedBox(width: 6),
            Expanded(
              child: Text(
                'Foto bukti *',
                style: GoogleFonts.roboto(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w700,
                  color: AppTheme.warningText,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 3),
        Text(
          'Kondisi ini wajib foto. Ambil langsung atau pilih dari galeri.',
          style: GoogleFonts.roboto(
            fontSize: 11.5,
            height: 1.4,
            color: AppTheme.warningText,
          ),
        ),
        const SizedBox(height: AppTheme.space3),
        if (_photoPath == null)
          Row(
            children: [
              Expanded(
                child: AppSecondaryButton(
                  text: 'Kamera',
                  height: 44,
                  leadingIcon: Icons.photo_camera_rounded,
                  isLoading: _pickingPhoto,
                  onPressed: _saving || _pickingPhoto
                      ? null
                      : () => _pickPhoto(fromCamera: true),
                ),
              ),
              const SizedBox(width: AppTheme.space2),
              Expanded(
                child: AppSecondaryButton(
                  text: 'Galeri',
                  height: 44,
                  leadingIcon: Icons.photo_library_rounded,
                  onPressed: _saving || _pickingPhoto
                      ? null
                      : () => _pickPhoto(fromCamera: false),
                ),
              ),
            ],
          )
        else ...[
          ClipRRect(
            borderRadius: AppTheme.radiusLg,
            child: Image.file(
              File(_photoPath!),
              width: double.infinity,
              height: 160,
              fit: BoxFit.cover,
              errorBuilder: (_, _, _) => Container(
                width: double.infinity,
                height: 96,
                alignment: Alignment.center,
                color: AppTheme.gray100,
                child: Text(
                  'Pratinjau tidak tersedia',
                  style: GoogleFonts.roboto(
                    fontSize: 12,
                    color: AppTheme.gray500,
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(height: AppTheme.space2),
          Row(
            children: [
              Expanded(
                child: AppSecondaryButton(
                  text: 'Ganti',
                  height: 44,
                  leadingIcon: Icons.refresh_rounded,
                  onPressed: _saving || _pickingPhoto
                      ? null
                      : () => _pickPhoto(fromCamera: true),
                ),
              ),
              const SizedBox(width: AppTheme.space2),
              Expanded(
                child: AppSecondaryButton(
                  text: 'Hapus',
                  height: 44,
                  leadingIcon: Icons.delete_outline_rounded,
                  onPressed: _saving
                      ? null
                      : () => setState(() => _photoPath = null),
                ),
              ),
            ],
          ),
        ],
        if (_photoError != null) ...[
          const SizedBox(height: AppTheme.space2),
          Text(
            _photoError!,
            style: GoogleFonts.roboto(
              fontSize: 11.5,
              height: 1.4,
              color: AppTheme.dangerText,
            ),
          ),
        ],
      ],
    ),
  );

  Future<void> _pickPhoto({required bool fromCamera}) async {
    if (_pickingPhoto || _saving) {
      return;
    }
    setState(() {
      _pickingPhoto = true;
      _photoError = null;
    });

    try {
      String? path;
      var picker = widget.pickPhoto;
      if (picker != null) {
        path = await picker(fromCamera: fromCamera);
      } else {
        var file = await ImagePicker().pickImage(
          source: fromCamera ? ImageSource.camera : ImageSource.gallery,
          maxWidth: 1280,
          imageQuality: 80,
        );
        path = file?.path;
      }
      if (!mounted) {
        return;
      }
      if (path != null && path.isNotEmpty) {
        setState(() => _photoPath = path);
      }
    } on PlatformException catch (error) {
      if (!mounted) {
        return;
      }
      var denied =
          error.code == 'camera_access_denied' ||
          error.code == 'photo_access_denied';
      setState(() {
        _photoError = denied
            ? 'Izin kamera/galeri ditolak. Aktifkan izin di pengaturan '
                  'perangkat.'
            : 'Foto tidak dapat diambil. Coba lagi.';
      });
    } catch (error, stack) {
      debugPrint('ValidationPage._pickPhoto: ${error.runtimeType}: $error');
      debugPrintStack(stackTrace: stack, maxFrames: 8);
      if (!mounted) {
        return;
      }
      setState(() => _photoError = 'Foto tidak dapat diambil. Coba lagi.');
    } finally {
      if (mounted) {
        setState(() => _pickingPhoto = false);
      }
    }
  }

  Future<void> _pickDate() async {
    var picked = await showDatePicker(
      context: context,
      initialDate: _expiredDate ?? DateTime.now().add(const Duration(days: 30)),
      firstDate: DateTime(2000),
      lastDate: DateTime(2100),
    );
    if (picked != null && mounted) {
      setState(() {
        _expiredDate = picked;
        _expiredController.text = _formatDate(picked);
      });
      _formKey.currentState?.validate();
    }
  }

  static String _formatDate(DateTime? value) {
    if (value == null) {
      return '';
    }
    String two(int part) => part.toString().padLeft(2, '0');
    return '${two(value.day)}/${two(value.month)}/${value.year}';
  }

  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false)) {
      return;
    }
    if (_expiredDate == null) {
      setState(() => _error = 'Tanggal expired wajib diisi.');
      return;
    }
    if (ValidationCondition.requiresPhoto.contains(_condition) &&
        _photoPath == null) {
      setState(
        () => _error =
            'Kondisi ini wajib foto. Ambil foto langsung atau pilih dari '
            'galeri.',
      );
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });

    var provider = context.read<ValidationProvider>();
    var success = await provider.validateItem(
      itemId: widget.item.id,
      actualQty: double.parse(_qtyController.text.trim().replaceAll(',', '.')),
      barcode: _barcodeController.text.trim().isEmpty
          ? null
          : _barcodeController.text.trim(),
      condition: _condition,
      expiredDate: _expiredDate == null
          ? null
          : '${_expiredDate!.year.toString().padLeft(4, '0')}-'
                '${_expiredDate!.month.toString().padLeft(2, '0')}-'
                '${_expiredDate!.day.toString().padLeft(2, '0')}',
      notes: _notesController.text.trim().isEmpty
          ? null
          : _notesController.text.trim(),
      photoPath: _photoPath,
    );

    if (!mounted) {
      return;
    }
    if (success) {
      Navigator.of(context).pop(true);
    } else {
      setState(() {
        _saving = false;
        _error =
            provider.message?.message ?? 'Gagal menyimpan. Silakan coba lagi.';
      });
    }
  }
}

/// Bottom sheet for the standarisasi tumpukan input of one product.
///
/// Web parity: a validation line stays locked until its standarisasi is
/// approved by BLC. The cheker fills tier × tinggi here (created `pending`,
/// exactly like the web create form); an already-pending record only shows
/// its waiting status so no duplicate is ever submitted.
class _StandarisasiSheet extends StatefulWidget {
  const _StandarisasiSheet({required this.item, required this.canCreate});
  final SjValidationItem item;

  /// Whether the role has `standarisasi.create`. Without it the form is
  /// replaced by an explanation instead of a failing save button.
  final bool canCreate;

  @override
  State<_StandarisasiSheet> createState() => _StandarisasiSheetState();
}

class _StandarisasiSheetState extends State<_StandarisasiSheet> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _tierController = TextEditingController(
    text: '${widget.item.standarisasi?.tier ?? 1}',
  );
  late final TextEditingController _tinggiController = TextEditingController(
    text: '${widget.item.standarisasi?.tinggiTumpukan ?? 1}',
  );
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _tierController.dispose();
    _tinggiController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    var item = widget.item;
    var standarisasi = item.standarisasi;
    var pending = standarisasi?.status == 'pending';

    return Container(
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        border: Border.all(color: AppTheme.gray300),
      ),
      padding: EdgeInsets.only(
        left: AppTheme.space5,
        right: AppTheme.space5,
        top: AppTheme.space4,
        bottom: MediaQuery.of(context).viewInsets.bottom + AppTheme.space5,
      ),
      child: SafeArea(
        top: false,
        child: SingleChildScrollView(
          child: Form(
            key: _formKey,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    decoration: const BoxDecoration(
                      color: AppTheme.gray300,
                      borderRadius: AppTheme.radiusFull,
                    ),
                  ),
                ),
                const SizedBox(height: AppTheme.space4),
                Row(
                  children: [
                    Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(
                        color: AppTheme.warningText.withValues(alpha: 0.12),
                        borderRadius: AppTheme.radiusLg,
                      ),
                      child: const Icon(
                        Icons.layers_rounded,
                        size: 20,
                        color: AppTheme.warningText,
                      ),
                    ),
                    const SizedBox(width: AppTheme.space3),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Standarisasi Tumpukan',
                            style: GoogleFonts.roboto(
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                              color: AppTheme.foreground,
                            ),
                          ),
                          Text(
                            item.namaBarang ?? item.kodeBarang ?? 'Produk',
                            style: GoogleFonts.robotoMono(
                              fontSize: 12,
                              color: AppTheme.gray500,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: AppTheme.space4),
                if (item.npnId == null)
                  _noticeBox(
                    'Data produk tidak lengkap (npn tidak terbaca). '
                    'Isi standarisasi produk ini di web.',
                    isError: true,
                  )
                else if (pending)
                  _noticeBox(
                    'Sudah dikirim — tier ${standarisasi?.tier ?? '-'} × '
                    'tinggi ${standarisasi?.tinggiTumpukan ?? '-'} '
                    'menunggu approve BLC. Validasi otomatis terbuka '
                    'setelah disetujui.',
                    isError: false,
                  )
                else if (!widget.canCreate)
                  _noticeBox(
                    'Anda tidak memiliki izin standarisasi.create untuk '
                    'mengirim standarisasi. Minta peran yang berwenang.',
                    isError: true,
                  )
                else ...[
                  Text(
                    'Produk ini belum punya standarisasi yang disetujui. '
                    'Isi sekali — dikirim untuk approve BLC.',
                    style: GoogleFonts.roboto(
                      fontSize: 12.5,
                      height: 1.4,
                      color: AppTheme.gray600,
                    ),
                  ),
                  const SizedBox(height: AppTheme.space4),
                  Row(
                    children: [
                      Expanded(
                        child: AppTextField(
                          key: const ValueKey('standarisasi_tier'),
                          controller: _tierController,
                          label: 'Tier',
                          hint: '1',
                          prefixIcon: Icons.layers_rounded,
                          keyboardType: TextInputType.number,
                          validator: (value) {
                            var tier = int.tryParse((value ?? '').trim());
                            if (tier == null || tier < 1) {
                              return 'Isi tier ≥ 1';
                            }
                            return null;
                          },
                        ),
                      ),
                      const SizedBox(width: AppTheme.space3),
                      Expanded(
                        child: AppTextField(
                          key: const ValueKey('standarisasi_tinggi'),
                          controller: _tinggiController,
                          label: 'Tinggi tumpukan',
                          hint: '1',
                          prefixIcon: Icons.height_rounded,
                          keyboardType: TextInputType.number,
                          validator: (value) {
                            var tinggi = int.tryParse((value ?? '').trim());
                            if (tinggi == null || tinggi < 1) {
                              return 'Isi tinggi ≥ 1';
                            }
                            return null;
                          },
                        ),
                      ),
                    ],
                  ),
                ],
                if (_error != null) ...[
                  const SizedBox(height: AppTheme.space3),
                  _noticeBox(_error!, isError: true),
                ],
                const SizedBox(height: AppTheme.space4),
                if (item.npnId != null && !pending && widget.canCreate)
                  AppPrimaryButton(
                    text: 'Kirim untuk Approve BLC',
                    isLoading: _saving,
                    onPressed: _saving ? null : _save,
                  )
                else
                  AppSecondaryButton(
                    text: 'Tutup',
                    onPressed: () => Navigator.of(context).pop(false),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _noticeBox(String message, {required bool isError}) {
    var background = isError ? AppTheme.dangerWell : AppTheme.warningWell;
    var border = isError ? AppTheme.dangerText : AppTheme.warningText;
    var textColor = isError ? AppTheme.dangerText : AppTheme.warningText;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AppTheme.space3),
      decoration: BoxDecoration(
        color: background,
        borderRadius: AppTheme.radiusLg,
        border: Border.all(color: border),
      ),
      child: Text(
        message,
        style: GoogleFonts.roboto(
          fontSize: 12.5,
          height: 1.4,
          color: textColor,
        ),
      ),
    );
  }

  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false)) {
      return;
    }
    var npnId = widget.item.npnId;
    if (npnId == null) {
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });

    var provider = context.read<ValidationProvider>();
    var success = await provider.submitStandarisasi(
      npnId: npnId,
      tier: int.parse(_tierController.text.trim()),
      tinggiTumpukan: int.parse(_tinggiController.text.trim()),
    );

    if (!mounted) {
      return;
    }
    if (success) {
      Navigator.of(context).pop(true);
    } else {
      setState(() {
        _saving = false;
        _error =
            provider.message?.message ?? 'Gagal menyimpan. Silakan coba lagi.';
      });
    }
  }
}
