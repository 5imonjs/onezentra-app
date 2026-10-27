import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import 'package:onezentra_mobile/core/printer/thermal_label.dart';
import 'package:onezentra_mobile/core/theme/app_theme.dart';
import 'package:onezentra_mobile/features/auth/providers/auth_provider.dart';
import 'package:onezentra_mobile/features/validation/models/validation_models.dart';
import 'package:onezentra_mobile/features/validation/providers/validation_provider.dart';
import 'package:onezentra_mobile/features/validation/widgets/label_print_sheet.dart';
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

    var unapprovedItems = session.items
        .where((item) => item.isPending && !item.canValidate)
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
              const SizedBox(height: AppTheme.space2),
              ..._buildItems(
                session.items,
                provider: provider,
                canValidate: canValidate,
                canPrintLabels: canPrintLabels,
                canCreateStandarisasi: canCreateStandarisasi,
              ),
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

  Widget _buildCompleteSection(
    SjValidation session,
    ValidationProvider provider, {
    required bool canComplete,
  }) {
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
                        : 'Cetak label $unprinted item di atas — tombol aktif setelah semua dilaporkan tercetak.',
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
    final batch = item.batch;
    // Hanya boleh cetak kalau server sudah issued batch untuk item ini.
    if (batch == null || batch.id == 0) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Item belum memiliki batch. Silakan validasi ulang atau coba lagi.'),
            backgroundColor: AppTheme.warning,
          ),
        );
      }
      return;
    }
    var printed = await LabelPrintSheet.show(
      context,
      label: BatchLabelData(
        batchId: batch!.id,
        batchNumber: batch?.batchNumber,
        barcodeLabel: batch.barcodeLabel,
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
      // Segera refresh provider agar status badge cetak berubah dan
      // tombol Selesaikan dapat aktif jika semua label sudah tercetak.
      if (mounted) {
        // ignore: use_build_context_synchronously
        var v = context.read<ValidationProvider>();
        await v.openSession(v.active?.id ?? 0);
        // Force rebuild so batch/printed status updates visibly
        if (mounted) setState(() {});
      }
      // ignore: use_build_context_synchronously
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
  bool _pickingPhoto = false;
  bool _saving = false;
  String? _error;
  String? _photoError;

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
      debugPrint(
        'ValidationSessionPage._pickPhoto: ${error.runtimeType}: $error',
      );
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
    var initial = _expiredDate ?? DateTime.now().add(const Duration(days: 30));
    DateTime? picked;
    await showCupertinoModalPopup(
      context: context,
      builder: (_) => Container(
        height: 260,
        padding: const EdgeInsets.all(AppTheme.space4),
        color: AppTheme.surface,
        child: Column(
          children: [
            Container(
              width: 40,
              height: 4,
              decoration: const BoxDecoration(
                color: AppTheme.gray300,
                borderRadius: AppTheme.radiusFull,
              ),
            ),
            Expanded(
              child: CupertinoDatePicker(
                mode: CupertinoDatePickerMode.date,
                initialDateTime: initial,
                minimumDate: DateTime(2000),
                maximumDate: DateTime(2100),
                onDateTimeChanged: (DateTime value) => picked = value,
                backgroundColor: AppTheme.surface,
              ),
            ),
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: AppTheme.space3),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    TextButton(
                      onPressed: () => Navigator.of(context).pop(),
                      child: const Text('Batal'),
                    ),
                    FilledButton(
                      onPressed: () => Navigator.of(context).pop(),
                      style: FilledButton.styleFrom(
                        backgroundColor: AppTheme.primary500,
                      ),
                      child: const Text('Pilih'),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
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
