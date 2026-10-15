import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

import 'package:onezentra_mobile/core/printer/thermal_label.dart';
import 'package:onezentra_mobile/core/theme/app_theme.dart';
import 'package:onezentra_mobile/features/auth/providers/auth_provider.dart';
import 'package:onezentra_mobile/features/gate/pages/gate_scanner_page.dart';
import 'package:onezentra_mobile/features/validation/models/validation_models.dart';
import 'package:onezentra_mobile/features/validation/providers/validation_provider.dart';
import 'package:onezentra_mobile/features/validation/repositories/validation_repository.dart';
import 'package:onezentra_mobile/features/validation/widgets/label_print_sheet.dart';
import 'package:onezentra_mobile/shared/widgets/app_widgets.dart';

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

  @override
  State<ValidationPage> createState() => _ValidationPageState();
}

class _ValidationPageState extends State<ValidationPage> {
  late final ValidationProvider _provider = ValidationProvider(
    repository: widget.repository,
  );
  final _scanController = TextEditingController();
  final _searchController = TextEditingController();
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
      var canView =
          context.read<AuthProvider>().user?.hasPermission(
            'sj_validation.view',
          ) ??
          false;
      _provider.bootstrap(canView: canView);
      // Handoff from Check In Point: the PO is already known, so the
      // session opens by itself — the operator skips the scan entirely.
      var handoff = widget.initialScanCode?.trim();
      if (!_autoStarted && handoff != null && handoff.isNotEmpty) {
        _autoStarted = true;
        _scanController.text = handoff;
        _provider.start(handoff);
      }
    });
  }

  @override
  void dispose() {
    _scanController.dispose();
    _searchController.dispose();
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
                child: SingleChildScrollView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.all(AppTheme.space4),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _buildHeader(validation),
                      const SizedBox(height: AppTheme.space4),
                      _buildScanCard(validation, canCreate: canCreate),
                      const SizedBox(height: AppTheme.space4),
                      if (validation.active != null)
                        _buildActiveCard(
                          validation.active!,
                          validation: validation,
                          canValidate: canValidate,
                          canComplete: canComplete,
                          canCreateStandarisasi:
                              user?.hasPermission('standarisasi.create') ??
                              false,
                        ),
                      if (validation.active != null)
                        const SizedBox(height: AppTheme.space4),
                      _buildHistory(validation),
                      const SizedBox(height: AppTheme.space8),
                    ],
                  ),
                ),
              ),
      ),
    );
  }

  // ---------------------------------------------------------------------
  // No access
  // ---------------------------------------------------------------------

  Widget _buildNoAccess() => SingleChildScrollView(
    padding: const EdgeInsets.all(AppTheme.space5),
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
          const Icon(Icons.lock_rounded, size: 20, color: AppTheme.warningText),
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
  );

  // ---------------------------------------------------------------------
  // Dark header with the stats
  // ---------------------------------------------------------------------

  Widget _buildHeader(ValidationProvider validation) => Container(
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
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.1),
                borderRadius: AppTheme.radiusLg,
              ),
              child: const Icon(
                Icons.verified_rounded,
                color: Colors.white,
                size: 22,
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
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'Scan PO — validasi produk — selesaikan',
                    style: GoogleFonts.roboto(
                      fontSize: 12,
                      color: AppTheme.gray400,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: AppTheme.space4),
        Wrap(
          spacing: AppTheme.space2,
          runSpacing: AppTheme.space2,
          children: [
            _StatChip(
              label: 'Hari ini',
              value: validation.stats.hariIni,
              dotColor: Colors.white,
            ),
            _StatChip(
              label: 'Berjalan',
              value: validation.stats.berjalan,
              dotColor: AppTheme.info,
            ),
            _StatChip(
              label: 'Selesai',
              value: validation.stats.selesai,
              dotColor: AppTheme.success,
            ),
            _StatChip(
              label: 'Total',
              value: validation.stats.total,
              dotColor: AppTheme.gray300,
            ),
          ],
        ),
      ],
    ),
  );

  // ---------------------------------------------------------------------
  // PO scan + message
  // ---------------------------------------------------------------------

  Widget _buildScanCard(
    ValidationProvider validation, {
    required bool canCreate,
  }) => AppCard(
    padding: const EdgeInsets.all(AppTheme.space5),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            _iconBox(36, AppTheme.gray900, Icons.qr_code_scanner_rounded),
            const SizedBox(width: AppTheme.space3),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Scan Dokumen',
                    style: GoogleFonts.roboto(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: AppTheme.foreground,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'Pindai barcode PO / surat jalan, lalu Mulai',
                    style: GoogleFonts.roboto(
                      fontSize: 11,
                      color: AppTheme.gray400,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: AppTheme.space4),
        Row(
          children: [
            Expanded(
              child: AppTextField(
                controller: _scanController,
                hint: 'Barcode PO...',
                prefixIcon: Icons.qr_code_scanner_rounded,
                suffixIcon: IconButton(
                  tooltip: 'Pindai dengan kamera',
                  onPressed: validation.startBusy ? null : _openScanner,
                  icon: const Icon(Icons.photo_camera_rounded),
                ),
                textInputAction: TextInputAction.done,
                onEditingComplete: _submitScan,
              ),
            ),
            const SizedBox(width: AppTheme.space3),
            // Natural width (not a fixed 104px box): a longer label such
            // as "Mulai" overflows a fixed box on narrow screens.
            AppPrimaryButton(
              text: 'Mulai',
              height: 48,
              isFullWidth: false,
              isLoading: validation.startBusy,
              onPressed: validation.startBusy ? null : _submitScan,
            ),
          ],
        ),
        if (!canCreate)
          _warningBox(
            'Anda tidak memiliki izin sj_validation.create untuk memulai sesi validasi.',
          ),
        if (validation.message != null) _buildBanner(validation.message!),
      ],
    ),
  );

  Future<void> _submitScan() async {
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
    required bool canCreateStandarisasi,
  }) {
    var doc = session.document;
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
                  'SESI BERJALAN • ${session.validatedCount}/${session.items.length} ITEM',
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
                variant: session.isRunning
                    ? AppBadgeVariant.primary
                    : AppBadgeVariant.success,
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
          if (session.items.any((item) => !item.canValidate))
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
              value: session.items.isEmpty
                  ? 0
                  : session.validatedCount / session.items.length,
              minHeight: 6,
              backgroundColor: Colors.white.withValues(alpha: 0.1),
              valueColor: const AlwaysStoppedAnimation<Color>(AppTheme.success),
            ),
          ),
          const SizedBox(height: AppTheme.space4),
          ...[
            for (var i = 0; i < session.items.length; i++) ...[
              _itemTile(
                session.items[i],
                validation: validation,
                canValidate: canValidate && session.isRunning,
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
            const SizedBox(height: AppTheme.space2),
          ],
        ],
      ),
    );
  }

  Widget _itemTile(
    SjValidationItem item, {
    required ValidationProvider validation,
    required bool canValidate,
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
                  else if (item.isPending &&
                      canValidate &&
                      !item.canValidate)
                    _standarisasiButton(
                      item,
                      validation,
                      canCreate: canCreateStandarisasi,
                    )
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
                  if (item.hasLabel) ...[
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
  Widget _printLabelButton(SjValidationItem item) => SizedBox(
    height: 40,
    child: OutlinedButton.icon(
      onPressed: () => _openPrintSheet(item),
      style: OutlinedButton.styleFrom(
        foregroundColor: AppTheme.gray200,
        side: BorderSide(color: Colors.white.withValues(alpha: 0.15)),
        // Tema memaksa minimumSize full-width (Size(double.infinity, 52));
        // di dalam Row tak terbatas itu crash (minWidth tak hingga), jadi
        // kunci ulang ke lebar konten × tinggi baris tile.
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
    ),
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
        reported = await context
            .read<ValidationProvider>()
            .markLabelPrinted(batch.id);
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
  }) => SizedBox(
    height: 40,
    child: FilledButton.icon(
      onPressed: validation.actionBusy
          ? null
          : () => _openStandarisasiSheet(item, canCreate: canCreate),
      style: FilledButton.styleFrom(
        backgroundColor: AppTheme.warningText,
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(horizontal: AppTheme.space3),
        shape: const RoundedRectangleBorder(borderRadius: AppTheme.radiusLg),
        textStyle: GoogleFonts.roboto(
          fontSize: 12.5,
          fontWeight: FontWeight.w700,
        ),
      ),
      icon: const Icon(Icons.layers_rounded, size: 16),
      label: const Text('Standarisasi'),
    ),
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

  /// One-tap "matches" validation: actual = expected, condition good.
  /// When the expected qty is unknown the sheet opens instead, so the
  /// operator always enters a real number.
  Widget _quickOkButton(SjValidationItem item, ValidationProvider validation) {
    var expected = item.expectedQty;
    return SizedBox(
      height: 40,
      child: FilledButton.icon(
        onPressed: validation.actionBusy
            ? null
            : () {
                if (expected == null) {
                  _openItemSheet(item);
                  return;
                }
                validation.validateItem(itemId: item.id, actualQty: expected);
              },
        style: FilledButton.styleFrom(
          backgroundColor: AppTheme.success,
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(horizontal: AppTheme.space3),
          shape: const RoundedRectangleBorder(borderRadius: AppTheme.radiusLg),
          textStyle: GoogleFonts.roboto(
            fontSize: 12.5,
            fontWeight: FontWeight.w700,
          ),
        ),
        icon: const Icon(Icons.check_rounded, size: 16),
        label: const Text('Sesuai'),
      ),
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
        child: _ItemValidationSheet(item: item),
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
              foregroundColor: Colors.white,
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
                color: Colors.white,
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
                color: highlight
                    ? AppTheme.gray50.withValues(alpha: 0.65)
                    : AppTheme.gray400,
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
                color: highlight ? AppTheme.gray50 : Colors.white,
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
    var unprinted = session.items
        .where(
          (item) =>
              !item.isPending &&
              item.hasLabel &&
              !(item.batch?.isPrinted ?? false),
        )
        .length;
    var blocked = pending > 0 || unprinted > 0;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _darkActionButton(
          label: pending > 0
              ? 'Selesaikan ($pending item tersisa)'
              : unprinted > 0
              ? 'Cetak $unprinted label dulu'
              : 'Selesaikan Validasi ✓',
          background: AppTheme.success,
          foreground: Colors.white,
          loading: validation.actionBusy,
          onPressed: blocked ? null : () => _confirmComplete(validation),
        ),
        if (blocked) ...[
          const SizedBox(height: AppTheme.space2),
          Text(
            pending > 0
                ? 'Validasi dulu $pending item di atas — tombol aktif otomatis.'
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
    height: 44,
    child: FilledButton(
      onPressed: loading ? null : onPressed,
      style: FilledButton.styleFrom(
        backgroundColor: background,
        foregroundColor: foreground,
        disabledBackgroundColor: background.withValues(alpha: 0.6),
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
          : Text(label),
    ),
  );

  // ---------------------------------------------------------------------
  // History
  // ---------------------------------------------------------------------

  Widget _buildHistory(ValidationProvider validation) => AppCard(
    padding: const EdgeInsets.all(AppTheme.space5),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            _iconBox(
              36,
              AppTheme.primary50,
              Icons.history_rounded,
              iconColor: AppTheme.primary600,
            ),
            const SizedBox(width: AppTheme.space3),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Riwayat Validasi',
                    style: GoogleFonts.roboto(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: AppTheme.foreground,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '${validation.total} sesi tercatat',
                    style: GoogleFonts.roboto(
                      fontSize: 11,
                      color: AppTheme.gray400,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: AppTheme.space4),
        AppTextField(
          controller: _searchController,
          hint: 'Cari PO...',
          prefixIcon: Icons.search_rounded,
          onChanged: validation.setSearch,
        ),
        const SizedBox(height: AppTheme.space3),
        ..._historyBody(validation),
      ],
    ),
  );

  List<Widget> _historyBody(ValidationProvider validation) {
    var listError = validation.listError;
    if (listError != null) {
      return [
        SizedBox(
          width: double.infinity,
          child: AppErrorDisplay(
            message: listError,
            onRetry: validation.loadItems,
          ),
        ),
      ];
    }

    if (validation.isLoading && validation.items.isEmpty) {
      return [
        Column(
          children: List.generate(
            3,
            (_) => Container(
              height: 64,
              margin: const EdgeInsets.only(bottom: AppTheme.space3),
              decoration: const BoxDecoration(
                color: AppTheme.gray100,
                borderRadius: AppTheme.radiusLg,
              ),
            ),
          ),
        ),
      ];
    }

    if (validation.items.isEmpty) {
      return [
        SizedBox(
          width: double.infinity,
          child: AppEmptyState(
            icon: Icons.verified_rounded,
            title: validation.search.isNotEmpty
                ? 'Tidak ada hasil'
                : 'Belum ada sesi validasi',
            subtitle: validation.search.isNotEmpty
                ? 'Cari dengan PO lain.'
                : 'Sesi muncul setelah scan PO pertama.',
          ),
        ),
      ];
    }

    var items = validation.items;
    return [
      Column(
        children: [
          for (var i = 0; i < items.length; i++) ...[
            _historyTile(items[i], validation),
            if (i != items.length - 1)
              const Divider(height: 1, color: AppTheme.gray100, indent: 46),
          ],
        ],
      ),
      if (validation.lastPage > 1)
        Padding(
          padding: const EdgeInsets.only(top: AppTheme.space4),
          child: Column(
            children: [
              const Divider(height: 1, color: AppTheme.gray100),
              const SizedBox(height: AppTheme.space3),
              Row(
                children: [
                  Expanded(
                    child: AppSecondaryButton(
                      text: 'Sebelumnya',
                      height: 42,
                      isLoading: validation.isLoading,
                      onPressed: validation.canGoBack && !validation.isLoading
                          ? () =>
                                validation.goToPage(validation.currentPage - 1)
                          : null,
                    ),
                  ),
                  const SizedBox(width: AppTheme.space2),
                  Text(
                    'Halaman ${validation.currentPage}/${validation.lastPage}',
                    style: GoogleFonts.roboto(
                      fontSize: 11.5,
                      color: AppTheme.gray500,
                    ),
                  ),
                  const SizedBox(width: AppTheme.space2),
                  Expanded(
                    child: AppSecondaryButton(
                      text: 'Selanjutnya',
                      height: 42,
                      isLoading: validation.isLoading,
                      onPressed:
                          validation.canGoForward && !validation.isLoading
                          ? () =>
                                validation.goToPage(validation.currentPage + 1)
                          : null,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
    ];
  }

  Widget _historyTile(
    SjValidation session,
    ValidationProvider validation,
  ) => InkWell(
    onTap: validation.actionBusy
        ? null
        : () => validation.openSession(session.id),
    borderRadius: AppTheme.radiusLg,
    child: Padding(
      padding: const EdgeInsets.symmetric(vertical: AppTheme.space3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _iconBox(
            36,
            AppTheme.gray100,
            Icons.verified_rounded,
            iconColor: AppTheme.gray500,
          ),
          const SizedBox(width: AppTheme.space3),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        session.document?.poTransporter ??
                            session.scanCode ??
                            'Sesi #${session.id}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.robotoMono(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: AppTheme.foreground,
                        ),
                      ),
                    ),
                    const SizedBox(width: AppTheme.space2),
                    AppBadge(
                      text: ValidationStatus.label(session.status),
                      variant: session.isRunning
                          ? AppBadgeVariant.primary
                          : session.status == 'COMPLETED'
                          ? AppBadgeVariant.success
                          : AppBadgeVariant.gray,
                    ),
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  '${session.validatedCount}/${session.items.length} item'
                  '${session.validatorName != null ? ' • ${session.validatorName}' : ''}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.roboto(
                    fontSize: 11,
                    color: AppTheme.gray500,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
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
class _StatChip extends StatelessWidget {
  const _StatChip({
    required this.label,
    required this.value,
    required this.dotColor,
  });
  final String label;
  final int value;
  final Color dotColor;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(
      horizontal: AppTheme.space3,
      vertical: 6,
    ),
    decoration: BoxDecoration(
      color: Colors.white.withValues(alpha: 0.08),
      borderRadius: AppTheme.radiusFull,
      border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 6,
          height: 6,
          decoration: BoxDecoration(color: dotColor, shape: BoxShape.circle),
        ),
        const SizedBox(width: 6),
        Text(
          label,
          style: GoogleFonts.roboto(fontSize: 11, color: AppTheme.gray300),
        ),
        const SizedBox(width: 6),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.15),
            borderRadius: AppTheme.radiusFull,
          ),
          child: Text(
            '$value',
            style: GoogleFonts.roboto(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: Colors.white,
            ),
          ),
        ),
      ],
    ),
  );
}

/// Bottom sheet for validating one line: actual qty, condition, expiry,
/// optional product barcode / notes / stack measurements.
///
/// The sheet writes through [ValidationProvider] directly and pops `true`
/// when the line was saved, so the caller can refresh its own state.
class _ItemValidationSheet extends StatefulWidget {
  const _ItemValidationSheet({required this.item});
  final SjValidationItem item;

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
  String _condition = 'FISIK_BAGUS';
  DateTime? _expiredDate;
  bool _saving = false;
  String? _error;

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
  }

  @override
  void dispose() {
    _qtyController.dispose();
    _barcodeController.dispose();
    _notesController.dispose();
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
                    padding: const EdgeInsets.only(top: AppTheme.space2),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Icon(
                          Icons.photo_camera_rounded,
                          size: 16,
                          color: AppTheme.warningText,
                        ),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            'Kondisi ini wajib foto — aplikasi mobile belum mendukung upload foto. Lanjutkan di web bila server menolak.',
                            style: GoogleFonts.roboto(
                              fontSize: 11.5,
                              height: 1.4,
                              color: AppTheme.warningText,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                const SizedBox(height: AppTheme.space3),
                // Rarely needed on a fast pass — tucked away so the common
                // case stays: qty → kondisi → simpan.
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
                      controller: TextEditingController(
                        text: _expiredDate == null
                            ? ''
                            : '${_expiredDate!.day.toString().padLeft(2, '0')}/'
                                  '${_expiredDate!.month.toString().padLeft(2, '0')}/'
                                  '${_expiredDate!.year}',
                      ),
                      label: 'Tanggal expired',
                      hint: 'Pilih tanggal',
                      prefixIcon: Icons.calendar_today_rounded,
                      enabled: false,
                    ),
                    const SizedBox(height: AppTheme.space2),
                    AppSecondaryButton(
                      text: _expiredDate == null
                          ? 'Pilih tanggal'
                          : 'Ubah tanggal',
                      height: 44,
                      leadingIcon: Icons.event_rounded,
                      onPressed: _pickDate,
                    ),
                    const SizedBox(height: AppTheme.space3),
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
                  onPressed: _saving ? null : _save,
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

  Future<void> _pickDate() async {
    var picked = await showDatePicker(
      context: context,
      initialDate: _expiredDate ?? DateTime.now().add(const Duration(days: 30)),
      firstDate: DateTime(2000),
      lastDate: DateTime(2100),
    );
    if (picked != null && mounted) {
      setState(() => _expiredDate = picked);
    }
  }

  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false)) {
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
