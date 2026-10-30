import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

import 'package:onezentra_mobile/core/theme/app_theme.dart';
import 'package:onezentra_mobile/features/auth/providers/auth_provider.dart';
import 'package:onezentra_mobile/features/gate/pages/gate_scanner_page.dart';
import 'package:onezentra_mobile/features/unload/models/unload_models.dart';
import 'package:onezentra_mobile/features/unload/providers/unload_provider.dart';
import 'package:onezentra_mobile/features/unload/repositories/unload_repository.dart';
import 'package:onezentra_mobile/features/validation/models/validation_models.dart';
import 'package:onezentra_mobile/shared/widgets/app_widgets.dart';

/// Check Out Point — select an active receiving or look it up by exact PO,
/// review it, and confirm completion. Item scanning is optional in this
/// workflow; mobile keeps the field term "bongkar" on the action buttons.
///
/// Only PENDING / IN_PROGRESS records open here; finished ones belong to
/// Riwayat > Penerimaan. The PO lookup demands an exact match (like the web
/// app) so a mistyped barcode can never finish the wrong unloading.
class UnloadPage extends StatefulWidget {
  const UnloadPage({super.key, this.repository, this.openScanner});

  /// Injectable so tests can run the screen against a fake repository.
  final UnloadRepository? repository;

  /// Opens the barcode scanner and resolves with the scanned code (null when
  /// the user backs out). Defaults to pushing [GateScannerPage]; tests inject
  /// a fake so no camera is ever started.
  final Future<String?> Function()? openScanner;

  @override
  State<UnloadPage> createState() => _UnloadPageState();
}

class _UnloadPageState extends State<UnloadPage> {
  late final UnloadProvider _provider = UnloadProvider(
    repository: widget.repository,
  );
  final _scanController = TextEditingController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted) {
        return;
      }
      var canView =
          context.read<AuthProvider>().user?.hasPermission('receiving.view') ??
          false;
      if (canView) {
        await _provider.bootstrap(canView: canView);
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
      ChangeNotifierProvider<UnloadProvider>.value(
        value: _provider,
        child: Builder(builder: _buildPage),
      );

  Widget _buildPage(BuildContext context) {
    var user = context.watch<AuthProvider>().user;
    var canView = user?.hasPermission('receiving.view') ?? false;
    var canEdit = user?.hasPermission('receiving.edit') ?? false;
    var unload = context.watch<UnloadProvider>();

    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        title: const Text('Check Out Point'),
        elevation: 0,
        actions: [
          IconButton(
            onPressed:
                canView && !unload.isLoadingStats && !unload.isLoadingReceivings
                ? () => unload.refresh()
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
                onRefresh: unload.refresh,
                color: AppTheme.primary600,
                child: LayoutBuilder(
                  builder: (context, constraints) {
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
                              _buildCheckoutCard(unload, canEdit: canEdit),
                              const SizedBox(height: AppTheme.space4),
                              _buildReceivingList(unload),
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

  // ---------------------------------------------------------------------
  // PO scan
  // ---------------------------------------------------------------------

  Widget _buildCheckoutCard(
    UnloadProvider unload, {
    required bool canEdit,
  }) => AppCard(
    padding: const EdgeInsets.all(AppTheme.space5),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Konfirmasi Receiving',
          style: GoogleFonts.roboto(
            fontSize: 15,
            fontWeight: FontWeight.w700,
            color: AppTheme.foreground,
          ),
        ),
        const SizedBox(height: AppTheme.space1),
        Text(
          'Pilih receiving aktif dari daftar, atau scan barcode PO transporter.',
          style: GoogleFonts.roboto(
            fontSize: 12,
            height: 1.4,
            color: Theme.of(context).extension<ThemeColors>()?.textMuted ?? AppTheme.gray500,
          ),
        ),
        const SizedBox(height: AppTheme.space4),
        if (unload.active == null) ...[
          LayoutBuilder(
            builder: (context, constraints) {
              var stacked = constraints.maxWidth < 380;
              var field = AppTextField(
                controller: _scanController,
                hint: 'Barcode PO transporter...',
                prefixIcon: Icons.qr_code_scanner_rounded,
                suffixIcon: IconButton(
                  tooltip: 'Scan barcode PO',
                  onPressed: unload.lookupBusy ? null : _openScanner,
                  icon: const Icon(Icons.photo_camera_rounded),
                ),
                textInputAction: TextInputAction.done,
                onEditingComplete: _submitScan,
              );
              var searchButton = AppPrimaryButton(
                text: 'Cari PO',
                height: 48,
                isFullWidth: stacked,
                isLoading: unload.lookupBusy,
                onPressed: unload.lookupBusy ? null : _submitScan,
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
          if (!canEdit) ...[
            const SizedBox(height: AppTheme.space3),
            _inlineWarning(
              'Anda tidak memiliki izin receiving.edit untuk menyelesaikan receiving.',
            ),
          ],
        ] else
          _buildSelectedReceiving(unload.active!, unload, canEdit: canEdit),
        if (unload.message != null) _buildBanner(unload.message!),
      ],
    ),
  );

  Future<void> _submitScan() async {
    FocusScope.of(context).unfocus();
    // Uses the state field, not `context.read`: this State's context sits
    // above the ChangeNotifierProvider that owns the UnloadProvider.
    var code = _scanController.text;
    await _provider.lookup(code);
    if (_provider.active != null) {
      _scanController.clear();
    }
  }

  Future<void> _openScanner() async {
    var injected = widget.openScanner;
    var code = await (injected != null
        ? injected()
        : Navigator.of(context).push<String>(
            MaterialPageRoute(
              builder: (_) => const GateScannerPage(
                title: 'Scan Barcode PO',
                hint: 'Arahkan kamera ke barcode PO transporter.',
                subtitle: 'PO harus cocok persis dengan receiving aktif.',
                cameraErrorHint:
                    'Kamera tidak dapat dijalankan. Masukkan barcode PO '
                    'transporter secara manual.',
              ),
            ),
          ));
    if (!mounted || code == null || code.isEmpty) {
      return;
    }
    _scanController.text = code;
    await _provider.lookup(code);
    if (_provider.active != null) {
      _scanController.clear();
    }
  }

  Widget _buildBanner(UnloadActionMessage message) => Container(
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
              color: Theme.of(context).extension<ThemeColors>()?.textSecondary ?? AppTheme.gray700,
            ),
          ),
        ),
      ],
    ),
  );

  Widget _buildReceivingList(UnloadProvider unload) => AppCard(
    padding: const EdgeInsets.all(AppTheme.space5),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Daftar Receiving',
                    style: GoogleFonts.roboto(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      color: AppTheme.foreground,
                    ),
                  ),
                  const SizedBox(height: AppTheme.space1),
                  Text(
                    '${unload.activeReceivings.length} dari '
                    '${unload.activeTotal} receiving aktif',
                    style: GoogleFonts.roboto(
                      fontSize: 11.5,
                      color: Theme.of(context).extension<ThemeColors>()?.textMuted ?? AppTheme.gray500,
                    ),
                  ),
                ],
              ),
            ),
            IconButton(
              tooltip: 'Muat ulang daftar',
              onPressed: unload.isLoadingReceivings ? null : unload.refresh,
              icon: unload.isLoadingReceivings
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.refresh_rounded),
            ),
          ],
        ),
        if (unload.receivingsError != null) ...[
          const SizedBox(height: AppTheme.space2),
          _inlineWarning(unload.receivingsError!),
        ],
        if (unload.isLoadingReceivings && unload.activeReceivings.isEmpty) ...[
          const SizedBox(height: AppTheme.space4),
          const Center(child: CircularProgressIndicator()),
        ] else if (unload.activeReceivings.isEmpty) ...[
          const SizedBox(height: AppTheme.space3),
          _guideBox(
            'Tidak ada receiving berstatus Menunggu atau Diproses. '
            'Receiving yang sudah selesai dapat dilihat di menu Riwayat.',
          ),
        ] else ...[
          const SizedBox(height: AppTheme.space3),
          for (var i = 0; i < unload.activeReceivings.length; i++) ...[
            _receivingListTile(unload.activeReceivings[i], unload),
            if (i != unload.activeReceivings.length - 1)
              const SizedBox(height: AppTheme.space2),
          ],
        ],
        if (unload.activeLastPage > 1) ...[
          const SizedBox(height: AppTheme.space4),
          const Divider(height: 1, color: AppTheme.gray300),
          const SizedBox(height: AppTheme.space3),
          Row(
            children: [
              Expanded(
                child: AppSecondaryButton(
                  text: 'Sebelumnya',
                  height: 42,
                  isLoading: unload.isLoadingReceivings,
                  onPressed:
                      unload.activePage > 1 && !unload.isLoadingReceivings
                      ? () => unload.goToReceivingPage(unload.activePage - 1)
                      : null,
                ),
              ),
              const SizedBox(width: AppTheme.space2),
              Text(
                '${unload.activePage}/${unload.activeLastPage}',
                style: GoogleFonts.roboto(
                  fontSize: 12,
                  color: Theme.of(context).extension<ThemeColors>()?.textMuted ?? AppTheme.gray500,
                ),
              ),
              const SizedBox(width: AppTheme.space2),
              Expanded(
                child: AppSecondaryButton(
                  text: 'Berikutnya',
                  height: 42,
                  isLoading: unload.isLoadingReceivings,
                  onPressed:
                      unload.activePage < unload.activeLastPage &&
                          !unload.isLoadingReceivings
                      ? () => unload.goToReceivingPage(unload.activePage + 1)
                      : null,
                ),
              ),
            ],
          ),
        ],
      ],
    ),
  );

  Widget _receivingListTile(UnloadSession session, UnloadProvider unload) {
    var selected = unload.active?.id == session.id;
    return InkWell(
      onTap: unload.actionBusy
          ? null
          : () {
              _scanController.clear();
              unload.selectReceiving(session);
            },
      borderRadius: AppTheme.radiusLg,
      child: Container(
        padding: const EdgeInsets.all(AppTheme.space3),
        decoration: BoxDecoration(
          color: selected ? AppTheme.primary950 : AppTheme.surfaceCard,
          borderRadius: AppTheme.radiusLg,
          border: Border.all(
            color: selected ? AppTheme.primary400 : AppTheme.gray300,
          ),
        ),
        child: Row(
          children: [
            const Icon(
              Icons.local_shipping_outlined,
              color: AppTheme.primary600,
            ),
            const SizedBox(width: AppTheme.space3),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    session.poTransporter ?? 'PO tidak tersedia',
                    style: GoogleFonts.roboto(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: AppTheme.foreground,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    '${session.driverName ?? '-'} • ${session.nopol ?? '-'}',
                    style: GoogleFonts.roboto(
                      fontSize: 11.5,
                      color: Theme.of(context).extension<ThemeColors>()?.textMuted ?? AppTheme.gray500,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: AppTheme.space2),
            AppBadge(
              text: _sessionBadge(session.status),
              variant: session.status == 'IN_PROGRESS'
                  ? AppBadgeVariant.primary
                  : AppBadgeVariant.warning,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSelectedReceiving(
    UnloadSession session,
    UnloadProvider unload, {
    required bool canEdit,
  }) {
    var received = session.totalReceivedQty ?? 0;
    var expected = session.totalExpectedQty ?? 0;
    var difference = received - expected;
    var progress = expected <= 0 ? 0.0 : (received / expected).clamp(0.0, 1.0);

    return Container(
      padding: const EdgeInsets.all(AppTheme.space4),
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppTheme.ink900, AppTheme.ink800],
        ),
        borderRadius: AppTheme.radiusXl,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: AppTheme.space2,
            runSpacing: AppTheme.space2,
            children: [
              _darkField('PO Transporter', session.poTransporter ?? '-'),
              _darkField('Driver', session.driverName ?? '-'),
              _darkField('Nopol', session.nopol ?? '-'),
              _darkField('Status', _sessionBadge(session.status)),
            ],
          ),
          const SizedBox(height: AppTheme.space4),
          Row(
            children: [
              Expanded(
                child: Text(
                  'Progres bongkar',
                  style: GoogleFonts.roboto(
                    fontSize: 12,
                    color: Theme.of(context).extension<ThemeColors>()?.textMuted ?? AppTheme.gray400,
                  ),
                ),
              ),
              Text(
                '${_formatQty(received)} / ${_formatQty(expected)}',
                style: GoogleFonts.roboto(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: Colors.white,
                ),
              ),
            ],
          ),
          const SizedBox(height: AppTheme.space2),
          ClipRRect(
            borderRadius: AppTheme.radiusFull,
            child: LinearProgressIndicator(
              value: progress,
              minHeight: 7,
              backgroundColor: Colors.white.withValues(alpha: 0.12),
              valueColor: const AlwaysStoppedAnimation<Color>(AppTheme.success),
            ),
          ),
          if (difference != 0) ...[
            const SizedBox(height: AppTheme.space2),
            Text(
              'Selisih ${_formatQty(difference)}',
              style: GoogleFonts.roboto(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: difference > 0
                    ? AppTheme.warningText
                    : AppTheme.dangerText,
              ),
            ),
          ],
          const SizedBox(height: AppTheme.space4),
          // Checkout completion is a direct confirmation; product scans are
          // optional and must not block this action.
          if (canEdit &&
              (session.status == 'PENDING' || session.status == 'IN_PROGRESS'))
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: unload.actionBusy
                    ? null
                    : () => _confirmComplete(unload),
                style: FilledButton.styleFrom(
                  backgroundColor: AppTheme.success,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(
                    vertical: AppTheme.space3,
                  ),
                ),
                child: unload.actionBusy
                    ? const SizedBox(
                        height: 18,
                        width: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Selesai Bongkar'),
              ),
            )
          else if (!canEdit)
            _inlineWarning(
              'Anda tidak memiliki izin receiving.edit untuk menyelesaikan receiving.',
            ),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton(
              onPressed: unload.actionBusy
                  ? null
                  : () {
                      unload.clearActive();
                      unload.clearMessage();
                    },
              child: const Text('Pilih Lain'),
            ),
          ),
        ],
      ),
    );
  }

  // ---------------------------------------------------------------------
  // Legacy unload session
  // ---------------------------------------------------------------------

  // ignore: unused_element
  Widget _buildActiveCard(
    UnloadSession session, {
    required UnloadProvider unload,
    required bool canEdit,
  }) {
    var received = session.totalReceivedQty ?? 0;
    var expected = session.totalExpectedQty ?? 0;
    var selisih = received - expected;
    var progress = session.plan.isEmpty
        ? 0.0
        : (session.coveredCount / session.plan.length).clamp(0.0, 1.0);

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
                  _sessionHeadline(session),
                  style: GoogleFonts.roboto(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.8,
                    color: Theme.of(context).extension<ThemeColors>()?.textMuted ?? AppTheme.gray400,
                  ),
                ),
              ),
              AppBadge(
                text: _sessionBadge(session.status),
                variant: session.status == 'IN_PROGRESS'
                    ? AppBadgeVariant.primary
                    : session.status == 'COMPLETED'
                    ? AppBadgeVariant.success
                    : session.status == 'CANCELLED'
                    ? AppBadgeVariant.gray
                    : AppBadgeVariant.warning,
              ),
              IconButton(
                onPressed: unload.actionBusy ? null : unload.clearActive,
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
                  session.poTransporter ?? '-',
                ),
              ),
              const SizedBox(width: AppTheme.space3),
              Expanded(
                child: _darkField(
                  'No. Polisi',
                  session.nopol ?? '-',
                  highlight: true,
                ),
              ),
            ],
          ),
          const SizedBox(height: AppTheme.space3),
          Row(
            children: [
              Expanded(
                child: _darkField(
                  'Ekspektasi',
                  _formatQty(session.totalExpectedQty),
                ),
              ),
              const SizedBox(width: AppTheme.space3),
              Expanded(
                child: _darkField(
                  'Diterima',
                  _formatQty(session.totalReceivedQty),
                ),
              ),
              const SizedBox(width: AppTheme.space3),
              Expanded(child: _darkField('Selisih', _formatQty(selisih))),
            ],
          ),
          const SizedBox(height: AppTheme.space3),
          ClipRRect(
            borderRadius: AppTheme.radiusFull,
            child: LinearProgressIndicator(
              value: progress,
              minHeight: 6,
              backgroundColor: Colors.white.withValues(alpha: 0.1),
              valueColor: const AlwaysStoppedAnimation<Color>(AppTheme.success),
            ),
          ),
          const SizedBox(height: AppTheme.space4),
          if (session.status == 'PENDING')
            if (canEdit)
              _darkActionButton(
                label: 'Mulai Bongkar',
                background: Colors.white,
                foreground: AppTheme.gray900,
                loading: unload.actionBusy,
                onPressed: () => unload.startActive(),
              )
            else
              _inlineWarning(
                'Anda tidak memiliki izin receiving.edit untuk memulai bongkar.',
              )
          else if (session.status == 'IN_PROGRESS') ...[
            ...[
              for (var i = 0; i < session.plan.length; i++) ...[
                _planTile(
                  session.plan[i],
                  session,
                  unload: unload,
                  canEdit: canEdit,
                ),
                if (i != session.plan.length - 1)
                  const SizedBox(height: AppTheme.space2),
              ],
            ],
            const SizedBox(height: AppTheme.space4),
            _buildCompleteSection(session, unload, canEdit: canEdit),
            const SizedBox(height: AppTheme.space2),
            _darkActionButton(
              label: 'Batalkan Bongkar',
              background: Colors.transparent,
              foreground: Colors.white,
              outline: true,
              loading: unload.actionBusy,
              onPressed: () => _confirmCancel(unload),
            ),
          ] else ...[
            // COMPLETED / CANCELLED: nothing left to do here — the
            // receiving flow ends with the finished document.
            const SizedBox(height: AppTheme.space4),
            _guideBox(
              'Sesi ${session.status == 'CANCELLED' ? 'dibatalkan' : 'selesai'} — '
              'tidak ada aksi tersisa.',
            ),
          ],
        ],
      ),
    );
  }

  Widget _planTile(
    UnloadPlanLine line,
    UnloadSession session, {
    required UnloadProvider unload,
    required bool canEdit,
  }) {
    var code = (line.kodeBarang ?? '').toLowerCase();
    var scans = session.scanned
        .where((s) => (s.kodeBarang ?? '').toLowerCase() == code)
        .toList();
    var covered = line.kodeBarang != null && scans.isNotEmpty;
    var scannedQty = scans.fold<double>(
      0,
      (sum, s) => sum + (s.actualQty ?? 0),
    );

    return InkWell(
      onTap: !canEdit || unload.actionBusy
          ? null
          : () => _openScanSheet(line, session),
      borderRadius: AppTheme.radiusLg,
      child: Container(
        padding: const EdgeInsets.all(AppTheme.space3),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.07),
          borderRadius: AppTheme.radiusLg,
          border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
        ),
        child: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: covered
                    ? AppTheme.success.withValues(alpha: 0.2)
                    : Colors.white.withValues(alpha: 0.1),
                borderRadius: AppTheme.radiusLg,
              ),
              child: Icon(
                covered
                    ? Icons.check_circle_rounded
                    : Icons.hourglass_empty_rounded,
                size: 18,
                color: covered ? AppTheme.success : AppTheme.gray400,
              ),
            ),
            const SizedBox(width: AppTheme.space3),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    line.namaBarang ?? line.kodeBarang ?? '-',
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
                    covered
                        ? 'Terima ${_formatQty(scannedQty)}'
                              ' / ${_formatQty(line.jumlah)}'
                              '${line.satuan != null ? ' ${line.satuan}' : ''}'
                        : 'Ekspektasi ${_formatQty(line.jumlah)}'
                              '${line.satuan != null ? ' ${line.satuan}' : ''}',
                    style: GoogleFonts.robotoMono(
                      fontSize: 11,
                      color: Theme.of(context).extension<ThemeColors>()?.textMuted ?? AppTheme.gray400,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: AppTheme.space2),
            // Fast path for the common case: the unloaded qty matches the
            // plan, so one tap records it. Anything else opens the sheet.
            if (!covered && canEdit)
              SizedBox(
                height: 40,
                child: FilledButton.icon(
                  onPressed: unload.actionBusy
                      ? null
                      : () => unload.scanLine(
                          kodeBarang: line.kodeBarang ?? '',
                          actualQty: line.jumlah ?? 0,
                          namaBarang: line.namaBarang,
                          satuan: line.satuan,
                          rencanaKirimItemId: line.id,
                        ),
                  style: FilledButton.styleFrom(
                    backgroundColor: AppTheme.success,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(
                      horizontal: AppTheme.space3,
                    ),
                    shape: const RoundedRectangleBorder(
                      borderRadius: AppTheme.radiusLg,
                    ),
                    textStyle: GoogleFonts.roboto(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  icon: const Icon(Icons.check_rounded, size: 16),
                  label: const Text('Sesuai'),
                ),
              )
            else
              AppBadge(
                text: covered ? 'Tercatat' : 'Belum',
                variant: covered
                    ? AppBadgeVariant.success
                    : AppBadgeVariant.gray,
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _openScanSheet(
    UnloadPlanLine line,
    UnloadSession session,
  ) async {
    // The sheet lives on a modal route above this page, so the page-scoped
    // provider is re-exposed explicitly — otherwise `context.read` inside
    // the sheet throws ProviderNotFoundException.
    await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => ChangeNotifierProvider<UnloadProvider>.value(
        value: _provider,
        child: _UnloadScanSheet(line: line, receivingId: session.id),
      ),
    );
  }

  /// Complete section: finishing with zero scans would write an empty
  /// receiving, so the button stays disabled until the first line lands.
  Widget _buildCompleteSection(
    UnloadSession session,
    UnloadProvider unload, {
    required bool canEdit,
  }) {
    if (!canEdit) {
      return _inlineWarning(
        'Anda tidak memiliki izin receiving.edit untuk menyelesaikan bongkar.',
      );
    }
    var empty = session.scanned.isEmpty;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _darkActionButton(
          label: empty
              ? 'Selesai Bongkar (belum ada item)'
              : 'Selesaikan Bongkar ✓',
          background: AppTheme.success,
          foreground: Colors.white,
          loading: unload.actionBusy,
          onPressed: empty ? null : () => _confirmComplete(unload),
        ),
        if (empty) ...[
          const SizedBox(height: AppTheme.space2),
          Text(
            'Pindai dulu minimal 1 produk — tombol aktif otomatis.',
            textAlign: TextAlign.center,
            style: GoogleFonts.roboto(fontSize: 11.5, color: Theme.of(context).extension<ThemeColors>()?.textMuted ?? AppTheme.gray400),
          ),
        ],
      ],
    );
  }

  Future<void> _confirmComplete(UnloadProvider unload) async {
    var session = unload.active;
    if (session == null || unload.actionBusy) {
      return;
    }
    var received = session.totalReceivedQty ?? 0;
    var expected = session.totalExpectedQty ?? 0;
    var selisih = received - expected;

    var confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: AppTheme.surfaceCard,
        title: Text(
          'Selesaikan bongkar?',
          style: GoogleFonts.roboto(fontSize: 16, fontWeight: FontWeight.w700),
        ),
        content: Text(
          'PO ${session.poTransporter ?? '-'} — diterima ${_formatQty(received)} '
          'dari ${_formatQty(expected)} (selisih ${_formatQty(selisih)}). '
          'Aksi ini menyelesaikan receiving, melepas dock, dan mengirim '
          'notifikasi email ke BLC (TO) & Admin Distribusi (CC); '
          'tidak dapat dibatalkan.',
          style: GoogleFonts.roboto(
            fontSize: 13,
            height: 1.4,
            color: Theme.of(context).extension<ThemeColors>()?.textSecondary ?? AppTheme.gray600,
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Batal'),
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
      var done = await unload.completeActive();
      if (done && mounted) {
        _scanController.clear();
        unload.clearActive();
        await unload.refresh();
      }
    }
  }

  Future<void> _confirmCancel(UnloadProvider unload) async {
    var confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: AppTheme.surfaceCard,
        title: Text(
          'Batalkan bongkar?',
          style: GoogleFonts.roboto(fontSize: 16, fontWeight: FontWeight.w700),
        ),
        content: Text(
          'Bongkar berjalan dibatalkan. Item yang sudah dipindai ikut hangus.',
          style: GoogleFonts.roboto(
            fontSize: 13,
            height: 1.4,
            color: Theme.of(context).extension<ThemeColors>()?.textSecondary ?? AppTheme.gray600,
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
              foregroundColor: Colors.white,
            ),
            child: const Text('Ya, Batalkan'),
          ),
        ],
      ),
    );
    if ((confirmed ?? false) && mounted) {
      await unload.cancelActive();
    }
  }

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
          color: AppTheme.primary400,
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            guide,
            style: GoogleFonts.roboto(
              fontSize: 12,
              height: 1.4,
              color: Colors.white,
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

  static String _sessionHeadline(
    UnloadSession session,
  ) => switch (session.status) {
    'IN_PROGRESS' =>
      'BONGKAR BERJALAN • ${session.coveredCount}/${session.plan.length} PRODUK',
    'COMPLETED' => 'BONGKAR SELESAI • ${session.plan.length} PRODUK',
    'CANCELLED' => 'BONGKAR DIBATALKAN',
    _ => 'SIAP BONGKAR • ${session.plan.length} PRODUK',
  };

  static String _sessionBadge(String status) => switch (status) {
    'IN_PROGRESS' => 'Berjalan',
    'COMPLETED' => 'Selesai',
    'CANCELLED' => 'Dibatalkan',
    _ => 'Menunggu',
  };

  static String _formatQty(double? value) {
    if (value == null) {
      return '-';
    }
    return value == value.truncateToDouble() ? '${value.toInt()}' : '$value';
  }
}

/// Bottom sheet for scanning one unloaded line: actual qty, condition
/// chips, optional product barcode and notes.
///
/// Scan contracts carry no expiry/photo fields, so the sheet stays short:
/// qty → kondisi → simpan.
class _UnloadScanSheet extends StatefulWidget {
  const _UnloadScanSheet({required this.line, required this.receivingId});
  final UnloadPlanLine line;
  final int receivingId;

  @override
  State<_UnloadScanSheet> createState() => _UnloadScanSheetState();
}

class _UnloadScanSheetState extends State<_UnloadScanSheet> {
  final _formKey = GlobalKey<FormState>();
  final _qtyController = TextEditingController();
  final _barcodeController = TextEditingController();
  final _notesController = TextEditingController();
  String _condition = 'FISIK_BAGUS';
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _qtyController.dispose();
    _barcodeController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    var line = widget.line;
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
                  line.namaBarang ?? line.kodeBarang ?? 'Produk',
                  style: GoogleFonts.roboto(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: AppTheme.foreground,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  '${line.kodeBarang ?? '-'} • Rencana ${_formatQty(line.jumlah)}'
                  '${line.satuan != null ? ' ${line.satuan}' : ''}',
                  style: GoogleFonts.robotoMono(
                    fontSize: 12,
                    color: Theme.of(context).extension<ThemeColors>()?.textMuted ?? AppTheme.gray500,
                  ),
                ),
                const SizedBox(height: AppTheme.space4),
                AppTextField(
                  controller: _qtyController,
                  label: 'Qty turun aktual',
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
                    color: Theme.of(context).extension<ThemeColors>()?.textSecondary ?? AppTheme.gray700,
                  ),
                ),
                const SizedBox(height: AppTheme.space2),
                Wrap(
                  spacing: AppTheme.space2,
                  runSpacing: AppTheme.space2,
                  children: [
                    for (var value in ValidationCondition.values)
                      _conditionChip(value),
                  ],
                ),
                const SizedBox(height: AppTheme.space3),
                AppTextField(
                  controller: _barcodeController,
                  label: 'Barcode produk (opsional)',
                  hint: 'Scan / ketik barcode kemasan',
                  prefixIcon: Icons.barcode_reader,
                ),
                const SizedBox(height: AppTheme.space3),
                AppTextField(
                  controller: _notesController,
                  label: 'Catatan (opsional)',
                  hint: 'Keterangan tambahan',
                  prefixIcon: Icons.note_rounded,
                  maxLines: 2,
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
                  text: 'Simpan Hasil Pindai',
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

  static String _formatQty(double? value) {
    if (value == null) {
      return '-';
    }
    return value == value.truncateToDouble() ? '${value.toInt()}' : '$value';
  }

  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false)) {
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });

    var provider = context.read<UnloadProvider>();
    var success = await provider.scanLine(
      kodeBarang: widget.line.kodeBarang ?? '',
      actualQty: double.parse(_qtyController.text.trim().replaceAll(',', '.')),
      namaBarang: widget.line.namaBarang,
      satuan: widget.line.satuan,
      condition: _condition,
      barcode: _barcodeController.text.trim().isEmpty
          ? null
          : _barcodeController.text.trim(),
      notes: _notesController.text.trim().isEmpty
          ? null
          : _notesController.text.trim(),
      rencanaKirimItemId: widget.line.id,
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
