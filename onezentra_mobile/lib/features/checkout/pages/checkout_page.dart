import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

import 'package:onezentra_mobile/core/theme/app_theme.dart';
import 'package:onezentra_mobile/features/auth/providers/auth_provider.dart';
import 'package:onezentra_mobile/features/checkout/providers/checkout_provider.dart';
import 'package:onezentra_mobile/features/gate/models/gate_models.dart';
import 'package:onezentra_mobile/features/gate/pages/gate_scanner_page.dart';
import 'package:onezentra_mobile/features/gate/repositories/gate_repository.dart';
import 'package:onezentra_mobile/shared/widgets/app_widgets.dart';

/// Check Out Point — scan a finished document's PO barcode and record its
/// Gate OUT.
///
/// Documents that are not finished yet get an explanation instead of the
/// action button; the same status rules as the gate apply.
class CheckoutPage extends StatefulWidget {
  const CheckoutPage({
    super.key,
    this.repository,
    this.openScanner,
    this.initialScanCode,
  });

  /// Injectable so tests can run the screen against a fake repository.
  final GateRepository? repository;

  /// Opens the barcode scanner and resolves with the scanned code (null when
  /// the user backs out). Defaults to pushing [GateScannerPage]; tests inject
  /// a fake so no camera is ever started.
  final Future<String?> Function()? openScanner;

  /// PO barcode to look up immediately (e.g. handed off from Bongkar).
  /// The lookup runs automatically once, right after the first frame.
  final String? initialScanCode;

  @override
  State<CheckoutPage> createState() => _CheckoutPageState();
}

class _CheckoutPageState extends State<CheckoutPage> {
  late final CheckoutProvider _provider = CheckoutProvider(
    repository: widget.repository,
  );
  final _scanController = TextEditingController();
  bool _autoLookedUp = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) {
        return;
      }
      var handoff = widget.initialScanCode?.trim();
      if (!_autoLookedUp && handoff != null && handoff.isNotEmpty) {
        _autoLookedUp = true;
        _scanController.text = handoff;
        _provider.lookup(handoff);
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
      ChangeNotifierProvider<CheckoutProvider>.value(
        value: _provider,
        child: Builder(builder: _buildPage),
      );

  Widget _buildPage(BuildContext context) {
    var user = context.watch<AuthProvider>().user;
    var canView = user?.hasPermission('gate.view') ?? false;
    var canCreate = user?.hasPermission('gate.create') ?? false;
    var checkout = context.watch<CheckoutProvider>();

    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(title: const Text('Check Out Point'), elevation: 0),
      body: SafeArea(
        child: !canView
            ? _buildNoAccess()
            : SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(AppTheme.space4),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _buildHeader(),
                    const SizedBox(height: AppTheme.space4),
                    _buildScanCard(checkout, canCreate: canCreate),
                    const SizedBox(height: AppTheme.space8),
                  ],
                ),
              ),
      ),
    );
  }

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
              'Anda tidak memiliki izin untuk melihat Check Out Point.',
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

  Widget _buildHeader() => Container(
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
    child: Row(
      children: [
        Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.1),
            borderRadius: AppTheme.radiusLg,
          ),
          child: const Icon(
            Icons.output_rounded,
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
                'Check Out Point',
                style: GoogleFonts.roboto(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                'Hanya dokumen selesai yang bisa check out',
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
  );

  Widget _buildScanCard(
    CheckoutProvider checkout, {
    required bool canCreate,
  }) => AppCard(
    padding: const EdgeInsets.all(AppTheme.space5),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: AppTheme.gray900,
                borderRadius: AppTheme.radiusLg,
              ),
              child: const Icon(
                Icons.qr_code_scanner_rounded,
                color: Colors.white,
                size: 18,
              ),
            ),
            const SizedBox(width: AppTheme.space3),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Scan Dokumen Selesai',
                    style: GoogleFonts.roboto(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: AppTheme.foreground,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'Scan barcode atau ketik PO / Nopol, lalu Enter',
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
                hint: 'PO / Nopol...',
                prefixIcon: Icons.qr_code_scanner_rounded,
                suffixIcon: IconButton(
                  tooltip: 'Pindai dengan kamera',
                  onPressed: checkout.lookupBusy ? null : _openScanner,
                  icon: const Icon(Icons.photo_camera_rounded),
                ),
                textInputAction: TextInputAction.done,
                onEditingComplete: _submitScan,
              ),
            ),
            const SizedBox(width: AppTheme.space3),
            AppPrimaryButton(
              text: 'Cari',
              height: 48,
              isFullWidth: false,
              isLoading: checkout.lookupBusy,
              onPressed: checkout.lookupBusy ? null : _submitScan,
            ),
          ],
        ),
        if (checkout.message != null) _buildBanner(checkout.message!),
        if (checkout.found != null)
          _buildFoundCard(
            checkout.found!,
            checkout: checkout,
            canCreate: canCreate,
          ),
      ],
    ),
  );

  Future<void> _submitScan() async {
    FocusScope.of(context).unfocus();
    // Uses the state field, not `context.read`: this State's context sits
    // above the ChangeNotifierProvider that owns the CheckoutProvider.
    // No clearFound() needed: CheckoutProvider.lookup already drops _found on
    // both the ApiException and generic catch paths, so a failed search can
    // never leave the previous document's card on screen.
    await _provider.lookup(_scanController.text);
  }

  Future<void> _openScanner() async {
    var injected = widget.openScanner;
    var code = await (injected != null
        ? injected()
        : Navigator.of(context).push<String>(
            MaterialPageRoute(
              builder: (_) => const GateScannerPage(
                title: 'Pindai Check Out',
                hint: 'Arahkan kamera ke barcode PO / surat jalan.',
                subtitle: 'Hasil pindai langsung dicari untuk Gate OUT.',
                cameraErrorHint:
                    'Kamera tidak dapat dijalankan. Masukkan PO / Nopol '
                    'secara manual di halaman Check Out Point.',
              ),
            ),
          ));
    if (!mounted || code == null || code.isEmpty) {
      return;
    }
    _scanController.text = code;
    await _provider.lookup(code);
  }

  Widget _buildBanner(GateActionMessage message) => Container(
    margin: const EdgeInsets.only(top: AppTheme.space4),
    padding: const EdgeInsets.all(AppTheme.space3),
    decoration: BoxDecoration(
      color: message.success
          ? AppTheme.successWell
          : const Color(0xFFFFF1F2),
      borderRadius: AppTheme.radiusLg,
      border: Border.all(
        color: message.success
            ? AppTheme.successText
            : const Color(0xFFFECDD3),
      ),
    ),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(
          message.success ? Icons.check_circle_rounded : Icons.error_rounded,
          size: 18,
          color: message.success
              ? AppTheme.success
              : AppTheme.danger,
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

  Widget _buildFoundCard(
    RencanaKirim rk, {
    required CheckoutProvider checkout,
    required bool canCreate,
  }) {
    var canOut = GateStatus.actionFor(rk.status) == GateStatusAction.gateOut;

    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(top: AppTheme.space4),
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
                  'DOKUMEN DITEMUKAN',
                  style: GoogleFonts.roboto(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.8,
                    color: AppTheme.gray400,
                  ),
                ),
              ),
              AppBadge(
                text: GateStatus.label(rk.status),
                variant: _statusVariant(rk.status),
              ),
              IconButton(
                onPressed: checkout.actionBusy ? null : checkout.clearFound,
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
          const SizedBox(height: AppTheme.space2),
          Row(
            children: [
              Expanded(
                child: _darkField(
                  'PO Transporter',
                  rk.poTransporter ?? '-',
                ),
              ),
              const SizedBox(width: AppTheme.space3),
              Expanded(
                child: _darkField(
                  'No. Polisi',
                  rk.nopol ?? '-',
                  highlight: true,
                ),
              ),
            ],
          ),
          const SizedBox(height: AppTheme.space3),
          _darkField(
            'Driver',
            rk.driverName ?? '-',
          ),
          const SizedBox(height: AppTheme.space4),
          if (!canOut)
            _guideBox(
              'Dokumen berstatus ${GateStatus.label(rk.status)} belum bisa '
              'check out. ${GateStatus.guide(rk.status)}',
            )
          else if (canCreate)
            SizedBox(
              width: double.infinity,
              height: 44,
              child: FilledButton(
                onPressed: checkout.actionBusy ? null : _confirmOut,
                style: FilledButton.styleFrom(
                  backgroundColor: Colors.white,
                  foregroundColor: AppTheme.gray900,
                  shape: const RoundedRectangleBorder(
                    borderRadius: AppTheme.radiusLg,
                  ),
                  textStyle: GoogleFonts.roboto(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                child: checkout.actionBusy
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Gate OUT'),
              ),
            )
          else
            _inlineWarning(
              'Anda tidak memiliki izin gate.create untuk mencatat Gate OUT.',
            ),
        ],
      ),
    );
  }

  Future<void> _confirmOut() async {
    var checkout = _provider;
    var rk = checkout.found;
    if (rk == null || checkout.actionBusy) {
      return;
    }

    var confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(
          'Catat Gate OUT?',
          style: GoogleFonts.roboto(fontSize: 16, fontWeight: FontWeight.w700),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _dialogRow('PO Transporter', rk.poTransporter ?? '-'),
            _dialogRow('No. Polisi', rk.nopol ?? '-'),
            _dialogRow('Driver', rk.driverName ?? '-'),
            const SizedBox(height: AppTheme.space3),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(AppTheme.space3),
              decoration: const BoxDecoration(
                color: AppTheme.infoWell,
                borderRadius: AppTheme.radiusMd,
              ),
              child: Text(
                'Gate OUT tercatat → status dokumen menjadi Selesai.',
                style: GoogleFonts.roboto(
                  fontSize: 12,
                  height: 1.4,
                  color: const Color(0xFF1D4ED8),
                ),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text(
              'Batal',
              style: GoogleFonts.roboto(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: AppTheme.gray600,
              ),
            ),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            style: FilledButton.styleFrom(
              backgroundColor: AppTheme.gray900,
              foregroundColor: Colors.white,
              textStyle: GoogleFonts.roboto(
                fontSize: 13,
                fontWeight: FontWeight.w700,
              ),
            ),
            child: const Text('Ya, Catat OUT'),
          ),
        ],
      ),
    );

    if ((confirmed ?? false) && mounted) {
      var success = await checkout.recordOut();
      // `mounted` diperiksa lagi: recordOut adalah request jaringan, dan State
      // bisa sudah dilepas selama menunggu. Memakai TextEditingController yang
      // sudah di-dispose akan melempar.
      if (success && mounted) {
        _scanController.clear();
      }
    }
  }

  Widget _dialogRow(String label, String value) => Padding(
    padding: const EdgeInsets.only(bottom: 6),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 110,
          child: Text(
            label,
            style: GoogleFonts.roboto(fontSize: 12, color: AppTheme.gray500),
          ),
        ),
        Expanded(
          child: Text(
            value,
            style: GoogleFonts.roboto(
              fontSize: 12.5,
              fontWeight: FontWeight.w600,
              color: AppTheme.gray800,
            ),
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
                border: Border.all(
                  color: Colors.white.withValues(alpha: 0.08),
                ),
              ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: GoogleFonts.roboto(
                fontSize: 10,
                fontWeight: FontWeight.w500,
                color: highlight ? AppTheme.gray500 : AppTheme.gray400,
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
                color: highlight ? AppTheme.gray900 : Colors.white,
              ),
            ),
          ],
        ),
      );

  Widget _guideBox(String guide) => Container(
    width: double.infinity,
    padding: const EdgeInsets.all(AppTheme.space3),
    decoration: BoxDecoration(
      color: Colors.white.withValues(alpha: 0.05),
      borderRadius: AppTheme.radiusLg,
      border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
    ),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Icon(
          Icons.info_outline_rounded,
          size: 16,
          color: AppTheme.gray400,
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            guide,
            style: GoogleFonts.roboto(
              fontSize: 12,
              height: 1.4,
              color: AppTheme.gray300,
            ),
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

  static AppBadgeVariant _statusVariant(String status) =>
      switch (status) {
        'SCHEDULED' => AppBadgeVariant.info,
        'CHECKED_IN' => AppBadgeVariant.primary,
        'VERIFIED' => AppBadgeVariant.success,
        'IN_PROGRESS' => AppBadgeVariant.warning,
        'COMPLETED' => AppBadgeVariant.success,
        'CANCELLED' => AppBadgeVariant.danger,
        _ => AppBadgeVariant.gray,
      };
}
