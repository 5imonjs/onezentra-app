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
/// Gate IN / OUT, verify the document, and browse the gate history.
///
/// Mirrors the web app's `/gate` screen, adapted for a phone: the scan input
/// accepts manual typing or the camera barcode scanner, and everything else —
/// stats, quick scan, action rules per status, permission warnings, paginated
/// history — matches the web behaviour.
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
  final _searchController = TextEditingController();

  /// PO of the last successful Gate IN in this visit — offered as a
  /// one-tap handoff into Validasi SJ so the operator never retypes it.
  String? _justCheckedInPo;

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
          context.read<AuthProvider>().user?.hasPermission('gate.view') ??
          false;
      _provider.bootstrap(canView: canView);
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
  Widget build(BuildContext context) => ChangeNotifierProvider<GateProvider>.value(
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
            onPressed: canView && !gate.isLoading
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
                child: SingleChildScrollView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.all(AppTheme.space4),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _buildHeader(gate),
                      const SizedBox(height: AppTheme.space4),
                      _buildQuickScan(
                        gate,
                        canCreate: canCreate,
                        canVerify: canVerify,
                      ),
                      const SizedBox(height: AppTheme.space4),
                      _buildHistory(gate),
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
    );

  // ---------------------------------------------------------------------
  // Dark header with the stats
  // ---------------------------------------------------------------------

  Widget _buildHeader(GateProvider gate) => Container(
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
                  Icons.door_front_door_rounded,
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
                      'Check In Point',
                      style: GoogleFonts.roboto(
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                        color: Colors.white,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Scan PO / Nopol — IN ↔ OUT • auto status',
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
                value: gate.stats.hariIni,
                dotColor: Colors.white,
              ),
              _StatChip(
                label: 'Terjadwal',
                value: gate.stats.terjadwal,
                dotColor: AppTheme.info,
              ),
              _StatChip(
                label: 'Selesai',
                value: gate.stats.selesai,
                dotColor: AppTheme.success,
              ),
              _StatChip(
                label: 'Total',
                value: gate.stats.total,
                dotColor: AppTheme.gray300,
              ),
            ],
          ),
        ],
      ),
    );

  // ---------------------------------------------------------------------
  // Quick scan + lookup result + action banner
  // ---------------------------------------------------------------------

  Widget _buildQuickScan(
    GateProvider gate, {
    required bool canCreate,
    required bool canVerify,
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
                      'Quick Scan',
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
                    onPressed: gate.lookupBusy ? null : _openScanner,
                    icon: const Icon(Icons.photo_camera_rounded),
                  ),
                  textInputAction: TextInputAction.done,
                  onEditingComplete: _submitScan,
                ),
              ),
              const SizedBox(width: AppTheme.space3),
              // Natural width: a fixed 104px box overflows on narrow
              // screens once the label outgrows the leftover space.
              AppPrimaryButton(
                text: 'Cari',
                height: 48,
                isFullWidth: false,
                isLoading: gate.lookupBusy,
                onPressed: gate.lookupBusy ? null : _submitScan,
              ),
            ],
          ),
          if (gate.message != null) _buildBanner(gate.message!),
          if (_justCheckedInPo != null)
            _buildHandoffCard(_justCheckedInPo!),
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
            message.success
                ? Icons.check_circle_rounded
                : Icons.error_rounded,
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
                onPressed: gate.actionBusy ? null : gate.clearFound,
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
                child: _darkField('No. Polisi', rk.nopol ?? '-', highlight: true),
              ),
            ],
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
                    foreground: AppTheme.gray900,
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
            // Gate OUT lives in the dedicated Check Out Point menu — Check
            // In Point only records IN and verifies, so one action never
            // hides in two places.
            _guideBox(
              'Dokumen selesai. Catat Gate OUT dari menu Check Out Point.',
            ),
        ],
      ),
    );
  }

  Widget _darkField(String label, String value, {bool highlight = false}) => Container(
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
          const Icon(Icons.info_outline_rounded, size: 16, color: AppTheme.gray400),
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
    bool outline = false,
    bool loading = false,
  }) => Container(
      width: double.infinity,
      height: 44,
      decoration: outline
          ? BoxDecoration(
              border: Border.all(color: Colors.white.withValues(alpha: 0.4)),
              borderRadius: AppTheme.radiusLg,
            )
          : null,
      child: FilledButton(
        onPressed: onPressed,
        style: FilledButton.styleFrom(
          backgroundColor: background,
          foregroundColor: foreground,
          disabledBackgroundColor: background.withValues(alpha: 0.6),
          padding: const EdgeInsets.symmetric(horizontal: AppTheme.space4),
          shape: const RoundedRectangleBorder(
            borderRadius: AppTheme.radiusLg,
          ),
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
        _justCheckedInPo =
            checkedInPo != null && checkedInPo.isNotEmpty ? checkedInPo : null;
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
      title: 'Catat Gate OUT?',
      confirm: 'Ya, Catat OUT',
      note: 'Gate OUT tercatat → status dokumen menjadi Selesai.',
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
    return gate.recordGateOut();
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

  // ---------------------------------------------------------------------
  // History
  // ---------------------------------------------------------------------

  Widget _buildHistory(GateProvider gate) => AppCard(
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
                      'Riwayat Gate',
                      style: GoogleFonts.roboto(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: AppTheme.foreground,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${gate.total} transaksi tercatat',
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
            hint: 'Cari nopol / PO / driver...',
            prefixIcon: Icons.search_rounded,
            onChanged: gate.setSearch,
          ),
          const SizedBox(height: AppTheme.space3),
          ..._historyBody(gate),
        ],
      ),
    );

  List<Widget> _historyBody(GateProvider gate) {
    var listError = gate.listError;
    if (listError != null) {
      return [
        SizedBox(
          width: double.infinity,
          child: AppErrorDisplay(message: listError, onRetry: gate.loadItems),
        ),
      ];
    }

    if (gate.isLoading && gate.items.isEmpty) {
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

    if (gate.items.isEmpty) {
      return [
        SizedBox(
          width: double.infinity,
          child: AppEmptyState(
            icon: Icons.door_front_door_rounded,
            title: gate.search.isNotEmpty
                ? 'Tidak ada hasil'
                : 'Belum ada transaksi gate',
            subtitle: gate.search.isNotEmpty
                ? 'Cari dengan kata kunci lain.'
                : 'Transaksi muncul setelah Gate IN / OUT pertama tercatat.',
          ),
        ),
      ];
    }

    var items = gate.items;
    return [
      Column(
        children: [
          for (var i = 0; i < items.length; i++) ...[
            _historyTile(items[i]),
            if (i != items.length - 1)
              const Divider(height: 1, color: AppTheme.gray100, indent: 46),
          ],
        ],
      ),
      if (gate.lastPage > 1)
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
                      isLoading: gate.isLoading,
                      onPressed: gate.canGoBack && !gate.isLoading
                          ? () => gate.goToPage(gate.currentPage - 1)
                          : null,
                    ),
                  ),
                  const SizedBox(width: AppTheme.space2),
                  Text(
                    'Halaman ${gate.currentPage}/${gate.lastPage}',
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
                      isLoading: gate.isLoading,
                      onPressed: gate.canGoForward && !gate.isLoading
                          ? () => gate.goToPage(gate.currentPage + 1)
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

  Widget _historyTile(GateTransaction item) {
    var rk = item.rencanaKirim;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppTheme.space3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _iconBox(
            36,
            AppTheme.gray100,
            Icons.local_shipping_rounded,
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
                        item.poTransporter ?? rk?.poTransporter ?? '-',
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
                      text: item.gateType,
                      variant: item.gateType == 'OUTBOUND'
                          ? AppBadgeVariant.primary
                          : AppBadgeVariant.info,
                    ),
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  '${item.nopol ?? '-'} • ${item.driverName ?? '-'}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.roboto(
                    fontSize: 11,
                    color: AppTheme.gray500,
                  ),
                ),
                const SizedBox(height: 6),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        _formatDateTime(item.scanTime),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.robotoMono(
                          fontSize: 11,
                          color: AppTheme.gray400,
                        ),
                      ),
                    ),
                    const SizedBox(width: AppTheme.space2),
                    AppBadge(
                      text: GateStatus.label(item.documentStatus),
                      variant: _statusVariant(item.documentStatus),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

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

  static String _formatDateTime(DateTime? time) {
    if (time == null) {
      return '—';
    }
    String two(int value) => value.toString().padLeft(2, '0');
    return '${two(time.day)}/${two(time.month)}/${time.year} '
        '${two(time.hour)}:${two(time.minute)}:${two(time.second)}';
  }

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

/// Small counter chip in the dark header.
class _StatChip extends StatelessWidget {

  const _StatChip({
    required this.label, required this.value, required this.dotColor,
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
