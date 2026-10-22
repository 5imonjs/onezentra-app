import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

import 'package:onezentra_mobile/core/theme/app_theme.dart';
import 'package:onezentra_mobile/features/auth/providers/auth_provider.dart';
import 'package:onezentra_mobile/features/gate/models/gate_models.dart';
import 'package:onezentra_mobile/features/gate/pages/gate_scanner_page.dart';
import 'package:onezentra_mobile/features/gate/providers/gate_provider.dart';
import 'package:onezentra_mobile/features/gate/repositories/gate_repository.dart';
import 'package:onezentra_mobile/shared/widgets/app_widgets.dart';

/// Check In Point (Gate) — lookup a rencana kirim by PO / Nopol, record
/// Gate IN, and verify the document.
///
/// Mirrors the web app's `/gate` screen, adapted for a phone: the scan input
/// accepts manual typing or the camera barcode scanner. Gate history lives on
/// its own `/gate/riwayat` page, reachable from the home menu.
class GatePage extends StatefulWidget {
  const GatePage({super.key, this.repository, this.openScanner});

  /// Injectable so tests can run the screen against a fake repository.
  final GateRepository? repository;

  /// Opens the barcode scanner and resolves with the scanned code (null when
  /// the user backs out). Defaults to pushing [GateScannerPage]; tests inject
  /// a fake so no camera is ever started.
  final Future<String?> Function()? openScanner;

  @override
  State<GatePage> createState() => _GatePageState();
}

class _GatePageState extends State<GatePage> {
  late final GateProvider _provider = GateProvider(
    repository: widget.repository,
  );
  final _scanController = TextEditingController();

  /// PO of the last successful Gate IN in this visit — offered as a
  /// one-tap handoff into Validasi SJ so the operator never retypes it.
  String? _justCheckedInPo;

  @override
  void initState() {
    super.initState();
    // Deferred so `context.read` runs after the first frame, when the
    // inherited AuthProvider is guaranteed to be available.
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted) {
        return;
      }
      var canView =
          context.read<AuthProvider>().user?.hasPermission('gate.view') ??
          false;
      // Halaman ini hanya Scan: cukup statistik header, riwayat dimuat di
      // halaman Riwayat Gate tersendiri.
      if (canView) {
        await _provider.loadStats();
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
      ChangeNotifierProvider<GateProvider>.value(
        value: _provider,
        child: Builder(builder: _buildPage),
      );

  Widget _buildPage(BuildContext context) {
    var user = context.watch<AuthProvider>().user;
    var canView = user?.hasPermission('gate.view') ?? false;
    var canCreate = user?.hasPermission('gate.create') ?? false;
    var canVerify = user?.hasPermission('rencana_kirim.edit') ?? false;
    var gate = context.watch<GateProvider>();

    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        title: const Text('Check In Point'),
        elevation: 0,
        actions: [
          IconButton(
            onPressed: canView && !gate.isLoading && !gate.isLoadingStats
                ? () => gate.refresh()
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
                onRefresh: gate.refresh,
                color: AppTheme.primary600,
                child: LayoutBuilder(
                  builder: (context, constraints) {
                    var isWide = constraints.maxWidth >= 820;
                    var horizontalPadding = constraints.maxWidth >= 900
                        ? AppTheme.space8
                        : constraints.maxWidth >= 600
                        ? AppTheme.space6
                        : AppTheme.space4;

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
                              _buildHeader(gate),
                              SizedBox(
                                height: isWide
                                    ? AppTheme.space5
                                    : AppTheme.space4,
                              ),
                              if (isWide)
                                Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Expanded(
                                      flex: 3,
                                      child: _buildQuickScan(
                                        gate,
                                        canCreate: canCreate,
                                        canVerify: canVerify,
                                      ),
                                    ),
                                    const SizedBox(width: AppTheme.space4),
                                    Expanded(flex: 2, child: _buildGuideCard()),
                                  ],
                                )
                              else
                                _buildQuickScan(
                                  gate,
                                  canCreate: canCreate,
                                  canVerify: canVerify,
                                ),
                              const SizedBox(height: AppTheme.space8),
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
                      'Anda tidak memiliki izin untuk melihat Check In Point.',
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

  Widget _buildHeader(GateProvider gate) {
    var stats = [
      AppStatTile(
        label: 'Hari ini',
        value: gate.stats.hariIni,
        dotColor: Colors.white,
      ),
      AppStatTile(
        label: 'Terjadwal',
        value: gate.stats.terjadwal,
        dotColor: AppTheme.info,
      ),
      AppStatTile(
        label: 'Selesai',
        value: gate.stats.selesai,
        dotColor: AppTheme.success,
      ),
      AppStatTile(
        label: 'Total',
        value: gate.stats.total,
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
                  Icons.door_front_door_rounded,
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
                      'Check In Point',
                      style: GoogleFonts.roboto(
                        fontSize: 18,
                        height: 1.2,
                        fontWeight: FontWeight.w700,
                        color: Colors.white,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Scan PO / Nopol — catat Gate IN • status otomatis',
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
              if (constraints.maxWidth < 440) {
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
        ],
      ),
    );
  }

  // ---------------------------------------------------------------------
  // Quick scan + lookup result + action banner
  // ---------------------------------------------------------------------

  Widget _buildQuickScan(
    GateProvider gate, {
    required bool canCreate,
    required bool canVerify,
  }) => AppCard(
    key: const ValueKey('gate-quick-scan'),
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
                    'Quick Scan',
                    style: GoogleFonts.roboto(
                      fontSize: 15,
                      height: 1.25,
                      fontWeight: FontWeight.w700,
                      color: AppTheme.foreground,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    'Scan barcode atau ketik PO / Nopol, lalu Enter',
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
            var stacked = constraints.maxWidth < 380;
            var field = AppTextField(
              controller: _scanController,
              hint: 'PO / Nopol...',
              prefixIcon: Icons.qr_code_scanner_rounded,
              suffixIcon: IconButton(
                tooltip: 'Pindai dengan kamera',
                onPressed: gate.lookupBusy ? null : _openScanner,
                icon: const Icon(Icons.photo_camera_rounded),
              ),
              textInputAction: TextInputAction.done,
              onEditingComplete: _submitScan,
            );
            var searchButton = AppPrimaryButton(
              text: 'Cari',
              height: 48,
              isFullWidth: stacked,
              leadingIcon: Icons.search_rounded,
              isLoading: gate.lookupBusy,
              onPressed: gate.lookupBusy ? null : _submitScan,
            );

            if (stacked) {
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  field,
                  const SizedBox(height: AppTheme.space3),
                  searchButton,
                ],
              );
            }

            return Row(
              children: [
                Expanded(child: field),
                const SizedBox(width: AppTheme.space3),
                searchButton,
              ],
            );
          },
        ),
        if (gate.message != null) _buildBanner(gate.message!),
        if (_justCheckedInPo != null) _buildHandoffCard(_justCheckedInPo!),
        if (gate.found != null)
          _buildFoundCard(
            gate.found!,
            gate: gate,
            canCreate: canCreate,
            canVerify: canVerify,
          ),
      ],
    ),
  );

  Future<void> _submitScan() async {
    FocusScope.of(context).unfocus();
    setState(() => _justCheckedInPo = null);
    // Uses the state field, not `context.read`: this State's context sits
    // above the ChangeNotifierProvider that owns the GateProvider.
    await _provider.lookup(_scanController.text);
  }

  /// Opens the camera scanner and, when a code is read, fills the scan field
  /// and looks it up immediately.
  Future<void> _openScanner() async {
    var injected = widget.openScanner;
    var code = await (injected != null
        ? injected()
        : Navigator.of(context).push<String>(
            MaterialPageRoute(builder: (_) => const GateScannerPage()),
          ));
    if (!mounted || code == null || code.isEmpty) {
      return;
    }
    setState(() => _justCheckedInPo = null);
    _scanController.text = code;
    await _provider.lookup(code);
  }

  /// One-tap handoff into Validasi SJ carrying the checked-in PO, so the
  /// operator skips the second scan entirely.
  Widget _buildHandoffCard(String po) => Container(
    width: double.infinity,
    margin: const EdgeInsets.only(top: AppTheme.space4),
    child: AppPrimaryButton(
      text: 'Lanjut validasi $po',
      trailingIcon: Icons.arrow_forward_rounded,
      onPressed: () => context.push('/validasi-sj', extra: po),
    ),
  );

  Widget _buildBanner(GateActionMessage message) => Container(
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

  Widget _buildFoundCard(
    RencanaKirim rk, {
    required GateProvider gate,
    required bool canCreate,
    required bool canVerify,
  }) {
    var action = GateStatus.actionFor(rk.status);

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
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'DOKUMEN DITEMUKAN',
                      style: GoogleFonts.roboto(
                        fontSize: 10,
                        height: 1.3,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.8,
                        color: AppTheme.gray400,
                      ),
                    ),
                    const SizedBox(height: AppTheme.space2),
                    AppBadge(
                      text: GateStatus.label(rk.status),
                      variant: _statusVariant(rk.status),
                    ),
                  ],
                ),
              ),
              IconButton(
                onPressed: gate.actionBusy ? null : gate.clearFound,
                tooltip: 'Tutup',
                visualDensity: VisualDensity.compact,
                constraints: const BoxConstraints(minWidth: 40, minHeight: 40),
                padding: EdgeInsets.zero,
                icon: Icon(
                  Icons.close_rounded,
                  size: 18,
                  color: Colors.white.withValues(alpha: 0.6),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppTheme.space3),
          LayoutBuilder(
            builder: (context, constraints) {
              var poField = _darkField(
                'PO Transporter',
                rk.poTransporter ?? '-',
              );
              var nopolField = _darkField(
                'No. Polisi',
                rk.nopol ?? '-',
                highlight: true,
              );

              if (constraints.maxWidth < 380) {
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    poField,
                    const SizedBox(height: AppTheme.space2),
                    nopolField,
                  ],
                );
              }

              return Row(
                children: [
                  Expanded(child: poField),
                  const SizedBox(width: AppTheme.space3),
                  Expanded(child: nopolField),
                ],
              );
            },
          ),
          const SizedBox(height: AppTheme.space3),
          _darkField(
            'Driver • Item',
            '${rk.driverName ?? '-'} • ${rk.itemCount ?? 0} item',
          ),
          const SizedBox(height: AppTheme.space4),
          if (action == GateStatusAction.none)
            _guideBox(GateStatus.guide(rk.status))
          else if (action == GateStatusAction.gateIn)
            canCreate
                ? _darkActionButton(
                    label: 'Gate IN →',
                    background: Colors.white,
                    foreground: AppTheme.ink900,
                    loading: gate.actionBusy,
                    onPressed: () => _confirmAction(action),
                  )
                : _warningBox(
                    'Anda tidak memiliki izin gate.create untuk mencatat Gate IN.',
                  )
          else if (action == GateStatusAction.verify)
            canVerify
                ? _darkActionButton(
                    label: 'Verifikasi ✓',
                    background: AppTheme.success,
                    foreground: Colors.white,
                    loading: gate.actionBusy,
                    onPressed: () => _confirmAction(action),
                  )
                : _warningBox(
                    'Anda tidak memiliki izin rencana_kirim.edit untuk memverifikasi dokumen.',
                  )
          else
            // Receiving-only: a finished document has no further gate
            // action; the flow ends here.
            _guideBox('Dokumen selesai. Tidak ada aksi gate tersisa.'),
        ],
      ),
    );
  }

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
                color: highlight
                    ? AppTheme.primary950.withValues(alpha: 0.65)
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
                color: highlight ? AppTheme.primary950 : Colors.white,
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

  Widget _warningBox(String warning) => Container(
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

  Widget _darkActionButton({
    required String label,
    required Color background,
    required Color foreground,
    required VoidCallback onPressed,
    bool loading = false,
  }) => SizedBox(
    width: double.infinity,
    child: FilledButton(
      onPressed: onPressed,
      style: FilledButton.styleFrom(
        backgroundColor: background,
        foregroundColor: foreground,
        disabledBackgroundColor: background.withValues(alpha: 0.6),
        minimumSize: const Size(0, 44),
        padding: const EdgeInsets.symmetric(horizontal: AppTheme.space4),
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

  // ---------------------------------------------------------------------
  // Confirmation dialog
  // ---------------------------------------------------------------------

  Future<void> _confirmAction(GateStatusAction action) async {
    var gate = _provider;
    var rk = gate.found;
    if (rk == null || gate.actionBusy) {
      return;
    }

    var copy = _actionCopy(action);
    var confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: AppTheme.surfaceCard,
        insetPadding: const EdgeInsets.symmetric(
          horizontal: AppTheme.space4,
          vertical: AppTheme.space6,
        ),
        scrollable: true,
        title: Text(
          copy.title,
          style: GoogleFonts.roboto(fontSize: 16, fontWeight: FontWeight.w700),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _dialogRow('PO Transporter', rk.poTransporter ?? '-'),
            _dialogRow('No. Polisi', rk.nopol ?? '-'),
            _dialogRow('Driver', rk.driverName ?? '-'),
            _dialogRow('Status', GateStatus.label(rk.status)),
            const SizedBox(height: AppTheme.space3),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(AppTheme.space3),
              decoration: const BoxDecoration(
                color: AppTheme.infoWell,
                borderRadius: AppTheme.radiusMd,
              ),
              child: Text(
                copy.note,
                style: GoogleFonts.roboto(
                  fontSize: 12,
                  height: 1.4,
                  color: AppTheme.infoText,
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
              backgroundColor: AppTheme.primary600,
              foregroundColor: Colors.white,
              textStyle: GoogleFonts.roboto(
                fontSize: 13,
                fontWeight: FontWeight.w700,
              ),
            ),
            child: Text(copy.confirm),
          ),
        ],
      ),
    );

    if (confirmed != true || !mounted) {
      return;
    }

    // Captured before the action: a successful record clears the found
    // document, and Gate IN hands its PO to Validasi SJ.
    var checkedInPo = action == GateStatusAction.gateIn
        ? gate.found?.poTransporter
        : null;
    var success = await _executeAction(action, gate);
    if (success && mounted) {
      _scanController.clear();
      setState(() {
        _justCheckedInPo = checkedInPo != null && checkedInPo.isNotEmpty
            ? checkedInPo
            : null;
      });
    }
  }

  ({String title, String confirm, String note}) _actionCopy(
    GateStatusAction action,
  ) {
    if (action == GateStatusAction.gateIn) {
      return (
        title: 'Catat Gate IN?',
        confirm: 'Ya, Catat IN',
        note: 'Gate IN tercatat → status dokumen menjadi Check In.',
      );
    }
    if (action == GateStatusAction.verify) {
      return (
        title: 'Verifikasi Dokumen?',
        confirm: 'Ya, Verifikasi',
        note: 'Verifikasi → status dokumen menjadi Terverifikasi.',
      );
    }
    return (
      title: 'Tidak Ada Aksi?',
      confirm: 'Tutup',
      note: 'Dokumen selesai. Tidak ada aksi gate tersisa.',
    );
  }

  Future<bool> _executeAction(
    GateStatusAction action,
    GateProvider gate,
  ) async {
    if (action == GateStatusAction.gateIn) {
      return gate.recordGateIn();
    }
    if (action == GateStatusAction.verify) {
      return gate.verifyFound();
    }
    return false;
  }

  Widget _dialogRow(String label, String value) => Padding(
    padding: const EdgeInsets.only(bottom: AppTheme.space2),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: GoogleFonts.roboto(fontSize: 11.5, color: AppTheme.gray500),
        ),
        const SizedBox(height: 2),
        Text(
          value,
          style: GoogleFonts.roboto(
            fontSize: 12.5,
            fontWeight: FontWeight.w600,
            color: AppTheme.gray800,
          ),
        ),
      ],
    ),
  );

  static AppBadgeVariant _statusVariant(String status) => switch (status) {
    'SCHEDULED' => AppBadgeVariant.info,
    'CHECKED_IN' => AppBadgeVariant.primary,
    'VERIFIED' => AppBadgeVariant.success,
    'IN_PROGRESS' => AppBadgeVariant.warning,
    'COMPLETED' => AppBadgeVariant.success,
    'CANCELLED' => AppBadgeVariant.danger,
    _ => AppBadgeVariant.gray,
  };

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

  /// Wide layouts have room for a short explanation of the gate flow in the
  /// secondary rail. Phones stay focused on the scan action.
  Widget _buildGuideCard() => AppCard(
    key: const ValueKey('gate-guide-card'),
    padding: const EdgeInsets.all(AppTheme.space5),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            _iconBox(
              38,
              AppTheme.infoWell,
              Icons.route_rounded,
              iconColor: AppTheme.infoText,
            ),
            const SizedBox(width: AppTheme.space3),
            Expanded(
              child: Text(
                'Alur Gate',
                style: GoogleFonts.roboto(
                  fontSize: 15,
                  height: 1.25,
                  fontWeight: FontWeight.w700,
                  color: AppTheme.foreground,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: AppTheme.space4),
        _guideStep('1', 'Scan dokumen', 'Cari berdasarkan PO atau nopol.'),
        const SizedBox(height: AppTheme.space3),
        _guideStep(
          '2',
          'Catat Gate IN',
          'Dokumen terjadwal bisa langsung check in.',
        ),
        const SizedBox(height: AppTheme.space3),
        _guideStep(
          '3',
          'Verifikasi',
          'Lanjutkan validasi SJ setelah check in.',
        ),
      ],
    ),
  );

  Widget _guideStep(String number, String title, String description) => Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Container(
        width: 24,
        height: 24,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.08),
          shape: BoxShape.circle,
        ),
        child: Text(
          number,
          style: GoogleFonts.roboto(
            fontSize: 11,
            fontWeight: FontWeight.w700,
            color: AppTheme.gray200,
          ),
        ),
      ),
      const SizedBox(width: AppTheme.space2),
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              title,
              style: GoogleFonts.roboto(
                fontSize: 12.5,
                height: 1.3,
                fontWeight: FontWeight.w700,
                color: AppTheme.foreground,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              description,
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
  );
}
