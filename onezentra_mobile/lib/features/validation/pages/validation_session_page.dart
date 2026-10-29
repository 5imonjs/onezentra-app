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
import 'package:onezentra_mobile/features/validation/widgets/label_print_sheet.dart';
import 'package:onezentra_mobile/features/validation/widgets/validation_item_fields.dart';
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
      backgroundColor: AppTheme.background,
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
                  '$statusHeading • ${session.validatedCount}/${session.totalItemCount} ITEM',
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
                onPressed: () => Navigator.of(context).pop(),
                tooltip: 'Kembali',
                visualDensity: VisualDensity.compact,
                icon: Icon(
                  Icons.arrow_back_rounded,
                  size: 18,
                  color: Colors.white.withValues(alpha: 0.6),
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
                '$count produk belum dapat divalidasi sebelum BLC menyetujui '
                'standarisasinya. Tekan produk untuk input standarisasi.',
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
      color: AppTheme.ink900,
      borderRadius: AppTheme.radiusXl,
      border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
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
                      color: Colors.white,
                    ),
                  ),
                  Text(
                    '${items.length} pengajuan menunggu keputusan',
                    style: GoogleFonts.roboto(
                      fontSize: 11.5,
                      color: Colors.white.withValues(alpha: 0.6),
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
        color: Colors.white.withValues(alpha: 0.06),
        borderRadius: AppTheme.radiusLg,
        border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            item.namaBarang ?? '-',
            style: GoogleFonts.roboto(
              fontSize: 13,
              fontWeight: FontWeight.w800,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            '${item.kodeBarang} • Tier $tier × Tinggi $tinggi',
            style: GoogleFonts.roboto(
              fontSize: 11.5,
              color: Colors.white.withValues(alpha: 0.6),
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
                    foregroundColor: AppTheme.successText,
                    side: const BorderSide(color: AppTheme.success),
                    backgroundColor: AppTheme.successWell,
                    minimumSize: const Size(0, 40),
                    shape: const RoundedRectangleBorder(
                      borderRadius: AppTheme.radiusLg,
                    ),
                    textStyle: GoogleFonts.roboto(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  icon: const Icon(
                    Icons.check_rounded,
                    size: 16,
                    color: AppTheme.successText,
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
                    foregroundColor: AppTheme.dangerText,
                    side: const BorderSide(color: AppTheme.danger),
                    backgroundColor: AppTheme.dangerWell,
                    minimumSize: const Size(0, 40),
                    shape: const RoundedRectangleBorder(
                      borderRadius: AppTheme.radiusLg,
                    ),
                    textStyle: GoogleFonts.roboto(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  icon: const Icon(
                    Icons.close_rounded,
                    size: 16,
                    color: AppTheme.dangerText,
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
        backgroundColor: AppTheme.ink800,
        shape: const RoundedRectangleBorder(borderRadius: AppTheme.radiusXl),
        title: Text(
          approve ? 'Setujui standarisasi?' : 'Tolak standarisasi?',
          style: GoogleFonts.roboto(
            fontSize: 16,
            fontWeight: FontWeight.w800,
            color: Colors.white,
          ),
        ),
        content: Text(
          '${item.namaBarang} — Tier ${item.standarisasi?.tier ?? 0} × '
          'Tinggi ${item.standarisasi?.tinggiTumpukan ?? 0}',
          style: GoogleFonts.roboto(
            fontSize: 13,
            color: Colors.white.withValues(alpha: 0.9),
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
              backgroundColor: approve ? AppTheme.success : AppTheme.danger,
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

  // ---------------------------------------------------------------------
  // Items
  // ---------------------------------------------------------------------

  List<Widget> _buildItems(
    List<SjValidationItem> items, {
    required ValidationProvider provider,
    required bool canValidate,
    required bool canPrintLabels,
    required bool canCreateStandarisasi,
  }) => [
    for (var i = 0; i < items.length; i++) ...[
      _itemTile(
        items[i],
        provider: provider,
        canValidate: canValidate,
        canPrintLabels: canPrintLabels,
        canCreateStandarisasi: canCreateStandarisasi,
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
  }) {
    var locked = !item.canValidate;
    var tapAction = !canValidate || provider.actionBusy
        ? null
        : () => _onItemTap(item, canCreateStandarisasi: canCreateStandarisasi);

    return InkWell(
      onTap: tapAction,
      borderRadius: AppTheme.radiusLg,
      child: Container(
        padding: const EdgeInsets.all(AppTheme.space3),
        decoration: BoxDecoration(
          color: (!item.isPending && (item.batch?.isPrinted ?? false))
              ? AppTheme.success.withValues(alpha: 0.12)
              : Colors.white.withValues(alpha: 0.07),
          borderRadius: AppTheme.radiusLg,
          border: Border.all(
            color: locked
                ? AppTheme.warningText.withValues(alpha: 0.5)
                : Colors.white.withValues(alpha: 0.15),
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
                        ? AppTheme.warningDark.withValues(alpha: 0.4)
                        : item.isPending
                        ? Colors.white.withValues(alpha: 0.1)
                        : AppTheme.success.withValues(alpha: 0.2),
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
                        ? AppTheme.warningText
                        : item.isPending
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
                        item.namaBarang ??
                            item.kodeBarang ??
                            'Item #${item.id}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.roboto(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: Colors.white.withValues(
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
                          color: AppTheme.gray400.withValues(
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
                            color: AppTheme.warningDark,
                            borderRadius: AppTheme.radiusFull,
                            border: Border.all(color: AppTheme.warningText),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(
                                Icons.error_outline_rounded,
                                size: 11,
                                color: AppTheme.warningText,
                              ),
                              const SizedBox(width: 4),
                              Text(
                                item.standarisasi?.status == 'pending'
                                    ? 'SUDAH DIJUKAN BLC'
                                    : 'BELUM ADA STANDARISASI',
                                style: GoogleFonts.roboto(
                                  fontSize: 9,
                                  fontWeight: FontWeight.w700,
                                  color: AppTheme.warningText,
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
                            item.standarisasi?.status == 'pending'
                                ? 'Standarisasi sudah diajukan — menunggu approve BLC'
                                : 'Belum ada standarisasi tumpukan — ajukan dulu',
                            style: GoogleFonts.roboto(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: AppTheme.warning,
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
                                  ? AppTheme.danger
                                  : AppTheme.success,
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
  }) async {
    if (_isTapping) {
      return;
    }
    _isTapping = true;

    try {
      if (item.canValidate) {
        await _openItemSheet(item);
        return;
      }
      // BLC belum menyetujui standarisasi untuk produk ini. Tampilkan pop-up
      // konfirmasi sebelum mengarahkan operator ke input standarisasi.
      var confirmed = await showDialog<bool>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          backgroundColor: AppTheme.surfaceCard,
          title: Text(
            'Produk Belum Disetujui BLC',
            style: GoogleFonts.roboto(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: AppTheme.foreground,
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
                  color: AppTheme.gray600,
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
                    color: AppTheme.warning,
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
                    color: AppTheme.warning,
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
                  backgroundColor: AppTheme.warningText,
                  foregroundColor: AppTheme.ink900,
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
      color: AppTheme.ink900,
      borderRadius: AppTheme.radiusXl,
      border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
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
                color: AppTheme.warning.withValues(alpha: 0.18),
                borderRadius: AppTheme.radiusLg,
              ),
              child: const Icon(
                Icons.inventory_2_rounded,
                size: 18,
                color: AppTheme.warning,
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
                      color: Colors.white,
                    ),
                  ),
                  Text(
                    '${session.extraItems.length} catatan — rencana tidak diubah, planner diberi tahu',
                    style: GoogleFonts.roboto(
                      fontSize: 11,
                      height: 1.4,
                      color: AppTheme.gray500,
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
            background: AppTheme.warning,
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
      'APPROVED' => ('Disetujui', AppTheme.success),
      'REJECTED' => ('Ditolak', AppTheme.danger),
      _ => ('Menunggu persetujuan', AppTheme.warning),
    };
    // Paritas tanda tercetak: label yang sudah dilaporkan menandai tile
    // hijau seperti tile item rencana kirim.
    var printed = item.canPrint && (item.batch?.isPrinted ?? false);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AppTheme.space3),
      decoration: BoxDecoration(
        color: printed
            ? AppTheme.success.withValues(alpha: 0.12)
            : Colors.white.withValues(alpha: 0.06),
        borderRadius: AppTheme.radiusLg,
        border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
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
                          color: Colors.white,
                        ),
                      ),
                    ),
                    TextButton(
                      onPressed: () => _showExtraItemSheet(provider, item: item),
                      style: TextButton.styleFrom(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        backgroundColor: Colors.white.withValues(alpha: 0.1),
                      ),
                      child: const Text('Detail Validasi', style: TextStyle(fontSize: 10, color: Colors.white70)),
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
                  color: item.condition == 'FISIK_TIDAK_ADA' ? AppTheme.danger.withValues(alpha: 0.15) : AppTheme.warning.withValues(alpha: 0.15),
                  borderRadius: AppTheme.radiusFull,
                ),
                child: Text(
                  '${_formatQty(item.qty)}${item.satuan != null ? ' ${item.satuan}' : ''}',
                  style: GoogleFonts.roboto(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: item.condition == 'FISIK_TIDAK_ADA' ? AppTheme.danger : AppTheme.warning,
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
              color: AppTheme.gray400,
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
                  foregroundColor: Colors.white,
                  side: const BorderSide(color: AppTheme.primary600),
                  backgroundColor: AppTheme.surfaceHover,
                  minimumSize: const Size(0, 44),
                  shape: const RoundedRectangleBorder(
                    borderRadius: AppTheme.radiusLg,
                  ),
                  textStyle: GoogleFonts.roboto(
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                icon: const Icon(
                  Icons.print_rounded,
                  size: 18,
                  color: Colors.white,
                ),
                label: Text(
                  item.batch?.isPrinted == true ? 'Cetak Ulang' : 'Cetak Label',
                  style: const TextStyle(color: Colors.white),
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
                      foregroundColor: AppTheme.successText,
                      side: const BorderSide(color: AppTheme.success),
                      backgroundColor: AppTheme.successWell,
                      minimumSize: const Size(0, 44),
                      shape: const RoundedRectangleBorder(
                        borderRadius: AppTheme.radiusLg,
                      ),
                      textStyle: GoogleFonts.roboto(
                        fontSize: 13,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    icon: const Icon(
                      Icons.check_rounded,
                      size: 18,
                      color: AppTheme.successText,
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
                      foregroundColor: AppTheme.dangerText,
                      side: const BorderSide(color: AppTheme.danger),
                      backgroundColor: AppTheme.dangerWell,
                      minimumSize: const Size(0, 44),
                      shape: const RoundedRectangleBorder(
                        borderRadius: AppTheme.radiusLg,
                      ),
                      textStyle: GoogleFonts.roboto(
                        fontSize: 13,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    icon: const Icon(
                      Icons.close_rounded,
                      size: 18,
                      color: AppTheme.dangerText,
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
          backgroundColor: AppTheme.ink800,
          shape: const RoundedRectangleBorder(borderRadius: AppTheme.radiusXl),
          title: Text(
            approve
                ? 'Setujui barang luar rencana?'
                : 'Tolak barang luar rencana?',
            style: GoogleFonts.roboto(
              fontSize: 16,
              fontWeight: FontWeight.w800,
              color: Colors.white,
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
                  color: Colors.white.withValues(alpha: 0.9),
                ),
              ),
              const SizedBox(height: AppTheme.space3),
              TextField(
                controller: notesController,
                maxLines: 3,
                autofocus: !approve,
                style: const TextStyle(color: Colors.white, fontSize: 13),
                decoration: InputDecoration(
                  hintText: approve
                      ? 'Catatan (opsional)'
                      : 'Alasan penolakan (wajib)',
                  hintStyle: TextStyle(
                    color: Colors.white.withValues(alpha: 0.4),
                    fontSize: 13,
                  ),
                  errorText: notesError
                      ? 'Alasan penolakan wajib diisi.'
                      : null,
                  enabledBorder: OutlineInputBorder(
                    borderRadius: AppTheme.radiusLg,
                    borderSide: BorderSide(
                      color: Colors.white.withValues(alpha: 0.2),
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
                backgroundColor: approve ? AppTheme.success : AppTheme.danger,
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
    var date = DateTime.tryParse(value);
    if (date == null) {
      return value;
    }
    String two(int part) => part.toString().padLeft(2, '0');
    return '${two(date.day)}/${two(date.month)}/${date.year}';
  }

  Future<void> _showExtraItemSheet(ValidationProvider provider, {SjValidationExtraItem? item}) async {
    if (provider.actionBusy) {
      return;
    }
    await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => ChangeNotifierProvider<ValidationProvider>.value(
        value: widget.provider,
        child: _ExtraItemSheet(pickPhoto: widget.pickPhoto, item: item),
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
        .where((item) => !item.isPending && item.condition != 'FISIK_TIDAK_ADA' && !item.hasExpiredDate)
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
          background: AppTheme.success,
          foreground: AppTheme.ink900,
          loading: provider.actionBusy,
          onPressed: blocked ? null : () => _confirmComplete(provider),
        ),
        if (blocked) ...[
          const SizedBox(height: AppTheme.space2),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(AppTheme.space3),
            decoration: BoxDecoration(
              color: AppTheme.warningDark,
              borderRadius: AppTheme.radiusLg,
              border: Border.all(color: AppTheme.warningText),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(
                  Icons.warning_rounded,
                  size: 16,
                  color: AppTheme.warningText,
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
                      color: AppTheme.warning,
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
        backgroundColor: AppTheme.success,
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

  Widget _standarisasiButton(
    SjValidationItem item,
    ValidationProvider provider, {
    required bool canCreate,
  }) => FilledButton.icon(
    onPressed: provider.actionBusy
        ? null
        : () => _openStandarisasiSheet(item, canCreate: canCreate),
    style: FilledButton.styleFrom(
      backgroundColor: AppTheme.warningText,
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
      foregroundColor: Colors.white,
      side: const BorderSide(color: AppTheme.primary600),
      backgroundColor: AppTheme.surfaceHover,
      minimumSize: const Size(0, 44),
      padding: const EdgeInsets.symmetric(horizontal: AppTheme.space4),
      shape: const RoundedRectangleBorder(borderRadius: AppTheme.radiusLg),
      textStyle: GoogleFonts.roboto(fontSize: 13, fontWeight: FontWeight.w800),
    ),
    icon: const Icon(Icons.description_rounded, size: 18, color: Colors.white),
    label: const Text('Detail Validasi', style: TextStyle(color: Colors.white)),
  );

  Widget _printLabelButton(SjValidationItem item) => OutlinedButton.icon(
    onPressed: () => _openPrintSheet(item),
    style: OutlinedButton.styleFrom(
      foregroundColor: Colors.white,
      side: const BorderSide(color: AppTheme.primary600),
      backgroundColor: AppTheme.surfaceHover,
      minimumSize: const Size(0, 44),
      padding: const EdgeInsets.symmetric(horizontal: AppTheme.space4),
      shape: const RoundedRectangleBorder(borderRadius: AppTheme.radiusLg),
      textStyle: GoogleFonts.roboto(fontSize: 13, fontWeight: FontWeight.w800),
    ),
    icon: const Icon(Icons.print_rounded, size: 18, color: Colors.white),
    label: Text(
      item.batch?.isPrinted == true ? 'Cetak Ulang' : 'Cetak Label',
      style: const TextStyle(color: Colors.white),
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
          const SnackBar(
            content: Text(
              'Item belum memiliki batch. Silakan validasi ulang atau coba lagi.',
            ),
            backgroundColor: AppTheme.warning,
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
          const SnackBar(
            content: Text(
              'Catatan belum disetujui planner — label tersedia setelah disetujui.',
            ),
            backgroundColor: AppTheme.warning,
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
      // Paritas web: laporan "tercetak" dikirim saat tombol cetak ditekan
      // (di dalam sheet), bukan hanya saat cetak sukses — dulu hasil cetak
      // yang salah dibaca membuat laporan tidak pernah terkirim dan status
      // web tidak berubah.
      onPrintAttempted: () async {
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
          backgroundColor: reportFailed ? AppTheme.warning : AppTheme.success,
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
        child: _ItemValidationSheet(item: item, pickPhoto: widget.pickPhoto),
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
        child: _StandarisasiSheet(item: item, canCreate: canCreate),
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
            ? BorderSide(color: Colors.white.withValues(alpha: 0.4))
            : null,
        shape: const RoundedRectangleBorder(borderRadius: AppTheme.radiusLg),
        textStyle: GoogleFonts.roboto(
          fontSize: 14,
          fontWeight: FontWeight.w800,
        ),
        elevation: 2,
        shadowColor: Colors.black.withValues(alpha: 0.5),
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

/// Bottom sheet untuk memvalidasi satu baris: qty aktual, kondisi, expired.
///
/// Digunakan oleh [ValidationSessionPage]; provider di-expose ulang melalui
/// [ChangeNotifierProvider.value] agar `context.read` di dalam sheet tidak
/// melempar ProviderNotFoundException.
class _ItemValidationSheet extends StatefulWidget {
  const _ItemValidationSheet({required this.item, this.pickPhoto});
  final SjValidationItem item;
  final Future<String?> Function({required bool fromCamera})? pickPhoto;

  @override
  State<_ItemValidationSheet> createState() => _ItemValidationSheetState();
}

class _ItemValidationSheetState extends State<_ItemValidationSheet> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _qtyController = TextEditingController(
    text: _initialActualQty(widget.item),
  );
  final _barcodeController = TextEditingController();
  final _notesController = TextEditingController();
  final _expiredController = TextEditingController();
  String _condition = 'FISIK_BAGUS';
  DateTime? _expiredDate;
  String? _photoPath;
  bool _saving = false;
  String? _error;

  static String _initialActualQty(SjValidationItem item) {
    var value = item.actualQty;
    if (value == null) {
      return '';
    }
    return value == value.truncateToDouble() ? '${value.toInt()}' : '$value';
  }

  @override
  void initState() {
    super.initState();
    _barcodeController.text = widget.item.barcode ?? '';
    _notesController.text = widget.item.notes ?? '';
    _condition = ValidationCondition.values.contains(widget.item.condition)
        ? widget.item.condition
        : 'FISIK_BAGUS';
    _expiredDate = DateTime.tryParse(widget.item.expiredDate ?? '');
    _expiredController.text = formatDateId(_expiredDate);
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
                if (_condition != 'FISIK_TIDAK_ADA') ...[
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
                    if (_condition == 'FISIK_TIDAK_ADA') {
                      return null;
                    }
                    var qty = double.tryParse(
                      (value ?? '').replaceAll(',', '.'),
                    );
                    if (qty == null || qty < 0) {
                      return 'Isi qty aktual dengan angka ≥ 0';
                    }
                    return null;
                  },
                ),
                ],
                const SizedBox(height: AppTheme.space3),
                Text(
                  'Kondisi',
                  style: Theme.of(context).textTheme.labelLarge?.copyWith(
                    fontWeight: FontWeight.w600,
                    color: AppTheme.gray700,
                  ),
                ),
                const SizedBox(height: AppTheme.space2),
                ConditionChipRow(
                  value: _condition,
                  onChanged: (value) => setState(() => _condition = value),
                ),
                if (ValidationCondition.requiresPhoto.contains(_condition))
                  Padding(
                    padding: const EdgeInsets.only(top: AppTheme.space3),
                    child: PhotoEvidenceField(
                      photoPath: _photoPath,
                      onChanged: (path) => setState(() => _photoPath = path),
                      picker: widget.pickPhoto,
                      enabled: !_saving,
                    ),
                  ),
                if (_condition != 'FISIK_TIDAK_ADA') ...[
                  const SizedBox(height: AppTheme.space3),
                  ExpiredDateField(
                    controller: _expiredController,
                    onPicked: _onExpiredPicked,
                    validator: (_) => (_condition == 'FISIK_TIDAK_ADA' || _expiredDate != null) ? null : 'Tanggal expired wajib diisi',
                  ),
                ],
                const SizedBox(height: AppTheme.space3),
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

  /// Tanggal expired dipilih dari picker bersama — simpan, perbarui teks
  /// field, lalu validasi ulang form supaya pesan "wajib diisi" hilang.
  void _onExpiredPicked(DateTime? picked) {
    if (picked == null) {
      return;
    }
    setState(() {
      _expiredDate = picked;
      _expiredController.text = formatDateId(picked);
    });
    _formKey.currentState?.validate();
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
    // FISIK_TIDAK_ADA: qty otomatis 0, expired tidak wajib.
    if (_condition == 'FISIK_TIDAK_ADA') {
      _qtyController.text = '0';
      _expiredController.clear();
      _expiredDate = null;
    }
    if (_condition != 'FISIK_TIDAK_ADA' && _expiredDate == null) {
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
      actualQty: _condition == 'FISIK_TIDAK_ADA' ? 0.0 : double.parse(_qtyController.text.trim().replaceAll(',', '.')),
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

/// Bottom sheet untuk mencatat barang di luar rencana kirim (deviation
/// record).
///
/// Berbeda dari [_ItemValidationSheet]: baris ini tidak terikat item rencana,
/// foto bukti selalu wajib (menggantikan catatan kertas), dan rencana tidak
/// pernah diubah — planner diberi tahu via email oleh server.
/// Bottom sheet untuk mencatat barang di luar rencana kirim (deviation
/// record).
///
/// Pola input mengikuti [_ItemValidationSheet]: identitas barang diambil dari
/// master NPN (barcode dipindai/diketik lalu dicocokkan lewat pencarian NPN —
/// pola combobox Rencana Kirim web), lalu jumlah, kondisi (chips bersama),
/// foto bukti (widget bersama), tanggal expired (picker bersama). Rencana
/// tidak pernah diubah — planner diberi tahu via email oleh server.
class _ExtraItemSheet extends StatefulWidget {
  const _ExtraItemSheet({this.pickPhoto, this.item});

  /// Overrides ImagePicker untuk test.
  final Future<String?> Function({required bool fromCamera})? pickPhoto;
  final SjValidationExtraItem? item;

  @override
  State<_ExtraItemSheet> createState() => _ExtraItemSheetState();
}

class _ExtraItemSheetState extends State<_ExtraItemSheet> {
  final _formKey = GlobalKey<FormState>();
  final _qtyController = TextEditingController();
  final _searchController = TextEditingController();
  final _kodeController = TextEditingController();
  final _namaController = TextEditingController();
  final _satuanController = TextEditingController();
  final _notesController = TextEditingController();
  final _expiredController = TextEditingController();
  String _condition = 'FISIK_BAGUS';
  DateTime? _expiredDate;
  String? _photoPath;
  bool _saving = false;
  String? _error;

  /// Produk master NPN yang terpilih — identitas & satuan dikunci ke master,
  /// field manual disembunyikan. null = mode manual bebas.
  NpnProduct? _npn;
  bool _searching = false;

  /// Hasil pencarian nama di master NPN — operator memilih satu; kosong =
  /// lanjut manual. Dibatasi 5 supaya daftar singkat di layar kecil.
  List<NpnProduct> _suggestions = [];
  Timer? _searchDebounce;

  @override
  void initState() {
    super.initState();
    var item = widget.item;
    if (item != null) {
      _qtyController.text = item.qty.toString();
      _condition = item.condition;
      _notesController.text = item.notes ?? '';
      if (item.expiredDate != null) {
        _expiredDate = DateTime.tryParse(item.expiredDate ?? '');
        _expiredController.text = formatDateId(_expiredDate);
      }
    }
  }

  @override
  void dispose() {
    _qtyController.dispose();
    _searchController.dispose();
    _kodeController.dispose();
    _namaController.dispose();
    _satuanController.dispose();
    _notesController.dispose();
    _expiredController.dispose();
    _searchDebounce?.cancel();
    super.dispose();
  }

  /// Identitas barang sah bila terkunci ke master NPN atau kode + nama manual
  /// lengkap. Server tetap memvalidasi ulang.
  bool get _identityValid =>
      _npn != null ||
      (_kodeController.text.trim().isNotEmpty &&
          _namaController.text.trim().isNotEmpty);

  @override
  Widget build(BuildContext context) => Container(
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
                'Barang luar rencana',
                style: GoogleFonts.roboto(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: AppTheme.foreground,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                'Barang dibawa transporter tapi tidak ada di rencana. '
                'Foto bukti wajib; rencana tidak diubah.',
                style: GoogleFonts.roboto(
                  fontSize: 12,
                  height: 1.4,
                  color: AppTheme.gray500,
                ),
              ),
              const SizedBox(height: AppTheme.space4),
              // Identitas dulu — ketik nama barang, kode & satuan terisi
              // otomatis dari master NPN (pola combobox Rencana Kirim web),
              // seperti modal Validasi Item yang identitasnya tampil lebih
              // dulu sebelum form pemeriksaan. Tanpa barcode agar input
              // lebih cepat.
              AppTextField(
                controller: _searchController,
                label: 'Nama barang',
                hint: 'Ketik nama barang dari master NPN',
                prefixIcon: Icons.search_rounded,
                onChanged: _onSearchChanged,
              ),
              const SizedBox(height: AppTheme.space2),
              if (_searching)
                const Padding(
                  padding: EdgeInsets.all(AppTheme.space3),
                  child: SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                )
              else if (_suggestions.isNotEmpty)
                Container(
                  margin: const EdgeInsets.only(top: AppTheme.space2),
                  decoration: BoxDecoration(
                    color: AppTheme.surfaceCard,
                    borderRadius: AppTheme.radiusLg,
                    border: Border.all(color: AppTheme.gray300),
                  ),
                  child: Column(
                    children: [
                      for (var (index, product) in _suggestions.indexed) ...[
                        if (index > 0)
                          const Divider(height: 1, color: AppTheme.gray300),
                        _NpnSuggestionTile(
                          product: product,
                          enabled: !_saving,
                          onTap: () => _selectNpn(product),
                        ),
                      ],
                    ],
                  ),
                )
              else if (_searchController.text.trim().length >= 2 && !_saving)
                Padding(
                  padding: const EdgeInsets.only(
                    top: AppTheme.space2,
                    bottom: AppTheme.space2,
                  ),
                  child: Text(
                    'Tidak ada di master NPN — isi kode & nama manual di bawah.',
                    style: GoogleFonts.roboto(
                      fontSize: 12,
                      color: AppTheme.gray500,
                    ),
                  ),
                ),
              const SizedBox(height: AppTheme.space3),
              if (_npn != null)
                _npnIdentityCard()
              else ...[
                AppTextField(
                  controller: _kodeController,
                  label: 'Kode barang *',
                  hint: 'Wajib bila barcode tidak dikenal',
                  prefixIcon: Icons.tag_rounded,
                  textInputAction: TextInputAction.next,
                  autovalidateMode: AutovalidateMode.onUserInteraction,
                  validator: (value) => _identityValid
                      ? null
                      : 'Isi kode & nama barang, atau barcode yang dikenal',
                ),
                const SizedBox(height: AppTheme.space3),
                AppTextField(
                  controller: _namaController,
                  label: 'Nama barang *',
                  hint: 'Wajib bila barcode tidak dikenal',
                  prefixIcon: Icons.abc_rounded,
                  textInputAction: TextInputAction.next,
                  autovalidateMode: AutovalidateMode.onUserInteraction,
                  validator: (value) => _identityValid
                      ? null
                      : 'Isi kode & nama barang, atau barcode yang dikenal',
                ),
                const SizedBox(height: AppTheme.space3),
                AppTextField(
                  controller: _satuanController,
                  label: 'Satuan',
                  hint: 'CRT / ZAK / PCS',
                  prefixIcon: Icons.square_foot_rounded,
                  textInputAction: TextInputAction.next,
                ),
              ],
              const SizedBox(height: AppTheme.space3),
              AppTextField(
                controller: _qtyController,
                label: 'Jumlah *',
                hint: _npn?.satuan == null ? '0' : '0 ($_npnSatuan)',
                prefixIcon: Icons.inventory_rounded,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                textInputAction: TextInputAction.next,
                // Merah hilang begitu angka sah — dulu error menempel
                // sampai Simpan ditekan ulang walau jumlah sudah diisi.
                autovalidateMode: AutovalidateMode.onUserInteraction,
                validator: (value) {
                  var qty = double.tryParse((value ?? '').replaceAll(',', '.'));
                  if (qty == null || qty <= 0) {
                    return 'Isi jumlah dengan angka > 0';
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
              ConditionChipRow(
                value: _condition,
                onChanged: (value) => setState(() => _condition = value),
              ),
              const SizedBox(height: AppTheme.space3),
              PhotoEvidenceField(
                photoPath: _photoPath,
                onChanged: (path) => setState(() => _photoPath = path),
                picker: widget.pickPhoto,
                enabled: !_saving,
                subtitle: 'Wajib — menggantikan catatan manual di kertas.',
              ),
              const SizedBox(height: AppTheme.space3),
              ExpiredDateField(
                controller: _expiredController,
                isRequired: false,
                onPicked: (picked) {
                  if (picked == null) {
                    return;
                  }
                  setState(() {
                    _expiredDate = picked;
                    _expiredController.text = formatDateId(picked);
                  });
                },
              ),
              const SizedBox(height: AppTheme.space3),
              AppTextField(
                controller: _notesController,
                label: 'Catatan',
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
                text: 'Laporkan',
                isLoading: _saving,
                onPressed: _saving || _photoPath == null ? null : _save,
              ),
            ],
          ),
        ),
      ),
    ),
  );

  String get _npnSatuan => _npn?.satuan ?? '';

  /// Kartu identitas terkunci ke master NPN — menampilkan nama, kode, dan
  /// satuan dari master; tombol membuka kunci untuk kembali ke mode manual.
  Widget _npnIdentityCard() => Container(
    width: double.infinity,
    padding: const EdgeInsets.all(AppTheme.space3),
    decoration: BoxDecoration(
      color: AppTheme.surfaceCard,
      borderRadius: AppTheme.radiusLg,
      border: Border.all(color: AppTheme.primary500),
    ),
    child: Row(
      children: [
        Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            color: AppTheme.primary500.withValues(alpha: 0.12),
            borderRadius: AppTheme.radiusLg,
          ),
          child: const Icon(
            Icons.inventory_2_rounded,
            color: AppTheme.primary500,
            size: 20,
          ),
        ),
        const SizedBox(width: AppTheme.space3),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                _npn!.displayName,
                style: GoogleFonts.roboto(
                  fontSize: 13.5,
                  fontWeight: FontWeight.w700,
                  color: AppTheme.foreground,
                ),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 2),
              Text(
                '${_npn!.kodeBarang ?? '-'}'
                '${_npn!.satuan != null ? ' • Satuan ${_npn!.satuan}' : ''}',
                style: GoogleFonts.robotoMono(
                  fontSize: 11.5,
                  color: AppTheme.gray600,
                ),
              ),
            ],
          ),
        ),
        IconButton(
          tooltip: 'Ganti barang',
          icon: const Icon(Icons.close_rounded, size: 18),
          color: AppTheme.gray500,
          onPressed: _saving
              ? null
              : () => setState(() {
                  _npn = null;
                  _searchController.clear();
                  _kodeController.clear();
                  _namaController.clear();
                  _satuanController.clear();
                }),
        ),
      ],
    ),
  );

  /// Pencarian nama barang di master NPN dengan debounce — hasil menjadi
  /// daftar saran di bawah field. Pencarian gagal (mis. offline) hanya
  /// menyembunyikan saran: operator lanjut manual, form tidak pernah terkunci.
  void _onSearchChanged(String query) {
    _searchDebounce?.cancel();
    var trimmed = query.trim();
    if (trimmed.length < 2) {
      setState(() {
        _searching = false;
        _suggestions = [];
      });
      return;
    }
    _searchDebounce = Timer(const Duration(milliseconds: 350), () async {
      setState(() => _searching = true);
      var products = await context.read<ValidationProvider>().searchProduct(
        trimmed,
      );
      if (!mounted) {
        return;
      }
      setState(() {
        _searching = false;
        _suggestions = products.take(5).toList();
      });
    });
  }

  /// Pilih produk dari daftar saran — identitas terkunci ke master NPN:
  /// kode & satuan terisi otomatis, field manual disembunyikan.
  void _selectNpn(NpnProduct product) {
    setState(() {
      _npn = product;
      _suggestions = [];
      _searchController.text = product.displayName;
      _kodeController.text = product.kodeBarang ?? '';
      _namaController.text = product.displayName;
      _satuanController.text = product.satuan ?? '';
      _error = null;
    });
    _formKey.currentState?.validate();
  }

  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false)) {
      return;
    }
    if (!_identityValid) {
      setState(
        () => _error =
            'Isi barcode yang dikenal, atau kode + nama barang manual.',
      );
      return;
    }
    if (_photoPath == null) {
      setState(
        () => _error =
            'Foto bukti wajib. Ambil foto langsung atau pilih dari galeri.',
      );
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    var provider = context.read<ValidationProvider>();
    var success = await provider.reportExtraItem(
      npnId: _npn?.id,
      // Bila terkunci ke master, identitas dipegang npn_id — server menimpa
      // nilai manual dengan master, jadi nilai manual tidak dikirim.
      kodeBarang: _npn != null
          ? null
          : _kodeController.text.trim().isEmpty
          ? null
          : _kodeController.text.trim(),
      namaBarang: _npn != null
          ? null
          : _namaController.text.trim().isEmpty
          ? null
          : _namaController.text.trim(),
      qty: double.parse(_qtyController.text.trim().replaceAll(',', '.')),
      satuan: _npn != null
          ? null
          : _satuanController.text.trim().isEmpty
          ? null
          : _satuanController.text.trim(),
      condition: _condition,
      expiredDate: _expiredDate == null
          ? null
          : '${_expiredDate!.year.toString().padLeft(4, '0')}-'
                '${_expiredDate!.month.toString().padLeft(2, '0')}-'
                '${_expiredDate!.day.toString().padLeft(2, '0')}',
      notes: _notesController.text.trim().isEmpty
          ? null
          : _notesController.text.trim(),
      photoPath: _photoPath!,
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
            provider.message?.message ?? 'Gagal melaporkan. Silakan coba lagi.';
      });
    }
  }
}

/// Satu baris saran hasil pencarian nama di master NPN — menampilkan nama
/// (dan kode) sehingga operator mengetuk pilihan yang benar tanpa membuka
/// keyboard numerik atau memindai apa pun.
class _NpnSuggestionTile extends StatelessWidget {
  const _NpnSuggestionTile({
    required this.product,
    required this.onTap,
    this.enabled = true,
  });

  final NpnProduct product;
  final VoidCallback onTap;
  final bool enabled;

  @override
  Widget build(BuildContext context) => InkWell(
    onTap: enabled ? onTap : null,
    child: Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: AppTheme.space3,
        vertical: AppTheme.space2,
      ),
      child: Row(
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: AppTheme.primary500.withValues(alpha: 0.12),
              borderRadius: AppTheme.radiusLg,
            ),
            child: const Icon(
              Icons.inventory_2_rounded,
              color: AppTheme.primary500,
              size: 18,
            ),
          ),
          const SizedBox(width: AppTheme.space3),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  product.displayName,
                  style: GoogleFonts.roboto(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.foreground,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                if (product.kodeBarang != null)
                  Text(
                    product.kodeBarang!,
                    style: GoogleFonts.robotoMono(
                      fontSize: 11,
                      color: AppTheme.gray600,
                    ),
                  ),
              ],
            ),
          ),
          const Icon(
            Icons.chevron_right_rounded,
            size: 18,
            color: AppTheme.gray500,
          ),
        ],
      ),
    ),
  );
}

/// Bottom sheet untuk input standarisasi tumpukan satu produk.
class _StandarisasiSheet extends StatefulWidget {
  const _StandarisasiSheet({required this.item, required this.canCreate});
  final SjValidationItem item;
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
                          if (item.npnId != null)
                            Text(
                              'NPN: #${item.npnId}',
                              style: GoogleFonts.robotoMono(
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
