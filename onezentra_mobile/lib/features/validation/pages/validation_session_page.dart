import 'dart:async';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

import 'package:onezentra_mobile/core/printer/thermal_label.dart';
import 'package:onezentra_mobile/core/theme/app_theme.dart';
import 'package:onezentra_mobile/features/auth/providers/auth_provider.dart';
import 'package:onezentra_mobile/features/validation/models/validation_models.dart';
import 'package:onezentra_mobile/features/validation/providers/validation_provider.dart';
import 'package:onezentra_mobile/features/validation/widgets/validation_item_fields.dart';
import 'package:onezentra_mobile/features/validation/widgets/label_print_sheet.dart';
import 'package:onezentra_mobile/features/validation/widgets/extra_item_sheet.dart';
import 'package:onezentra_mobile/features/validation/widgets/item_validation_sheet.dart';
import 'package:onezentra_mobile/features/validation/widgets/npn_product_picker.dart';
import 'package:onezentra_mobile/features/validation/widgets/standarisasi_sheet.dart';
import 'package:onezentra_mobile/shared/widgets/app_widgets.dart';

/// Halaman pemrosesan sesi validasi yang dibuka SESUDAH operator mengetik /
/// memindai PO dan menekan "Mulai" di [ValidationPage].
///
/// Sebelumnya semua (scan + sesi + item + selesaikan + riwayat) menumpuk di
/// satu halaman. Halaman ini dipisahkan sehingga halaman scan hanya berisi
/// entri PO, sementara halaman ini berisi daftar produk yang akan diproses.
///
/// Setiap produk yang standarisasinya belum disetujui BLC ditandai dengan
/// badge peringatan. Mengetik produk tersebut menampilkan konfirmasi pop-up
/// sebelum diarahkan ke input standarisasi (tier × tinggi) yang menunggu
/// approval BLC.
class ValidationSessionPage extends StatefulWidget {
  const ValidationSessionPage({
    required this.provider,
    required this.session,
    this.pickPhoto,
    super.key,
  });

  /// Provider yang sama milik [ValidationPage] agar aksi (validasi, selesaikan,
  /// standarisasi) condivisi tanpa memuat ulang data dari nol.
  final ValidationProvider provider;

  /// Sesi yang baru dibuka dari layar scan.
  final SjValidation session;

  /// Injectable photo source so tests never open the camera or gallery.
  final Future<String?> Function({required bool fromCamera})? pickPhoto;

  @override
  State<ValidationSessionPage> createState() => _ValidationSessionPageState();
}

class _ValidationSessionPageState extends State<ValidationSessionPage> {
  // Mencegah operator mengetuk produk yang sama berulang kali sambil
  // pop-up konfirmasi / sheet standarisasi masih terbuka.
  var _isTapping = false;

  @override
  Widget build(BuildContext context) =>
      ChangeNotifierProvider<ValidationProvider>.value(
        value: widget.provider,
        child: Builder(builder: _buildPage),
      );

  Widget _buildPage(BuildContext context) {
    var provider = context.watch<ValidationProvider>();
    // `provider.active` diperbarui setelah setiap aksi; fallback ke sesi
    // awal yang diterima dari layar scan.
    var session = provider.active ?? widget.session;
    var doc = session.document;
    var user = context.watch<AuthProvider>().user;
    var canValidate = user?.hasPermission('sj_validation.validate') ?? false;
    var canComplete = user?.hasPermission('sj_validation.complete') ?? false;
    var canPrintLabels =
        canValidate || (user?.hasPermission('penerimaan.view') ?? false);
    var canCreateStandarisasi =
        user?.hasPermission('standarisasi.create') ?? false;
    var canViewNpn = user?.hasPermission('npn.view') ?? false;
    var canReportExtra = user?.hasPermission('sj_validation.extra') ?? false;
    var canApproveExtra = user?.hasPermission('sj_validation.approve') ?? false;
    var canApproveStandarisasi =
        user?.hasPermission('standarisasi.approve') ?? false;

    var unapprovedItems = session.items
        .where((item) => item.isPending && !item.canValidate)
        .toList();
    // Pengajuan standarisasi yang menunggu keputusan BLC — hanya tampil
    // untuk user dengan izin approve (section approval terpisah di bawah).
    var pendingStandarisasi = session.items
        .where(
          (item) =>
              item.standarisasi?.status == 'pending' &&
              item.standarisasi?.id != null,
        )
        .toList();

    return Scaffold(
      backgroundColor: context.colors.background,
      appBar: AppBar(
        title: Text(
          doc?.poTransporter ?? session.scanCode ?? 'Sesi #${session.id}',
          style: GoogleFonts.roboto(fontWeight: FontWeight.w700, fontSize: 18),
        ),
        elevation: 0,
        centerTitle: false,
        actions: [
          IconButton(
            tooltip: 'Muat ulang',
            onPressed: provider.actionBusy
                ? null
                : () => provider.openSession(session.id),
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () => provider.openSession(session.id),
          color: AppTheme.primary600,
          child: ListView(
            padding: const EdgeInsets.all(AppTheme.space4),
            children: [
              _buildSessionHeader(session, doc),
              const SizedBox(height: AppTheme.space4),
              // Peringatan BLC muncul di atas daftar produk ketika ada item
              // yang belum disetujui, sehingga operator tidak melewatkannya.
              if (session.isRunning && unapprovedItems.isNotEmpty)
                _buildBlcBanner(unapprovedItems.length),
              const SizedBox(height: AppTheme.space2),
              if (provider.message != null)
                _buildMessageBanner(provider.message!),
              // Section approval BLC — pengajuan standarisasi yang
              // menunggu keputusan; hanya tampil untuk user berizin.
              if (session.isRunning &&
                  canApproveStandarisasi &&
                  pendingStandarisasi.isNotEmpty) ...[
                const SizedBox(height: AppTheme.space4),
                _buildStandarisasiApprovalSection(
                  pendingStandarisasi,
                  provider,
                ),
              ],
              const SizedBox(height: AppTheme.space2),
              ..._buildItems(
                session.items,
                provider: provider,
                canValidate: canValidate,
                canPrintLabels: canPrintLabels,
                canCreateStandarisasi: canCreateStandarisasi,
                canViewNpn: canViewNpn,
              ),
              // Barang di luar rencana kirim (deviation record): selalu
              // tampil bila sudah ada catatan; tombol lapor hanya saat sesi
              // berjalan dan operator punya izin.
              if (session.extraItems.isNotEmpty ||
                  (session.isRunning && canReportExtra)) ...[
                const SizedBox(height: AppTheme.space4),
                _buildExtraItemsSection(
                  session,
                  provider,
                  canReportExtra,
                  canApproveExtra,
                ),
              ],
              if (session.isRunning) ...[
                const SizedBox(height: AppTheme.space4),
                _buildCompleteSection(
                  session,
                  provider,
                  canComplete: canComplete,
                ),
                const SizedBox(height: AppTheme.space2),
              ] else if (session.isCompleted &&
                  !session.canCorrectCompleted) ...[
                const SizedBox(height: AppTheme.space4),
                _inlineWarning(
                  'Sesi selesai. Koreksi item hanya dapat dilakukan supervisor selama Receiving belum ditutup.',
                ),
              ] else if (session.isCancelled) ...[
                const SizedBox(height: AppTheme.space4),
                _inlineWarning(
                  'Sesi dibatalkan; label dan data validasi ini tidak berlaku.',
                ),
              ],
              const SizedBox(height: AppTheme.space8),
            ],
          ),
        ),
      ),
    );
  }

  // ---------------------------------------------------------------------
  // Session header
  // ---------------------------------------------------------------------

  Widget _buildSessionHeader(SjValidation session, ValidationDocument? doc) {
    var statusHeading = session.isRunning
        ? 'SESI BERJALAN'
        : 'SESI ${ValidationStatus.label(session.status).toUpperCase()}';
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AppTheme.space4),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [context.colors.surfaceCard, context.colors.surface],
        ),
        borderRadius: AppTheme.radius2xl,
        border: Border.all(
          color: context.colors.textSecondary.withValues(alpha: 0.08),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  '$statusHeading • ${session.validatedCount}/${session.totalItemCount} ITEM',
                  style: GoogleFonts.roboto(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.8,
                    color: context.colors.textMuted,
                  ),
                ),
              ),
              AppBadge(
                text: ValidationStatus.label(session.status),
                variant: _statusVariant(session.status),
              ),
              IconButton(
                onPressed: () => Navigator.of(context).pop(),
                tooltip: 'Kembali',
                visualDensity: VisualDensity.compact,
                icon: Icon(
                  Icons.arrow_back_rounded,
                  size: 18,
                  color: context.colors.foreground.withValues(alpha: 0.6),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppTheme.space3),
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
          const SizedBox(height: AppTheme.space4),
          ClipRRect(
            borderRadius: AppTheme.radiusFull,
            child: LinearProgressIndicator(
              value: session.totalItemCount == 0
                  ? 0
                  : session.validatedCount / session.totalItemCount,
              minHeight: 6,
              backgroundColor: context.colors.textSecondary.withValues(
                alpha: 0.1,
              ),
              valueColor: const AlwaysStoppedAnimation<Color>(
                AppTheme.primary500,
              ),
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
                  color: context.colors.textMuted,
                ),
              ),
            ),
        ],
      ),
    );
  }

  // ---------------------------------------------------------------------
  // BLC banner
  // ---------------------------------------------------------------------

  /// Peringatan amber di bagian atas daftar produk: standarisasi tumpukan
  /// untuk produk-produk ini masih menunggu approval BLC.
  Widget _buildBlcBanner(int count) => Container(
    width: double.infinity,
    margin: const EdgeInsets.only(top: AppTheme.space3),
    padding: const EdgeInsets.all(AppTheme.space3),
    decoration: BoxDecoration(
      color: context.colors.surfaceHover,
      borderRadius: AppTheme.radiusLg,
      border: Border.all(color: context.colors.border),
    ),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(width: 8),
        Icon(Icons.layers_rounded, size: 18, color: context.colors.warningText),
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
                  color: context.colors.warningText,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                '$count produk belum dapat divalidasi sebelum BLC menyetujui '
                'standarisasinya. Tekan produk untuk input standarisasi.',
                style: GoogleFonts.roboto(
                  fontSize: 11.5,
                  height: 1.4,
                  color: context.colors.warningText,
                ),
              ),
            ],
          ),
        ),
      ],
    ),
  );

  /// Section approval BLC: daftar pengajuan standarisasi tumpukan yang
  /// masih PENDING. Sebelum disetujui, produk-produk ini terkunci untuk
  /// validasi — jadi keputusan langsung dari HP tanpa buka web.
  Widget _buildStandarisasiApprovalSection(
    List<SjValidationItem> items,
    ValidationProvider provider,
  ) => Container(
    width: double.infinity,
    padding: const EdgeInsets.all(AppTheme.space4),
    decoration: BoxDecoration(
      color: context.colors.textPrimary,
      borderRadius: AppTheme.radiusXl,
      border: Border.all(
        color: context.colors.textSecondary.withValues(alpha: 0.08),
      ),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: AppTheme.primary600.withValues(alpha: 0.2),
                borderRadius: AppTheme.radiusLg,
              ),
              child: const Icon(
                Icons.layers_rounded,
                size: 18,
                color: AppTheme.primary400,
              ),
            ),
            const SizedBox(width: AppTheme.space3),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Approval BLC — Standarisasi',
                    style: GoogleFonts.roboto(
                      fontSize: 14,
                      fontWeight: FontWeight.w800,
                      color: context.colors.textSecondary,
                    ),
                  ),
                  Text(
                    '${items.length} pengajuan menunggu keputusan',
                    style: GoogleFonts.roboto(
                      fontSize: 11.5,
                      color: context.colors.textMuted.withValues(alpha: 0.6),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: AppTheme.space3),
        for (var i = 0; i < items.length; i++) ...[
          _standarisasiApprovalTile(items[i], provider),
          if (i != items.length - 1) const SizedBox(height: AppTheme.space2),
        ],
      ],
    ),
  );

  Widget _standarisasiApprovalTile(
    SjValidationItem item,
    ValidationProvider provider,
  ) {
    var standarisasi = item.standarisasi;
    var tier = standarisasi?.tier ?? 0;
    var tinggi = standarisasi?.tinggiTumpukan ?? 0;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AppTheme.space3),
      decoration: BoxDecoration(
        color: context.colors.textSecondary.withValues(alpha: 0.06),
        borderRadius: AppTheme.radiusLg,
        border: Border.all(
          color: context.colors.textSecondary.withValues(alpha: 0.1),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            item.namaBarang ?? '-',
            style: GoogleFonts.roboto(
              fontSize: 13,
              fontWeight: FontWeight.w800,
              color: context.colors.textMuted,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            '${item.kodeBarang} • Tier $tier × Tinggi $tinggi',
            style: GoogleFonts.roboto(
              fontSize: 11.5,
              color: context.colors.textMuted.withValues(alpha: 0.6),
            ),
          ),
          const SizedBox(height: AppTheme.space3),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: provider.actionBusy
                      ? null
                      : () =>
                            _confirmStandarisasiDecision(item, provider, true),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: context.colors.successText,
                    side: BorderSide(color: context.colors.success),
                    backgroundColor: context.colors.surfaceHover,
                    minimumSize: const Size(0, 40),
                    shape: const RoundedRectangleBorder(
                      borderRadius: AppTheme.radiusLg,
                    ),
                    textStyle: GoogleFonts.roboto(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  icon: Icon(
                    Icons.check_rounded,
                    size: 16,
                    color: context.colors.successText,
                  ),
                  label: const Text('Setujui'),
                ),
              ),
              const SizedBox(width: AppTheme.space2),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: provider.actionBusy
                      ? null
                      : () =>
                            _confirmStandarisasiDecision(item, provider, false),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: context.colors.dangerText,
                    side: BorderSide(color: context.colors.danger),
                    backgroundColor: context.colors.surfaceHover,
                    minimumSize: const Size(0, 40),
                    shape: const RoundedRectangleBorder(
                      borderRadius: AppTheme.radiusLg,
                    ),
                    textStyle: GoogleFonts.roboto(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  icon: Icon(
                    Icons.close_rounded,
                    size: 16,
                    color: context.colors.dangerText,
                  ),
                  label: const Text('Tolak'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  /// Dialog konfirmasi keputusan standarisasi tumpukan. Keputusan langsung
  /// dieksekusi — produk yang disetujui terbuka untuk validasi setelah
  /// sesi dimuat ulang.
  Future<void> _confirmStandarisasiDecision(
    SjValidationItem item,
    ValidationProvider provider,
    bool approve,
  ) async {
    var standarisasiId = item.standarisasi?.id;
    if (standarisasiId == null) {
      return;
    }
    var confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: context.colors.surfaceCard,
        shape: const RoundedRectangleBorder(borderRadius: AppTheme.radiusXl),
        title: Text(
          approve ? 'Setujui standarisasi?' : 'Tolak standarisasi?',
          style: GoogleFonts.roboto(
            fontSize: 16,
            fontWeight: FontWeight.w800,
            color: context.colors.textSecondary,
          ),
        ),
        content: Text(
          '${item.namaBarang} — Tier ${item.standarisasi?.tier ?? 0} × '
          'Tinggi ${item.standarisasi?.tinggiTumpukan ?? 0}',
          style: GoogleFonts.roboto(
            fontSize: 13,
            color: context.colors.textMuted.withValues(alpha: 0.9),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Batal'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            style: FilledButton.styleFrom(
              backgroundColor: approve
                  ? context.colors.success
                  : context.colors.danger,
            ),
            child: Text(approve ? 'Setujui' : 'Tolak'),
          ),
        ],
      ),
    );
    if (confirmed != true) {
      return;
    }
    await provider.decideStandarisasi(
      standarisasiId: standarisasiId,
      approve: approve,
    );
  }

  /// Banner pesan sukses/gagal dari aksi validasi atau standarisasi.
  Widget _buildMessageBanner(ValidationActionMessage message) => Container(
    width: double.infinity,
    margin: const EdgeInsets.only(top: AppTheme.space3),
    padding: const EdgeInsets.all(AppTheme.space3),
    decoration: BoxDecoration(
      color: message.success
          ? context.colors.successWell
          : context.colors.dangerWell,
      borderRadius: AppTheme.radiusLg,
      border: Border.all(
        color: message.success
            ? context.colors.successText
            : context.colors.dangerText,
      ),
    ),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(
          message.success ? Icons.check_circle_rounded : Icons.error_rounded,
          size: 18,
          color: message.success
              ? context.colors.success
              : context.colors.danger,
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            message.message,
            style: GoogleFonts.roboto(
              fontSize: 12.5,
              height: 1.4,
              color: context.colors.textSecondary,
            ),
          ),
        ),
      ],
    ),
  );

  // ---------------------------------------------------------------------
  // Items
  // ---------------------------------------------------------------------

  List<Widget> _buildItems(
    List<SjValidationItem> items, {
    required ValidationProvider provider,
    required bool canValidate,
    required bool canPrintLabels,
    required bool canCreateStandarisasi,
    required bool canViewNpn,
  }) => [
    for (var i = 0; i < items.length; i++) ...[
      _itemTile(
        items[i],
        provider: provider,
        canValidate: canValidate,
        canPrintLabels: canPrintLabels,
        canCreateStandarisasi: canCreateStandarisasi,
        canViewNpn: canViewNpn,
      ),
      if (i != items.length - 1) const SizedBox(height: AppTheme.space2),
    ],
  ];

  Widget _itemTile(
    SjValidationItem item, {
    required ValidationProvider provider,
    required bool canValidate,
    required bool canPrintLabels,
    required bool canCreateStandarisasi,
    required bool canViewNpn,
  }) {
    var locked = !item.canValidate;
    var tapAction = !canValidate || provider.actionBusy
        ? null
        : () => _onItemTap(
            item,
            canCreateStandarisasi: canCreateStandarisasi,
            canViewNpn: canViewNpn,
            provider: provider,
          );

    return InkWell(
      onTap: tapAction,
      borderRadius: AppTheme.radiusLg,
      child: Container(
        padding: const EdgeInsets.all(AppTheme.space3),
        decoration: BoxDecoration(
          color: (!item.isPending && (item.batch?.isPrinted ?? false))
              ? context.colors.success.withValues(alpha: 0.12)
              : context.colors.textSecondary.withValues(alpha: 0.07),
          borderRadius: AppTheme.radiusLg,
          border: Border.all(
            color: locked
                ? context.colors.warningText.withValues(alpha: 0.5)
                : context.colors.textSecondary.withValues(alpha: 0.15),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Baris 1: Icon + Nama Produk + Info
            Row(
              children: [
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: locked
                        ? context.colors.warningDark.withValues(alpha: 0.4)
                        : item.isPending
                        ? context.colors.textSecondary.withValues(alpha: 0.1)
                        : context.colors.success.withValues(alpha: 0.2),
                    borderRadius: AppTheme.radiusLg,
                  ),
                  child: Icon(
                    locked
                        ? Icons.lock_outline_rounded
                        : item.isPending
                        ? Icons.hourglass_empty_rounded
                        : item.status == 'VALIDATED'
                        ? Icons.check_circle_rounded
                        : Icons.warning_rounded,
                    size: 18,
                    color: locked
                        ? context.colors.warningText
                        : item.isPending
                        ? context.colors.gray400
                        : item.status == 'VALIDATED'
                        ? context.colors.success
                        : context.colors.warning,
                  ),
                ),
                const SizedBox(width: AppTheme.space3),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        item.namaBarang ??
                            item.kodeBarang ??
                            'Item #${item.id}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.roboto(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: context.colors.textMuted.withValues(
                            alpha: locked ? 0.6 : 1.0,
                          ),
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
                          color: context.colors.textMuted.withValues(
                            alpha: locked ? 0.6 : 1.0,
                          ),
                        ),
                      ),
                      if (locked) ...[
                        const SizedBox(height: 2),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: AppTheme.space2,
                            vertical: 1,
                          ),
                          decoration: BoxDecoration(
                            color: context.colors.warningDark,
                            borderRadius: AppTheme.radiusFull,
                            border: Border.all(
                              color: context.colors.warningText,
                            ),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                Icons.error_outline_rounded,
                                size: 11,
                                color: context.colors.warningText,
                              ),
                              const SizedBox(width: 4),
                              Text(
                                item.npnId == null
                                    ? 'NPN BELUM TERTAUT'
                                    : item.standarisasi?.status == 'pending'
                                    ? 'SUDAH DIJUKAN BLC'
                                    : 'BELUM ADA STANDARISASI',
                                style: GoogleFonts.roboto(
                                  fontSize: 9,
                                  fontWeight: FontWeight.w700,
                                  color: context.colors.warningText,
                                  letterSpacing: 0.4,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                      if (!item.canValidate)
                        Padding(
                          padding: const EdgeInsets.only(top: 2),
                          child: Text(
                            item.npnId == null
                                ? 'NPN belum tertaut — pilih produk master untuk input standar di Flutter'
                                : item.standarisasi?.status == 'pending'
                                ? 'Standarisasi sudah diajukan — menunggu approve BLC'
                                : 'Belum ada standarisasi tumpukan — ajukan dulu',
                            style: GoogleFonts.roboto(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: context.colors.warningText,
                            ),
                          ),
                        ),
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
                                  ? context.colors.danger
                                  : context.colors.success,
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppTheme.space2),
            // Baris 2: Aksi item (full width)
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Wrap(
                    spacing: AppTheme.space2,
                    runSpacing: AppTheme.space2,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      if (item.isPending && canValidate && item.canValidate)
                        _quickOkButton(item, provider)
                      else if (item.isPending &&
                          canValidate &&
                          !item.canValidate)
                        _standarisasiButton(
                          item,
                          provider,
                          canCreate: canCreateStandarisasi,
                          canViewNpn: canViewNpn,
                        )
                      else if (!item.isPending &&
                          canValidate &&
                          item.canValidate)
                        _editButton(item)
                      else
                        AppBadge(
                          text: ValidationCondition.label(item.condition),
                          variant: item.condition == 'FISIK_BAGUS'
                              ? AppBadgeVariant.gray
                              : AppBadgeVariant.warning,
                        ),
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
          ],
        ),
      ),
    );
  }

  /// Menangani sentuhan pada satu baris produk.
  ///
  /// Produk yang sudah disetujui BLC dibuka langsung ke layar validasi item.
  /// Produk yang BELUM disetujui BLC menampilkan konfirmasi pop-up terlebih
  /// dahulu, lalu diarahkan ke input standarisasi (tier × tinggi).
  ///
  /// Guard [_isTapping] mencegah operator mengetuk produk yang sama
  /// berulang kali sambil pop-up / sheet masih terbuka.
  Future<void> _onItemTap(
    SjValidationItem item, {
    required bool canCreateStandarisasi,
    required bool canViewNpn,
    required ValidationProvider provider,
  }) async {
    if (_isTapping) {
      return;
    }
    _isTapping = true;

    try {
      if (item.npnId == null) {
        if (!canCreateStandarisasi || !canViewNpn) {
          await showDialog<void>(
            context: context,
            builder: (dialogContext) => AlertDialog(
              backgroundColor: context.colors.surfaceCard,
              title: const Text('Produk NPN belum tertaut'),
              content: Text(
                !canViewNpn
                    ? 'Akun ini belum memiliki akses pencarian master NPN. '
                          'Minta akses npn.view agar petugas dapat memilih produk di Flutter.'
                    : 'Akun ini belum memiliki izin standarisasi.create untuk '
                          'menautkan produk dan mengisi standar di Flutter.',
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(dialogContext).pop(),
                  child: const Text('Tutup'),
                ),
              ],
            ),
          );
          return;
        }

        if (!(provider.active?.isRunning ?? widget.session.isRunning)) {
          return;
        }

        var autoLinked = await provider.resolveItemNpn(itemId: item.id);
        if (!mounted || autoLinked == null) {
          return;
        }
        if (autoLinked) {
          var linkedItem = provider.active?.items.firstWhere(
            (candidate) => candidate.id == item.id,
            orElse: () => item,
          );
          if (linkedItem == null || linkedItem.npnId == null) {
            return;
          }
          if (linkedItem.canValidate) {
            await _openItemSheet(linkedItem);
          } else if (linkedItem.standarisasi?.status == 'pending') {
            await showDialog<void>(
              context: context,
              builder: (dialogContext) => AlertDialog(
                backgroundColor: context.colors.surfaceCard,
                title: const Text('Menunggu persetujuan BLC'),
                content: const Text(
                  'Produk sudah tertaut dan standarisasi tumpukan sedang '
                  'menunggu persetujuan BLC. Standarisasi tidak perlu diajukan ulang.',
                ),
                actions: [
                  TextButton(
                    onPressed: () => Navigator.of(dialogContext).pop(),
                    child: const Text('Tutup'),
                  ),
                ],
              ),
            );
          } else {
            await _openStandarisasiSheet(linkedItem, canCreate: true);
          }
          return;
        }

        await _selectNpnForItem(
          item,
          provider,
          canCreateStandarisasi: canCreateStandarisasi,
        );
        return;
      }

      if (item.canValidate) {
        await _openItemSheet(item);
        return;
      }
      // BLC belum menyetujui standarisasi untuk produk ini. Tampilkan pop-up
      // konfirmasi sebelum mengarahkan operator ke input standarisasi.
      var confirmed = await showDialog<bool>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          backgroundColor: context.colors.surfaceCard,
          title: Text(
            'Produk Belum Disetujui BLC',
            style: GoogleFonts.roboto(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: context.colors.foreground,
            ),
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '${item.namaBarang ?? item.kodeBarang ?? 'Produk ini'} '
                'belum memiliki standarisasi tumpukan yang disetujui BLC. '
                'Validasi tidak dapat dilakukan sebelum disetujui.',
                style: GoogleFonts.roboto(
                  fontSize: 13,
                  height: 1.4,
                  color: context.colors.textMuted,
                ),
              ),
              if (item.standarisasi?.status == 'pending') ...[
                const SizedBox(height: AppTheme.space2),
                Text(
                  'Standarisasi sudah dikirim — menunggu approval BLC. '
                  'Validasi akan terbuka otomatis setelah disetujui.',
                  style: GoogleFonts.roboto(
                    fontSize: 12.5,
                    height: 1.4,
                    color: context.colors.warningText,
                  ),
                ),
              ] else ...[
                const SizedBox(height: AppTheme.space2),
                Text(
                  'Belum ada permintaan standarisasi untuk produk ini. '
                  'Ajukan terlebih dahulu agar BLC dapat menyetujui.',
                  style: GoogleFonts.roboto(
                    fontSize: 12.5,
                    height: 1.4,
                    color: context.colors.warningText,
                  ),
                ),
              ],
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(false),
              child: const Text('Kembali'),
            ),
            if (canCreateStandarisasi &&
                item.npnId != null &&
                item.standarisasi?.status != 'pending')
              FilledButton(
                onPressed: () => Navigator.of(dialogContext).pop(true),
                style: FilledButton.styleFrom(
                  backgroundColor: context.colors.warningText,
                  foregroundColor: context.colors.textPrimary,
                ),
                child: const Text('Input Standarisasi'),
              ),
          ],
        ),
      );
      if (!mounted) {
        return;
      }
      if ((confirmed ?? false) &&
          canCreateStandarisasi &&
          item.npnId != null &&
          item.standarisasi?.status != 'pending') {
        await _openStandarisasiSheet(item, canCreate: true);
      }
    } finally {
      _isTapping = false;
    }
  }

  Future<void> _selectNpnForItem(
    SjValidationItem item,
    ValidationProvider provider, {
    required bool canCreateStandarisasi,
  }) async {
    var product = await showModalBottomSheet<NpnProduct>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => NpnProductPicker(provider: provider),
    );
    if (product == null || !mounted) {
      return;
    }

    var confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: context.colors.surfaceCard,
        title: const Text('Tautkan produk NPN?'),
        content: Text(
          '${item.namaBarang ?? item.kodeBarang ?? 'Item rencana'} akan '
          'ditautkan ke ${product.displayName} (${product.kodeBarang ?? '-'}) '
          'untuk pengisian standarisasi tumpukan di Flutter.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Batal'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Tautkan'),
          ),
        ],
      ),
    );
    if (confirmed == true && mounted) {
      var linked = await provider.linkItemNpn(
        itemId: item.id,
        npnId: product.id,
      );
      if (!linked || !mounted || !canCreateStandarisasi) {
        return;
      }

      var linkedItem = provider.active?.items.firstWhere(
        (candidate) => candidate.id == item.id,
        orElse: () => item,
      );
      if (linkedItem != null && linkedItem.npnId != null) {
        await _openStandarisasiSheet(linkedItem, canCreate: true);
      }
    }
  }

  // ---------------------------------------------------------------------
  // Complete section
  // ---------------------------------------------------------------------

  // ---------------------------------------------------------------------
  // Barang luar rencana (deviation record)
  // ---------------------------------------------------------------------

  Widget _buildExtraItemsSection(
    SjValidation session,
    ValidationProvider provider,
    bool canReportExtra,
    bool canApproveExtra,
  ) => Container(
    width: double.infinity,
    padding: const EdgeInsets.all(AppTheme.space4),
    decoration: BoxDecoration(
      color: context.colors.textPrimary,
      borderRadius: AppTheme.radiusXl,
      border: Border.all(
        color: context.colors.textSecondary.withValues(alpha: 0.08),
      ),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: context.colors.warning.withValues(alpha: 0.18),
                borderRadius: AppTheme.radiusLg,
              ),
              child: Icon(
                Icons.inventory_2_rounded,
                size: 18,
                color: context.colors.warningText,
              ),
            ),
            const SizedBox(width: AppTheme.space3),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Barang luar rencana',
                    style: GoogleFonts.roboto(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: context.colors.textSecondary,
                    ),
                  ),
                  Text(
                    '${session.extraItems.length} catatan — rencana tidak diubah, planner diberi tahu',
                    style: GoogleFonts.roboto(
                      fontSize: 11,
                      height: 1.4,
                      color: context.colors.textMuted,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: AppTheme.space3),
        for (var i = 0; i < session.extraItems.length; i++) ...[
          _extraItemTile(session.extraItems[i], provider, canApproveExtra),
          if (i != session.extraItems.length - 1)
            const SizedBox(height: AppTheme.space2),
        ],
        if (session.isRunning && canReportExtra) ...[
          const SizedBox(height: AppTheme.space3),
          _darkActionButton(
            label: 'Laporkan barang luar rencana',
            background: context.colors.warning,
            // Amber selalu terang; teks harus gelap di kedua tema agar
            // kontras tetap terbaca (textPrimary berubah putih di dark mode).
            foreground: AppTheme.ink900,
            loading: provider.actionBusy,
            onPressed: () => _showExtraItemSheet(provider),
          ),
        ],
      ],
    ),
  );

  Widget _extraItemTile(
    SjValidationExtraItem item,
    ValidationProvider provider,
    bool canApprove,
  ) {
    // Keputusan planner (Fase 2): PENDING default, warna mengikuti keputusan.
    var (label, badgeColor) = switch (item.status) {
      'APPROVED' => ('Disetujui', context.colors.success),
      'REJECTED' => ('Ditolak', context.colors.danger),
      _ => ('Menunggu persetujuan', context.colors.warning),
    };
    // Paritas tanda tercetak: label yang sudah dilaporkan menandai tile
    // hijau seperti tile item rencana kirim.
    var printed = item.canPrint && (item.batch?.isPrinted ?? false);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AppTheme.space3),
      decoration: BoxDecoration(
        color: printed
            ? context.colors.success.withValues(alpha: 0.12)
            : context.colors.textSecondary.withValues(alpha: 0.06),
        borderRadius: AppTheme.radiusLg,
        border: Border.all(
          color: context.colors.textSecondary.withValues(alpha: 0.1),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        item.namaBarang,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.roboto(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: context.colors.textMuted,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppTheme.space2,
                  vertical: 2,
                ),
                decoration: BoxDecoration(
                  color: item.condition == 'FISIK_TIDAK_ADA'
                      ? context.colors.danger.withValues(alpha: 0.15)
                      : context.colors.warning.withValues(alpha: 0.15),
                  borderRadius: AppTheme.radiusFull,
                ),
                child: Text(
                  '${_formatQty(item.qty)}${item.satuan != null ? ' ${item.satuan}' : ''}',
                  style: GoogleFonts.roboto(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: item.condition == 'FISIK_TIDAK_ADA'
                        ? context.colors.danger
                        : context.colors.warning,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 3),
          Text(
            '${item.kodeBarang} • ${item.conditionLabel == "FISIK_TIDAK_ADA" ? "FISIK TIDAK ADA" : item.conditionLabel}'
            '${item.expiredDate != null ? ' • Exp ${_shortDate(item.expiredDate!)}' : ''}'
            '${item.notes != null ? ' • ${item.notes}' : ''}',
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: GoogleFonts.roboto(
              fontSize: 11.5,
              height: 1.4,
              color: context.colors.textMuted,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            item.status == 'REJECTED' && item.decisionNotes != null
                ? '$label oleh ${item.approverName ?? '-'} • ${item.decisionNotes}'
                : item.status == 'APPROVED'
                ? '$label oleh ${item.approverName ?? '-'}'
                : label,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: GoogleFonts.roboto(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: badgeColor,
            ),
          ),
          // Disetujui + batch tersedia → label siap dicetak seperti item
          // rencana kirim (termasuk jejak "Cetak Ulang", badge "Tercetak"
          // & tanda COPY pada cetakan ulang).
          if (item.canPrint) ...[
            const SizedBox(height: AppTheme.space3),
            if (printed) ...[
              const AppBadge(
                text: 'Tercetak',
                variant: AppBadgeVariant.success,
              ),
              const SizedBox(height: AppTheme.space2),
            ],
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: provider.actionBusy
                    ? null
                    : () => _openExtraPrintSheet(item),
                style: OutlinedButton.styleFrom(
                  foregroundColor: context.colors.textMuted,
                  side: const BorderSide(color: AppTheme.primary600),
                  backgroundColor: context.colors.surfaceHover,
                  minimumSize: const Size(0, 44),
                  shape: const RoundedRectangleBorder(
                    borderRadius: AppTheme.radiusLg,
                  ),
                  textStyle: GoogleFonts.roboto(
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                icon: Icon(
                  Icons.print_rounded,
                  size: 18,
                  color: context.colors.textMuted,
                ),
                label: Text(
                  item.batch?.isPrinted == true ? 'Cetak Ulang' : 'Cetak Label',
                  style: TextStyle(color: context.colors.textMuted),
                ),
              ),
            ),
          ],
          // Planner yang berizin memutuskan di sini — tanpa harus buka web.
          if (canApprove && item.status == 'PENDING') ...[
            const SizedBox(height: AppTheme.space3),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: provider.actionBusy
                        ? null
                        : () => _confirmExtraDecision(item, provider, true),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: context.colors.successText,
                      side: BorderSide(color: context.colors.success),
                      backgroundColor: context.colors.surfaceHover,
                      minimumSize: const Size(0, 44),
                      shape: const RoundedRectangleBorder(
                        borderRadius: AppTheme.radiusLg,
                      ),
                      textStyle: GoogleFonts.roboto(
                        fontSize: 13,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    icon: Icon(
                      Icons.check_rounded,
                      size: 18,
                      color: context.colors.successText,
                    ),
                    label: const Text('Setujui'),
                  ),
                ),
                const SizedBox(width: AppTheme.space2),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: provider.actionBusy
                        ? null
                        : () => _confirmExtraDecision(item, provider, false),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: context.colors.dangerText,
                      side: BorderSide(color: context.colors.danger),
                      backgroundColor: context.colors.surfaceHover,
                      minimumSize: const Size(0, 44),
                      shape: const RoundedRectangleBorder(
                        borderRadius: AppTheme.radiusLg,
                      ),
                      textStyle: GoogleFonts.roboto(
                        fontSize: 13,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    icon: Icon(
                      Icons.close_rounded,
                      size: 18,
                      color: context.colors.dangerText,
                    ),
                    label: const Text('Tolak'),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  /// Dialog konfirmasi keputusan barang luar rencana. Penolakan wajib
  /// membawa alasan (dipakai di email keputusan); persetujuan boleh
  /// mencatat catatan opsional.
  Future<void> _confirmExtraDecision(
    SjValidationExtraItem item,
    ValidationProvider provider,
    bool approve,
  ) async {
    var notesController = TextEditingController();
    var notesError = false;
    var confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (dialogContext, setDialogState) => AlertDialog(
          backgroundColor: context.colors.surfaceCard,
          shape: const RoundedRectangleBorder(borderRadius: AppTheme.radiusXl),
          title: Text(
            approve
                ? 'Setujui barang luar rencana?'
                : 'Tolak barang luar rencana?',
            style: GoogleFonts.roboto(
              fontSize: 16,
              fontWeight: FontWeight.w800,
              color: context.colors.textSecondary,
            ),
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '${item.namaBarang} — ${item.qty} ${item.satuan ?? ''}',
                style: GoogleFonts.roboto(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: context.colors.textMuted.withValues(alpha: 0.9),
                ),
              ),
              const SizedBox(height: AppTheme.space3),
              TextField(
                controller: notesController,
                maxLines: 3,
                autofocus: !approve,
                style: TextStyle(
                  color: context.colors.textSecondary,
                  fontSize: 13,
                ),
                decoration: InputDecoration(
                  hintText: approve
                      ? 'Catatan (opsional)'
                      : 'Alasan penolakan (wajib)',
                  hintStyle: TextStyle(
                    color: context.colors.textMuted.withValues(alpha: 0.4),
                    fontSize: 13,
                  ),
                  errorText: notesError
                      ? 'Alasan penolakan wajib diisi.'
                      : null,
                  enabledBorder: OutlineInputBorder(
                    borderRadius: AppTheme.radiusLg,
                    borderSide: BorderSide(
                      color: context.colors.textMuted.withValues(alpha: 0.2),
                    ),
                  ),
                  focusedBorder: const OutlineInputBorder(
                    borderRadius: AppTheme.radiusLg,
                    borderSide: BorderSide(color: AppTheme.primary600),
                  ),
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text('Batal'),
            ),
            FilledButton(
              onPressed: () {
                var notes = notesController.text.trim();
                if (!approve && notes.isEmpty) {
                  setDialogState(() => notesError = true);
                  return;
                }
                Navigator.pop(dialogContext, true);
              },
              style: FilledButton.styleFrom(
                backgroundColor: approve
                    ? context.colors.success
                    : context.colors.danger,
              ),
              child: Text(approve ? 'Setujui' : 'Tolak'),
            ),
          ],
        ),
      ),
    );
    if (confirmed != true) {
      return;
    }
    await provider.decideExtraItem(
      extraItemId: item.id,
      approve: approve,
      notes: notesController.text.trim(),
    );
  }

  static String _shortDate(String value) {
    var date = parseDateOnlyLocal(value);
    if (date == null) {
      return value;
    }
    String two(int part) => part.toString().padLeft(2, '0');
    return '${two(date.day)}/${two(date.month)}/${date.year}';
  }

  Future<void> _showExtraItemSheet(ValidationProvider provider) async {
    if (provider.actionBusy) {
      return;
    }
    await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => ChangeNotifierProvider<ValidationProvider>.value(
        value: widget.provider,
        child: ExtraItemSheet(pickPhoto: widget.pickPhoto),
      ),
    );
  }

  Widget _buildCompleteSection(
    SjValidation session,
    ValidationProvider provider, {
    required bool canComplete,
  }) {
    var pending = session.items.where((item) => item.isPending).length;
    var missingExpired = session.items
        .where(
          (item) =>
              !item.isPending &&
              item.condition != 'FISIK_TIDAK_ADA' &&
              !item.hasExpiredDate,
        )
        .length;
    // Paritas label luar rencana: label yang belum tercetak mengunci
    // penyelesaian sama seperti label rencana kirim — catatan yang
    // disetujui tetapi labelnya belum dilaporkan tercetak ikut dihitung.
    var unprinted = session.items
        .where(
          (item) =>
              item.condition != 'FISIK_TIDAK_ADA' &&
              !item.isPending &&
              item.hasLabel &&
              !(item.batch?.isPrinted ?? false),
        )
        .length;
    var unprintedExtra = session.extraItems
        .where((extra) => extra.canPrint && extra.batch?.isPrinted != true)
        .length;
    var totalUnprinted = unprinted + unprintedExtra;
    var blocked = pending > 0 || missingExpired > 0 || totalUnprinted > 0;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _darkActionButton(
          label: pending > 0
              ? 'Selesaikan ($pending item tersisa)'
              : missingExpired > 0
              ? 'Lengkapi $missingExpired tanggal expired'
              : totalUnprinted > 0
              ? 'Cetak $totalUnprinted label dulu'
              : 'Selesaikan Validasi ✓',
          background: context.colors.success,
          foreground: context.colors.textPrimary,
          loading: provider.actionBusy,
          onPressed: blocked ? null : () => _confirmComplete(provider),
        ),
        if (blocked) ...[
          const SizedBox(height: AppTheme.space2),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(AppTheme.space3),
            decoration: BoxDecoration(
              color: context.colors.warningDark,
              borderRadius: AppTheme.radiusLg,
              border: Border.all(color: context.colors.warningText),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(
                  Icons.warning_rounded,
                  size: 16,
                  color: context.colors.warningText,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    pending > 0
                        ? 'Validasi dulu $pending item di atas — tombol aktif otomatis.'
                        : missingExpired > 0
                        ? 'Isi tanggal expired $missingExpired item di atas — server juga menolak sesi tanpa tanggal expired.'
                        : 'Cetak label $totalUnprinted item di atas — tombol aktif setelah semua dilaporkan tercetak.',
                    style: GoogleFonts.roboto(
                      fontSize: 12,
                      height: 1.4,
                      color: context.colors.warningText,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }

  // ---------------------------------------------------------------------
  // Action buttons & sheets
  // ---------------------------------------------------------------------

  Widget _quickOkButton(SjValidationItem item, ValidationProvider provider) {
    var expected = item.expectedQty;
    var needsSheet =
        expected == null ||
        !item.hasExpiredDate ||
        item.condition != 'FISIK_BAGUS';
    return FilledButton.icon(
      onPressed: provider.actionBusy
          ? null
          : () {
              if (needsSheet) {
                _openItemSheet(item);
                return;
              }
              provider.validateItem(
                itemId: item.id,
                actualQty: expected,
                expiredDate: item.expiredDate,
              );
            },
      style: FilledButton.styleFrom(
        backgroundColor: context.colors.success,
        foregroundColor: context.colors.textPrimary,
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

  Widget _standarisasiButton(
    SjValidationItem item,
    ValidationProvider provider, {
    required bool canCreate,
    required bool canViewNpn,
  }) => FilledButton.icon(
    onPressed: provider.actionBusy
        ? null
        : () => _onItemTap(
            item,
            canCreateStandarisasi: canCreate,
            canViewNpn: canViewNpn,
            provider: provider,
          ),
    style: FilledButton.styleFrom(
      backgroundColor: context.colors.warningText,
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

  Widget _editButton(SjValidationItem item) => OutlinedButton.icon(
    onPressed: () => _openItemSheet(item),
    style: OutlinedButton.styleFrom(
      foregroundColor: context.colors.textMuted,
      side: const BorderSide(color: AppTheme.primary600),
      backgroundColor: context.colors.surfaceHover,
      minimumSize: const Size(0, 44),
      padding: const EdgeInsets.symmetric(horizontal: AppTheme.space4),
      shape: const RoundedRectangleBorder(borderRadius: AppTheme.radiusLg),
      textStyle: GoogleFonts.roboto(fontSize: 13, fontWeight: FontWeight.w800),
    ),
    icon: Icon(
      Icons.description_rounded,
      size: 18,
      color: context.colors.textMuted,
    ),
    label: Text(
      'Detail Validasi',
      style: TextStyle(color: context.colors.textMuted),
    ),
  );

  Widget _printLabelButton(SjValidationItem item) => OutlinedButton.icon(
    onPressed: () => _openPrintSheet(item),
    style: OutlinedButton.styleFrom(
      foregroundColor: context.colors.textMuted,
      side: const BorderSide(color: AppTheme.primary600),
      backgroundColor: context.colors.surfaceHover,
      minimumSize: const Size(0, 44),
      padding: const EdgeInsets.symmetric(horizontal: AppTheme.space4),
      shape: const RoundedRectangleBorder(borderRadius: AppTheme.radiusLg),
      textStyle: GoogleFonts.roboto(fontSize: 13, fontWeight: FontWeight.w800),
    ),
    icon: Icon(Icons.print_rounded, size: 18, color: context.colors.textMuted),
    label: Text(
      item.batch?.isPrinted == true ? 'Cetak Ulang' : 'Cetak Label',
      style: TextStyle(color: context.colors.textMuted),
    ),
  );

  Future<void> _openPrintSheet(SjValidationItem item) async {
    var batch = item.batch;
    debugPrint(
      'CetakLabel: tombol ditekan item=${item.id} '
      'batch=${batch?.id} printed=${batch?.isPrinted}',
    );
    // Hanya boleh cetak kalau server sudah issued batch untuk item ini.
    if (batch == null || batch.id == 0) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: const Text(
              'Item belum memiliki batch. Silakan validasi ulang atau coba lagi.',
            ),
            backgroundColor: context.colors.warning,
          ),
        );
      }
      return;
    }
    await _openBatchPrintSheet(
      batch: batch,
      kodeBarang: item.kodeBarang,
      namaBarang: item.namaBarang,
      actualQty: item.actualQty,
      satuan: item.satuan,
      expiredDate: item.expiredDate,
      condition: item.condition,
    );
  }

  /// Cetak label untuk catatan barang luar rencana yang disetujui — alur
  /// persis item rencana: panel cetak Bluetooth → laporan mark-printed →
  /// badge "Cetak Ulang" di web & mobile.
  Future<void> _openExtraPrintSheet(SjValidationExtraItem item) async {
    var batch = item.batch;
    debugPrint(
      'CetakLabel: tombol luar-rencana ditekan item=${item.id} '
      'batch=${batch?.id} printed=${batch?.isPrinted}',
    );
    if (batch == null || batch.id == 0) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: const Text(
              'Catatan belum disetujui planner — label tersedia setelah disetujui.',
            ),
            backgroundColor: context.colors.warning,
          ),
        );
      }
      return;
    }
    await _openBatchPrintSheet(
      batch: batch,
      kodeBarang: item.kodeBarang,
      namaBarang: item.namaBarang,
      actualQty: item.qty,
      satuan: item.satuan,
      expiredDate: item.expiredDate,
      condition: item.condition,
    );
  }

  Future<void> _openBatchPrintSheet({
    required ValidationBatch batch,
    required String? kodeBarang,
    required String? namaBarang,
    required double? actualQty,
    required String? satuan,
    required String? expiredDate,
    required String? condition,
  }) async {
    if (condition == 'FISIK_TIDAK_ADA') {
      return;
    }
    var reportFailed = false;
    var printed = await LabelPrintSheet.show(
      context,
      label: BatchLabelData(
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        barcodeLabel: batch.barcodeLabel,
        kodeBarang: kodeBarang,
        namaBarang: namaBarang,
        actualQty: actualQty,
        satuan: satuan,
        expiredDate: expiredDate,
        condition: condition,
        // Label yang sudah pernah dicetak dicetak ulang sebagai salinan:
        // kertasnya membawa tanda COPY.
        isCopy: batch.isPrinted,
      ),
      // Laporan "tercetak" hanya dikirim setelah printer melaporkan sukses.
      // Kalau cetak gagal, label tetap belum tercetak dan bisa diulang.
      onPrintSucceeded: () async {
        // Provider dibuat di dalam build (ChangeNotifierProvider.value),
        // jadi context State TIDAK bisa membacanya — pakai instance yang
        // di-inject langsung. Dulu `context.read` di sini melempar
        // ProviderNotFound dan laporan mark-printed tidak pernah terkirim.
        var reported = await widget.provider.markLabelPrinted(batch.id);
        debugPrint('CetakLabel: lapor server -> $reported');
        if (!reported) {
          reportFailed = true;
        }
      },
    );
    debugPrint('CetakLabel: panel ditutup hasil=$printed');
    if (!mounted) {
      return;
    }
    if (printed ?? false) {
      // Warna diambil sebelum await agar tidak memakai context lintas gap
      // async (use_build_context_synchronously).
      var warningColor = context.colors.warning;
      var successColor = context.colors.success;
      String? reportWarning;
      if (reportFailed) {
        reportWarning = widget.provider.message?.message;
      }
      // Segera refresh provider agar status badge cetak berubah dan
      // tombol Selesaikan dapat aktif jika semua label sudah tercetak.
      await widget.provider.openSession(widget.provider.active?.id ?? 0);
      if (mounted) {
        setState(() {});
      }
      // ignore: use_build_context_synchronously
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            reportFailed
                ? (reportWarning ??
                      'Label tercetak, status gagal dilaporkan ke server.')
                : 'Label ${batch.barcodeLabel} tercetak.',
          ),
          backgroundColor: reportFailed ? warningColor : successColor,
        ),
      );
    }
  }

  Future<void> _openItemSheet(SjValidationItem item) async {
    await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => ChangeNotifierProvider<ValidationProvider>.value(
        value: widget.provider,
        child: ItemValidationSheet(item: item, pickPhoto: widget.pickPhoto),
      ),
    );
  }

  Future<void> _openStandarisasiSheet(
    SjValidationItem item, {
    required bool canCreate,
  }) async {
    await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => ChangeNotifierProvider<ValidationProvider>.value(
        value: widget.provider,
        child: StandarisasiSheet(item: item, canCreate: canCreate),
      ),
    );
  }

  Future<void> _confirmComplete(ValidationProvider provider) async {
    var items = provider.active?.items ?? const <SjValidationItem>[];
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
        backgroundColor: context.colors.surfaceCard,
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
                color: context.colors.textMuted,
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
                  color: context.colors.warningText,
                ),
              ),
            ],
            const SizedBox(height: AppTheme.space2),
            Text(
              'Email validasi terkirim ke BLC.',
              style: GoogleFonts.roboto(
                fontSize: 12.5,
                height: 1.4,
                color: context.colors.textSecondary,
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Kembali'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            style: FilledButton.styleFrom(
              backgroundColor: context.colors.success,
              foregroundColor: context.colors.textPrimary,
            ),
            child: const Text('Ya, Selesaikan'),
          ),
        ],
      ),
    );
    if ((confirmed ?? false) && mounted) {
      var completed = await provider.completeActive();
      if (completed && mounted) {
        // Selesai validasi → lanjutkan ke Check Out Point (Receiving/Bongkar).
        try {
          context.go('/bongkar');
        } catch (_) {
          // Route /bongkar mungkin belum terdaftar (misal dalam tes),
          // abaikan saja.
        }
      }
    }
  }

  // ---------------------------------------------------------------------
  // Shared small widgets
  // ---------------------------------------------------------------------

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
                color: context.colors.textSecondary.withValues(alpha: 0.07),
                borderRadius: AppTheme.radiusLg,
                border: Border.all(
                  color: context.colors.textSecondary.withValues(alpha: 0.08),
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
                color: highlight ? AppTheme.primary800 : context.colors.gray400,
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
                color: highlight
                    ? AppTheme.primary950
                    : context.colors.textMuted,
              ),
            ),
          ],
        ),
      );

  Widget _inlineWarning(String warning) => Container(
    width: double.infinity,
    padding: const EdgeInsets.all(AppTheme.space3),
    decoration: BoxDecoration(
      color: context.colors.warningDark,
      borderRadius: AppTheme.radiusLg,
      border: Border.all(
        color: context.colors.textSecondary.withValues(alpha: 0.1),
      ),
    ),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(Icons.lock_rounded, size: 16, color: context.colors.warningText),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            warning,
            style: GoogleFonts.roboto(
              fontSize: 12,
              height: 1.4,
              color: context.colors.warningText,
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
    child: FilledButton(
      onPressed: loading ? null : onPressed,
      style: FilledButton.styleFrom(
        backgroundColor: background,
        foregroundColor: foreground,
        disabledBackgroundColor: background.withValues(alpha: 0.4),
        disabledForegroundColor: foreground.withValues(alpha: 0.5),
        minimumSize: const Size(0, 48),
        side: outline
            ? BorderSide(color: context.colors.textMuted.withValues(alpha: 0.4))
            : null,
        shape: const RoundedRectangleBorder(borderRadius: AppTheme.radiusLg),
        textStyle: GoogleFonts.roboto(
          fontSize: 14,
          fontWeight: FontWeight.w800,
        ),
        elevation: 2,
        shadowColor: Theme.of(context).shadowColor,
      ),
      child: loading
          ? SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(
                strokeWidth: 2.5,
                color: foreground,
              ),
            )
          : Text(
              label,
              textAlign: TextAlign.center,
              overflow: TextOverflow.ellipsis,
              maxLines: 1,
            ),
    ),
  );

  static AppBadgeVariant _statusVariant(String status) => switch (status) {
    'IN_PROGRESS' => AppBadgeVariant.primary,
    'COMPLETED' => AppBadgeVariant.success,
    'CANCELLED' => AppBadgeVariant.danger,
    _ => AppBadgeVariant.gray,
  };

  static String _formatQty(double? value) {
    if (value == null) {
      return '-';
    }
    return value == value.truncateToDouble() ? '${value.toInt()}' : '$value';
  }

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
}
