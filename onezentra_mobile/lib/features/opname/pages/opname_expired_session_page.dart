import 'dart:async';

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import 'package:onezentra_mobile/core/theme/app_theme.dart';
import 'package:onezentra_mobile/features/auth/providers/auth_provider.dart';
import 'package:onezentra_mobile/features/opname/models/opname_expired_session_models.dart';
import 'package:onezentra_mobile/features/opname/providers/opname_expired_session_provider.dart';
import 'package:onezentra_mobile/features/opname/repositories/opname_expired_session_repository.dart';
import 'package:onezentra_mobile/shared/widgets/app_widgets.dart';

AppBadgeVariant _sessionBadgeVariant(String status) => switch (status) {
  'OPEN' => AppBadgeVariant.info,
  'IN_PROGRESS' => AppBadgeVariant.primary,
  'PENDING_APPROVAL' => AppBadgeVariant.warning,
  'APPROVED' => AppBadgeVariant.success,
  'COMPLETED' => AppBadgeVariant.success,
  'REVISI' => AppBadgeVariant.warning,
  'CANCELLED' => AppBadgeVariant.gray,
  _ => AppBadgeVariant.gray,
};

/// Kondisi fisik batch — sejajar `ReceivingItem::CONDITIONS` backend.
/// (Label ini dipakai untuk menampilkan kondisi terima analisa; pilihan
/// kondisi di sheet dihapus — mobile selalu mengirim FISIK_BAGUS.)
const Map<String, String> _conditionLabels = {
  'FISIK_BAGUS': 'Fisik bagus',
  'FISIK_RUSAK': 'Fisik rusak',
  'QTY_KURANG': 'Qty kurang',
  'ISI_KEMASAN_KURANG': 'Isi kemasan kurang',
  'EXPIRED_TIDAK_STANDAR': 'Expired tidak standar',
  'LAINNYA': 'Lainnya',
};

String _conditionLabel(String? condition) =>
    _conditionLabels[condition?.trim().toUpperCase()] ?? condition ?? '-';

String _dispositionLabel(String? value) => switch (value) {
  'LANJUT' => 'Lanjut',
  'RETUR' => 'Retur',
  'DISPOSAL' => 'Disposal',
  _ => value ?? '-',
};

String _formatQty(double? value) {
  if (value == null) {
    return '-';
  }
  return value == value.truncateToDouble()
      ? value.toInt().toString()
      : value.toString();
}

/// Format tanggal tampilan dd/MM/yyyy — baku warga gudang; input tetap ISO
/// dari backend (yyyy-MM-dd), fallback string asli bila tak terurai.
String _dateOut(DateTime parsed) => DateFormat('dd/MM/yyyy').format(parsed);

String _formatDate(String? iso) {
  var raw = iso?.trim();
  if (raw == null || raw.isEmpty) {
    return '-';
  }
  var parsed = DateTime.tryParse(raw);
  return parsed != null ? _dateOut(parsed) : raw;
}

/// Durasi menit–detik: "1 j 04 mnt 05 dtk", selalu menampilkan detik
/// (dan menit) sesuai kebutuhan lapangan.
String _formatDuration(Duration duration) {
  if (duration.isNegative) {
    return '-';
  }
  var hours = duration.inHours;
  var minutes = duration.inMinutes.remainder(60);
  var seconds = duration.inSeconds.remainder(60);
  String pad(int value) => value.toString().padLeft(2, '0');
  return [
    if (hours > 0) '$hours j',
    if (hours > 0) '${pad(minutes)} mnt',
    if (hours == 0) '$minutes mnt',
    '${pad(seconds)} dtk',
  ].join(' ');
}

DateTime? _parseTimestamp(String? iso) {
  var raw = iso?.trim();
  if (raw == null || raw.isEmpty) {
    return null;
  }
  return DateTime.tryParse(raw);
}

/// Panduan langkah sesuai status — petugas tidak perlu menebak yang mana
/// berikutnya (pemisahan tugas: counter tidak bisa menyetujui dirinya).
String _statusHint(String status) => switch (status) {
  'OPEN' => 'Tekan "Mulai Sesi" untuk memulai, lalu hitung tiap baris.',
  'IN_PROGRESS' =>
    'Hitung semua baris sampai 0 sisa, lalu kirim untuk persetujuan BLC.',
  'PENDING_APPROVAL' =>
    'Menunggu keputusan BLC. Koreksi wave baru berlaku setelah disetujui.',
  'REVISI' => 'Perbaiki baris yang ditandai, lalu kirim ulang untuk review.',
  'APPROVED' => 'Sesi disetujui — koreksi wave telah berlaku.',
  'COMPLETED' => 'Sesi selesai — koreksi wave telah berlaku.',
  _ => '',
};

/// Sesi Opname Expired — alur kerja lapangan (aturan A2).
///
/// Daftar sesi → detail dengan ringkasan progres → hitung fisik per label
/// batch (qty + kondisi + disposisi) → kirim untuk persetujuan. Aksi berat
/// diarahkan ke backend (opname-sessions).
class OpnameExpiredSessionPage extends StatefulWidget {
  const OpnameExpiredSessionPage({super.key, this.repository});

  final OpnameExpiredSessionRepository? repository;

  @override
  State<OpnameExpiredSessionPage> createState() =>
      _OpnameExpiredSessionPageState();
}

class _OpnameExpiredSessionPageState extends State<OpnameExpiredSessionPage> {
  late final OpnameExpiredSessionProvider _provider =
      OpnameExpiredSessionProvider(repository: widget.repository);

  // Filter cepat nama produk / kode barang / nomor batch di halaman detail.
  String _search = '';

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
            'opname.session.view',
          ) ??
          false;
      _provider.bootstrap(canView: canView);
    });
  }

  @override
  void dispose() {
    _provider.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) =>
      ChangeNotifierProvider<OpnameExpiredSessionProvider>.value(
        value: _provider,
        child: Builder(builder: _buildPage),
      );

  Widget _buildPage(BuildContext context) {
    var canView =
        context.watch<AuthProvider>().user?.hasPermission(
          'opname.session.view',
        ) ??
        false;
    var provider = context.watch<OpnameExpiredSessionProvider>();

    var content = !canView
        ? _buildNoAccess()
        : RefreshIndicator(
            onRefresh: provider.load,
            color: AppTheme.primary600,
            child: provider.selected != null
                ? _buildSessionDetail(provider, context)
                : provider.isLoading && provider.sessions.isEmpty
                ? const _OpnameSessionLoading()
                : provider.error != null
                ? AppErrorDisplay(
                    message: provider.error!,
                    onRetry: provider.load,
                    retryText: 'Coba Lagi',
                  )
                : provider.sessions.isEmpty
                ? const AppEmptyState(
                    icon: Icons.hourglass_empty_rounded,
                    title: 'Belum ada sesi opname',
                    subtitle:
                        'Sesi opname akan dibuat saat ada barang kadaluarsa yang perlu dicek.',
                  )
                : ListView.separated(
                    itemCount: provider.sessions.length,
                    separatorBuilder: (child, index) =>
                        const SizedBox(height: AppTheme.space3),
                    padding: const EdgeInsets.all(AppTheme.space4),
                    itemBuilder: (_, index) => _OpnameSessionTile(
                      session: provider.sessions[index],
                      onTap: () => provider.show(provider.sessions[index].id),
                    ),
                  ),
          );

    return Scaffold(
      backgroundColor: context.colors.background,
      appBar: AppBar(
        title: const Text('Sesi Opname Expired'),
        elevation: 0,
        actions: [
          IconButton(
            onPressed: provider.load,
            tooltip: 'Muat ulang',
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: SafeArea(child: content),
    );
  }

  Widget _buildSessionDetail(
    OpnameExpiredSessionProvider provider,
    BuildContext context,
  ) {
    var session = provider.selected!;
    var needle = _search.trim().toLowerCase();
    var items = session.items.where((item) {
      if (needle.isEmpty) {
        return true;
      }
      // Cari cepat: nama/kode barang, nomor batch, atau barcode label.
      return (item.namaBarang ?? '').toLowerCase().contains(needle) ||
          (item.kodeBarang ?? '').toLowerCase().contains(needle) ||
          (item.batchNumber ?? '').toLowerCase().contains(needle) ||
          (item.barcodeLabel ?? '').toLowerCase().contains(needle);
    }).toList();
    // Kelompok per barang (cluster): satu wave = satu produk = N baris
    // batch. Urutan asli backend dipertahankan.
    var clusters = <int, List<OpnameExpiredSessionItem>>{};
    for (var item in items) {
      clusters.putIfAbsent(item.waveId, () => []).add(item);
    }
    var countedTotal = session.items.where((i) => i.isVerified).length;

    return RefreshIndicator(
      onRefresh: () => provider.show(session.id),
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(AppTheme.space4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildSessionHeaderCard(session, context, provider, countedTotal),
            const SizedBox(height: AppTheme.space4),
            if (session.items.length > 1) ...[
              TextField(
                onChanged: (value) => setState(() => _search = value),
                decoration: InputDecoration(
                  isDense: true,
                  filled: true,
                  fillColor: context.colors.surfaceCard,
                  prefixIcon: const Icon(Icons.search_rounded, size: 20),
                  suffixIcon: _search.isEmpty
                      ? null
                      : IconButton(
                          icon: const Icon(Icons.close_rounded, size: 18),
                          tooltip: 'Bersihkan',
                          onPressed: () => setState(() => _search = ''),
                        ),
                  hintText: 'Cari nama produk / kode batch...',
                  hintStyle: GoogleFonts.roboto(
                    fontSize: 13,
                    color: context.colors.textMuted,
                  ),
                  border: OutlineInputBorder(
                    borderRadius: AppTheme.radiusLg,
                    borderSide: BorderSide(color: context.colors.border),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: AppTheme.radiusLg,
                    borderSide: BorderSide(color: context.colors.border),
                  ),
                  contentPadding: const EdgeInsets.symmetric(
                    vertical: 10,
                    horizontal: 12,
                  ),
                ),
              ),
              const SizedBox(height: AppTheme.space4),
            ],
            if (items.isEmpty && needle.isNotEmpty)
              const AppEmptyState(
                icon: Icons.search_off_rounded,
                title: 'Tidak ada yang cocok',
                subtitle: 'Coba kata kunci lain — nama produk atau kode batch.',
              )
            else
              for (var entry in clusters.entries) ...[
                _OpnameClusterHeader(
                  item: entry.value.first,
                  total: entry.value.length,
                  counted: entry.value.where((i) => i.isVerified).length,
                ),
                const SizedBox(height: AppTheme.space2),
                ...entry.value.map(
                  (item) => _OpnameSessionItemTile(
                    key: ValueKey<int>(item.id),
                    item: item,
                    onCount: session.acceptsCounting
                        ? () => _showVerifySheet(context, session, item)
                        : null,
                  ),
                ),
                const SizedBox(height: AppTheme.space4),
              ],
            const SizedBox(height: AppTheme.space8),
          ],
        ),
      ),
    );
  }

  Widget _buildSessionHeaderCard(
    OpnameExpiredSession session,
    BuildContext context,
    OpnameExpiredSessionProvider provider,
    int countedTotal,
  ) {
    var total = session.items.length;
    var progress = total == 0 ? 0.0 : countedTotal / total;
    var hint = _statusHint(session.status);

    return AppCard(
      padding: const EdgeInsets.all(AppTheme.space4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              AppBadge(
                text: OpnameSessionStatus.label(session.status),
                variant: _sessionBadgeVariant(session.status),
              ),
              const SizedBox(width: AppTheme.space2),
              Expanded(
                child: Text(
                  'Sesi minggu ${_formatDate(session.weekStart)}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.roboto(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: context.colors.foreground,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppTheme.space3),
          Text(
            session.namaDepo ?? session.kodeDepo ?? '-',
            style: GoogleFonts.roboto(
              fontSize: 12,
              color: context.colors.textSecondary,
            ),
          ),
          if (hint.isNotEmpty) ...[
            const SizedBox(height: AppTheme.space2),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(
                  Icons.info_outline_rounded,
                  size: 14,
                  color: context.colors.info,
                ),
                const SizedBox(width: AppTheme.space2),
                Expanded(
                  child: Text(
                    hint,
                    style: GoogleFonts.roboto(
                      fontSize: 11,
                      height: 1.4,
                      color: context.colors.info,
                    ),
                  ),
                ),
              ],
            ),
          ],
          if (total > 0) ...[
            const SizedBox(height: AppTheme.space3),
            _SessionDuration(session: session),
            const SizedBox(height: AppTheme.space3),
            Row(
              children: [
                Expanded(
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(99),
                    child: LinearProgressIndicator(
                      value: progress,
                      minHeight: 6,
                      backgroundColor: context.colors.border,
                      valueColor: AlwaysStoppedAnimation<Color>(
                        progress == 1
                            ? context.colors.success
                            : AppTheme.primary600,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: AppTheme.space3),
                Text(
                  '$countedTotal/$total terhitung',
                  style: GoogleFonts.roboto(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: countedTotal == total
                        ? context.colors.success
                        : context.colors.textSecondary,
                  ),
                ),
              ],
            ),
          ],
          if (session.acceptsCounting &&
              total > 0 &&
              countedTotal == total) ...[
            const SizedBox(height: AppTheme.space3),
            AppPrimaryButton(
              text: 'Kirim untuk Persetujuan',
              leadingIcon: Icons.send_rounded,
              onPressed: () => provider.submit(session.id),
              isLoading: provider.isLoading,
            ),
          ],
          ..._buildSessionActions(session, provider, context),
        ],
      ),
    );
  }

  List<Widget> _buildSessionActions(
    OpnameExpiredSession session,
    OpnameExpiredSessionProvider provider,
    BuildContext context,
  ) {
    if (session.isOpen) {
      return [
        const SizedBox(height: AppTheme.space3),
        AppPrimaryButton(
          text: 'Mulai Sesi',
          leadingIcon: Icons.play_arrow_rounded,
          onPressed: () => provider.start(session.id),
          isLoading: provider.isLoading,
        ),
        const SizedBox(height: AppTheme.space2),
        AppSecondaryButton(
          text: 'Batalkan Sesi',
          onPressed: () => provider.cancel(session.id),
          isLoading: provider.isLoading,
          isFullWidth: false,
          width: 180,
          height: 44,
        ),
      ];
    }

    if (session.isPendingApproval) {
      // Pemisahan tugas: hanya pemegang izin approve yang bisa memutuskan —
      // counter tidak dapat menyetujui hitungannya sendiri (dicek juga
      // backend). Petugas hanya melihat status menunggu.
      var canDecide =
          context.read<AuthProvider>().user?.hasPermission(
            'opname.session.approve',
          ) ??
          false;
      var waitingText = Text(
        'Menunggu keputusan approver. Petugas penghitung tidak dapat '
        'menyetujui hitungannya sendiri (pemisahan tugas).',
        style: GoogleFonts.roboto(
          fontSize: 11,
          height: 1.4,
          color: context.colors.textMuted,
        ),
      );
      if (!canDecide) {
        return [const SizedBox(height: AppTheme.space3), waitingText];
      }
      return [
        const SizedBox(height: AppTheme.space3),
        AppPrimaryButton(
          text: 'Setujui Sesi',
          onPressed: () => provider.approve(session.id),
          isLoading: provider.isLoading,
        ),
        const SizedBox(height: AppTheme.space3),
        AppSecondaryButton(
          text: 'Revisi Sesi',
          onPressed: () => _confirmRevise(context, session),
          isLoading: provider.isLoading,
          isFullWidth: false,
          width: 180,
          height: 44,
        ),
        const SizedBox(height: AppTheme.space3),
        waitingText,
      ];
    }

    return const <Widget>[];
  }

  Future<void> _confirmRevise(
    BuildContext context,
    OpnameExpiredSession session,
  ) async {
    var controller = TextEditingController();
    var confirmed = false;
    var result = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Revisi Sesi'),
        content: TextField(
          controller: controller,
          decoration: const InputDecoration(
            labelText: 'Alasan revisi (min. 5 karakter)',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Batal'),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Revisi'),
          ),
        ],
      ),
    );

    confirmed = result ?? false;
    if (confirmed) {
      var reason = controller.text.trim();
      if (reason.length >= 5) {
        await _provider.revise(session.id, reason);
      }
    }
  }

  Future<void> _showVerifySheet(
    BuildContext context,
    OpnameExpiredSession session,
    OpnameExpiredSessionItem item,
  ) => showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _VerifySheet(
      session: session,
      item: item,
      // Sheet menangani state simpan & error sendiri; onVerify mengembalikan
      // pesan error (null = sukses) supaya sheet bisa tampil inline.
      onVerify: (data, photoPath) =>
          _provider.verifyItem(session.id, item.id, data, photoPath: photoPath),
    ),
  );

  Widget _buildNoAccess() => SingleChildScrollView(
    padding: const EdgeInsets.all(AppTheme.space5),
    child: Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AppTheme.space5),
      decoration: BoxDecoration(
        color: context.colors.warningWell,
        borderRadius: AppTheme.radiusXl,
        border: Border.all(color: context.colors.warningText),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.lock_rounded, size: 20, color: context.colors.warningText),
          const SizedBox(width: AppTheme.space3),
          Expanded(
            child: Text(
              'Anda tidak memiliki izin untuk melihat Sesi Opname Expired.',
              style: GoogleFonts.roboto(
                fontSize: 13,
                height: 1.4,
                color: context.colors.warningText,
              ),
            ),
          ),
        ],
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// Sheet hitung fisik
// ---------------------------------------------------------------------------

/// Sheet input hitung fisik satu label batch.
///
/// Logika input profesional & jujur:
/// - identifikasi label selalu manual saat ini (fitur pindai kamera
///   di-offkan) — backend tetap menerima `identified_via: manual`;
/// - aksi cepat: "Sesuai acuan" dan "Habis (0)" untuk mempercepat lapangan;
/// - disposisi wajib dipilih eksplisit saat barang ada (aturan F.1),
///   otomatis kosong saat tandai habis; kondisi fisik dikirim bawaan
///   FISIK_BAGUS — kondisi bermasalah ditindak via disposisi (retur/
///   disposal); foto bukti tetap didukung backend bila kelak diperlukan;
/// - selisih terhadap acuan tampil live sebelum simpan.
class _VerifySheet extends StatefulWidget {
  const _VerifySheet({
    required this.session,
    required this.item,
    required this.onVerify,
  });

  final OpnameExpiredSession session;
  final OpnameExpiredSessionItem item;

  /// Mengembalikan pesan error (null = sukses).
  final Future<String?> Function(Map<String, dynamic> data, String? photoPath)
  onVerify;

  @override
  State<_VerifySheet> createState() => _VerifySheetState();
}

class _VerifySheetState extends State<_VerifySheet> {
  late final TextEditingController _qtyCrt = TextEditingController(
    text: widget.item.qtyFisikCrt?.toString() ?? '',
  );
  late final TextEditingController _qtyPcs = TextEditingController(
    text: widget.item.qtyFisikPcs?.toString() ?? '',
  );
  late final TextEditingController _notes = TextEditingController(
    text: widget.item.notes ?? '',
  );

  // Kondisi fisik tidak diminta dari petugas — opname expired sudah
  // bermuara ke disposisi (lanjut/retur/disposal). Backend tetap menyimpan
  // kondisi; mobile mengirim bawaan FISIK_BAGUS.
  static const String _condition = 'FISIK_BAGUS';
  String? _disposition;
  String? _errorMessage;
  bool _saving = false;

  double get _qtyCrtValue =>
      double.tryParse(_qtyCrt.text.replaceAll(',', '.')) ?? 0;
  double get _qtyPcsValue =>
      double.tryParse(_qtyPcs.text.replaceAll(',', '.')) ?? 0;
  bool get _isMarkedEmpty => _qtyCrtValue == 0 && _qtyPcsValue == 0;

  /// Selisih terhadap acuan, untuk preview live.
  double? get _delta {
    var expected = widget.item.expectedCrt;
    if (expected == null || _qtyCrt.text.trim().isEmpty) {
      return null;
    }
    return _qtyCrtValue - expected;
  }

  @override
  void dispose() {
    _qtyCrt.dispose();
    _qtyPcs.dispose();
    _notes.dispose();
    super.dispose();
  }

  void _applyAcuan() {
    setState(() {
      var expectedCrt = widget.item.expectedCrt;
      var expectedPcs = widget.item.expectedPcs;
      _qtyCrt.text = expectedCrt != null ? _formatQty(expectedCrt) : '';
      _qtyPcs.text = expectedPcs != null ? _formatQty(expectedPcs) : '';
      if (_qtyCrt.text == '0' || expectedCrt == 0) {
        _disposition = null;
      }
      _errorMessage = null;
    });
  }

  void _applyHabis() {
    setState(() {
      _qtyCrt.text = '0';
      _qtyPcs.text = '0';
      // Tandai habis: tidak ada barang untuk didisposisikan.
      _disposition = null;
      _errorMessage = null;
    });
  }

  Future<void> _save() async {
    var navigator = Navigator.of(context);
    var error = _validate();
    if (error != null) {
      setState(() => _errorMessage = error);
      return;
    }
    setState(() {
      _saving = true;
      _errorMessage = null;
    });
    var data = <String, dynamic>{
      'qty_fisik_crt': _qtyCrtValue,
      'qty_fisik_pcs': _qtyPcsValue,
      'condition': _condition,
      // Disposisi dilarang saat tandai habis — tidak ada barang
      // untuk ditindaklanjuti; koreksi menunggu validasi BLC.
      'disposition': _isMarkedEmpty ? null : _disposition,
      'notes': _notes.text.trim().isEmpty ? null : _notes.text.trim(),
      'identified_via': 'manual',
    };
    var submitError = await widget.onVerify(data, null);
    if (!mounted) {
      return;
    }
    if (submitError != null) {
      setState(() {
        _saving = false;
        _errorMessage = submitError;
      });
      return;
    }
    navigator.pop();
  }

  String? _validate() {
    if (_qtyCrt.text.trim().isEmpty ||
        double.tryParse(_qtyCrt.text.replaceAll(',', '.')) == null) {
      return 'Qty fisik (CRT) wajib diisi angka.';
    }
    if (_qtyCrtValue < 0 || _qtyPcsValue < 0) {
      return 'Qty tidak boleh negatif.';
    }
    if (!_isMarkedEmpty && _disposition == null) {
      return 'Disposisi wajib dipilih untuk hasil hitung yang berisi barang.';
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    var colors = context.colors;
    var delta = _delta;
    var item = widget.item;

    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: Container(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.of(context).size.height * 0.92,
        ),
        decoration: BoxDecoration(
          color: colors.background,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
          border: Border(top: BorderSide(color: colors.border)),
        ),
        child: SafeArea(
          top: false,
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Center(
                  child: Container(
                    width: 36,
                    height: 4,
                    decoration: BoxDecoration(
                      color: colors.border,
                      borderRadius: BorderRadius.circular(99),
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        'Hitung Fisik',
                        style: GoogleFonts.roboto(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: colors.foreground,
                        ),
                      ),
                    ),
                    IconButton(
                      onPressed: () => Navigator.of(context).pop(),
                      icon: const Icon(Icons.close_rounded, size: 20),
                      tooltip: 'Tutup',
                      color: colors.textMuted,
                    ),
                  ],
                ),
                _buildTargetCard(colors, item),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  children: [
                    _QuickChip(
                      label:
                          'Sesuai acuan (${_formatQty(item.expectedCrt)} CRT)',
                      icon: Icons.done_all_rounded,
                      onTap: _applyAcuan,
                    ),
                    _QuickChip(
                      label: 'Habis (0)',
                      icon: Icons.inventory_2_outlined,
                      onTap: _applyHabis,
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: AppTextField(
                        controller: _qtyCrt,
                        key: const Key('verify_qty_crt'),
                        label: 'Qty Fisik (CRT)',
                        keyboardType: const TextInputType.numberWithOptions(
                          decimal: true,
                        ),
                        onChanged: (_) => setState(() {}),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: AppTextField(
                        controller: _qtyPcs,
                        key: const Key('verify_qty_pcs'),
                        label: 'Qty PCS',
                        keyboardType: const TextInputType.numberWithOptions(
                          decimal: true,
                        ),
                        onChanged: (_) => setState(() {}),
                      ),
                    ),
                  ],
                ),
                if (delta != null && delta != 0) ...[
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Icon(
                        delta > 0
                            ? Icons.trending_up_rounded
                            : Icons.trending_down_rounded,
                        size: 16,
                        color: delta > 0 ? colors.warning : colors.danger,
                      ),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          'Selisih ${delta > 0 ? '+' : ''}${_formatQty(delta)} CRT dari acuan',
                          style: GoogleFonts.roboto(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: delta > 0 ? colors.warning : colors.danger,
                          ),
                        ),
                      ),
                    ],
                  ),
                ] else ...[
                  const SizedBox(height: 8),
                  if (_isMarkedEmpty)
                    Row(
                      children: [
                        Icon(
                          Icons.inventory_2_outlined,
                          size: 16,
                          color: colors.warning,
                        ),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            'Tandai habis — fisik 0; koreksi menunggu '
                            'validasi BLC saat approve.',
                            style: GoogleFonts.roboto(
                              fontSize: 11,
                              height: 1.35,
                              color: colors.warning,
                            ),
                          ),
                        ),
                      ],
                    )
                  else if (delta != null)
                    Row(
                      children: [
                        Icon(
                          Icons.check_circle_outline_rounded,
                          size: 16,
                          color: colors.success,
                        ),
                        const SizedBox(width: 6),
                        Text(
                          'Sesuai acuan',
                          style: GoogleFonts.roboto(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: colors.success,
                          ),
                        ),
                      ],
                    ),
                ],
                const SizedBox(height: 12),
                if (!_isMarkedEmpty) ...[
                  const SizedBox(height: 12),
                  Text(
                    'Disposisi *',
                    style: GoogleFonts.roboto(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: colors.textSecondary,
                    ),
                  ),
                  const SizedBox(height: 6),
                  _buildDispositionChips(colors),
                ],
                const SizedBox(height: 12),
                AppTextField(
                  controller: _notes,
                  label: 'Catatan (opsional)',
                  maxLines: 2,
                ),
                const SizedBox(height: 12),
                if (_errorMessage != null)
                  Container(
                    padding: const EdgeInsets.all(12),
                    margin: const EdgeInsets.only(bottom: 12),
                    decoration: BoxDecoration(
                      color: colors.dangerWell,
                      borderRadius: AppTheme.radiusLg,
                      border: Border.all(
                        color: colors.danger.withValues(alpha: 0.4),
                      ),
                    ),
                    child: Row(
                      children: [
                        Icon(
                          Icons.error_outline_rounded,
                          size: 18,
                          color: colors.dangerText,
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            _errorMessage!,
                            style: GoogleFonts.roboto(
                              fontSize: 12,
                              height: 1.4,
                              color: colors.dangerText,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                AppPrimaryButton(
                  text: 'Simpan Hasil Hitung',
                  onPressed: _save,
                  isLoading: _saving,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildTargetCard(
    ThemeColors colors,
    OpnameExpiredSessionItem item,
  ) => Container(
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      color: context.colors.surfaceCard,
      borderRadius: AppTheme.radiusLg,
      border: Border.all(color: context.colors.border),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          item.batchNumber ?? item.kodeBarang ?? 'Item ${item.id}',
          style: GoogleFonts.robotoMono(
            fontSize: 13,
            fontWeight: FontWeight.w700,
            color: context.colors.foreground,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          '${item.namaBarang ?? '-'} · Barcode ${item.barcodeLabel ?? '-'}'
          ' · Terima ${_formatDate(item.tanggalPenerimaan)}'
          ' · Exp ${_formatDate(item.expiredDateIni)}',
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: GoogleFonts.roboto(
            fontSize: 11,
            height: 1.35,
            color: context.colors.textSecondary,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          'Acuan sistem: CRT ${_formatQty(item.expectedCrt)}'
          ' / PCS ${_formatQty(item.expectedPcs)}'
          '${item.umurSimpanHari != null ? ' · Umur simpan ${item.umurSimpanHari} hari' : ''}'
          '${item.sisaHariBatch != null ? ' · Sisa ${item.sisaHariBatch} hari' : ''}',
          style: GoogleFonts.roboto(
            fontSize: 12,
            fontWeight: FontWeight.w700,
            color: context.colors.foreground,
          ),
        ),
        // Bantuan analisa: batch ini diterima oleh orang yang sama —
        // ia bisa menyimpulkan kapan masalahnya mulai.
        if (item.selisihTerima != null && item.selisihTerima != 0)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              'Sudah selisih saat terima: '
              '${item.selisihTerima! > 0 ? '+' : ''}'
              '${_formatQty(item.selisihTerima)} CRT '
              '(terima ${_formatQty(item.expectedCrt)} CRT)',
              style: GoogleFonts.roboto(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: context.colors.warning,
              ),
            ),
          )
        else if (item.conditionTerima != null &&
            item.conditionTerima!.toUpperCase() != 'FISIK_BAGUS')
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              'Sudah bermasalah saat terima: '
              '${_conditionLabel(item.conditionTerima)}',
              style: GoogleFonts.roboto(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: context.colors.warning,
              ),
            ),
          ),
      ],
    ),
  );

  Widget _buildDispositionChips(ThemeColors colors) => Wrap(
    spacing: 8,
    runSpacing: 8,
    children: [
      for (var entry in const {
        'LANJUT': Icons.warehouse_rounded,
        'RETUR': Icons.assignment_return_rounded,
        'DISPOSAL': Icons.delete_forever_rounded,
      }.entries)
        _DispositionChip(
          value: entry.key,
          label: _dispositionLabel(entry.key),
          icon: entry.value,
          selected: _disposition == entry.key,
          colors: colors,
          onTap: () => setState(() {
            _disposition = entry.key;
            _errorMessage = null;
          }),
        ),
    ],
  );
}

// ---------------------------------------------------------------------------
// Elemen kecil
// ---------------------------------------------------------------------------

class _QuickChip extends StatelessWidget {
  const _QuickChip({required this.label, required this.icon, this.onTap});

  final String label;
  final IconData icon;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => ActionChip(
    label: Text(
      label,
      style: GoogleFonts.roboto(
        fontSize: 12,
        fontWeight: FontWeight.w600,
        color: context.colors.foreground,
      ),
    ),
    avatar: Icon(icon, size: 16, color: AppTheme.primary600),
    backgroundColor: context.colors.surfaceCard,
    side: BorderSide(color: context.colors.border),
    onPressed: onTap,
  );
}

class _DispositionChip extends StatelessWidget {
  const _DispositionChip({
    required this.value,
    required this.label,
    required this.icon,
    required this.selected,
    required this.colors,
    this.onTap,
  });

  final String value;
  final String label;
  final IconData icon;
  final bool selected;
  final VoidCallback? onTap;
  final ThemeColors colors;

  @override
  Widget build(BuildContext context) => Material(
    color: selected ? colors.primaryWell : Colors.transparent,
    borderRadius: AppTheme.radiusLg,
    child: InkWell(
      borderRadius: AppTheme.radiusLg,
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          borderRadius: AppTheme.radiusLg,
          border: Border.all(
            color: colors.primaryWellBorder,
            width: selected ? 2 : 1,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 16, color: colors.primaryWellText),
            const SizedBox(width: 6),
            Text(
              label,
              style: GoogleFonts.roboto(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: colors.primaryWellText,
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

/// Strip durasi opname di header sesi: dari "Mulai Sesi" sampai penghitungan
/// selesai (kirim untuk persetujuan / verifikasi terakhir).
///
/// - sesi berjalan: durasi hidup berdetak per detik (menit–detik) — petugas
///   dan supervisor melihat pace opname;
/// - sesi terkirim: durasi terkunci mulai → submitted_at, tetap tampil
///   sebagai laporan selesai (jelas, fungsional, terukur).
class _SessionDuration extends StatefulWidget {
  const _SessionDuration({required this.session});

  final OpnameExpiredSession session;

  @override
  State<_SessionDuration> createState() => _SessionDurationState();
}

class _SessionDurationState extends State<_SessionDuration> {
  DateTime? _started;
  DateTime? _ended;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _started = _parseTimestamp(widget.session.startedAt);
    _ended =
        _parseTimestamp(widget.session.submittedAt) ??
        _parseTimestamp(widget.session.finishedAt);
    if (_started != null && _ended == null) {
      // Sesi berjalan: detik berdetak di UI.
      _timer = Timer.periodic(const Duration(seconds: 1), (_) {
        if (mounted) {
          setState(() {});
        }
      });
    }
  }

  @override
  void didUpdateWidget(covariant _SessionDuration oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Sesi bisa berubah status (mis. submit) — apit waktu akhir baru.
    var newEnded =
        _parseTimestamp(widget.session.submittedAt) ??
        _parseTimestamp(widget.session.finishedAt);
    if (newEnded != null && newEnded != _ended) {
      _ended = newEnded;
      _timer?.cancel();
      _timer = null;
      setState(() {});
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    var started = _started;
    if (started == null) {
      return const SizedBox.shrink();
    }
    var colors = context.colors;
    var isRunning = _ended == null;
    var duration = (_ended ?? DateTime.now()).difference(started);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: AppTheme.radiusLg,
        border: Border.all(color: colors.border),
      ),
      child: Row(
        children: [
          Icon(
            isRunning ? Icons.timer_rounded : Icons.timer_outlined,
            size: 16,
            color: isRunning ? AppTheme.primary600 : colors.textMuted,
          ),
          const SizedBox(width: 8),
          Text(
            isRunning ? 'Durasi berjalan' : 'Durasi opname',
            style: GoogleFonts.roboto(fontSize: 11, color: colors.textMuted),
          ),
          const Spacer(),
          Text(
            _formatDuration(duration),
            style: GoogleFonts.robotoMono(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: isRunning ? colors.foreground : colors.success,
            ),
          ),
        ],
      ),
    );
  }
}

class _OpnameSessionLoading extends StatelessWidget {
  const _OpnameSessionLoading();
  @override
  Widget build(BuildContext context) => Center(
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const CircularProgressIndicator(
          strokeWidth: 3,
          valueColor: AlwaysStoppedAnimation<Color>(AppTheme.primary600),
        ),
        const SizedBox(height: AppTheme.space4),
        Text(
          'Memuat sesi...',
          style: Theme.of(
            context,
          ).textTheme.bodyMedium?.copyWith(color: context.colors.textMuted),
        ),
      ],
    ),
  );
}

class _OpnameSessionTile extends StatelessWidget {
  const _OpnameSessionTile({required this.session, this.onTap});

  final OpnameExpiredSession session;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => AppCard(
    padding: const EdgeInsets.all(AppTheme.space4),
    onTap: onTap,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            AppBadge(
              text: OpnameSessionStatus.label(session.status),
              variant: _sessionBadgeVariant(session.status),
            ),
            const SizedBox(width: AppTheme.space2),
            Expanded(
              child: Text(
                'Sesi minggu ${_formatDate(session.weekStart)}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: GoogleFonts.roboto(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: context.colors.foreground,
                ),
              ),
            ),
            Text(
              '${session.items.length} item',
              style: GoogleFonts.roboto(
                fontSize: 11,
                color: context.colors.textMuted,
              ),
            ),
          ],
        ),
        const SizedBox(height: AppTheme.space2),
        Text(
          session.namaDepo ?? session.kodeDepo ?? '-',
          style: GoogleFonts.roboto(
            fontSize: 12,
            color: context.colors.textSecondary,
          ),
        ),
      ],
    ),
  );
}

/// Tile baris verifikasi batch: label fisik (nomor batch + barcode),
/// pembanding acuan ↔ fisik dengan chip selisih, kondisi & disposisi.
class _OpnameSessionItemTile extends StatelessWidget {
  const _OpnameSessionItemTile({required this.item, super.key, this.onCount});

  final OpnameExpiredSessionItem item;
  final VoidCallback? onCount;

  /// Selisih CRT fisik vs acuan (null saat belum dihitung / tanpa acuan).
  (String, Color)? _deltaInfo(BuildContext context) {
    if (!item.isVerified) {
      return null;
    }
    var expected = item.expectedCrt;
    var actual = item.qtyFisikCrt;
    if (expected == null || actual == null) {
      return null;
    }
    var delta = actual - expected;
    if ((item.qtyFisikCrt ?? 0) == 0 && (item.qtyFisikPcs ?? 0) == 0) {
      return ('Habis', context.colors.warning);
    }
    if (delta == 0) {
      return ('Sesuai', context.colors.success);
    }
    return (
      'Selisih ${delta > 0 ? '+' : ''}${_formatQty(delta)}',
      delta > 0 ? context.colors.warning : context.colors.danger,
    );
  }

  @override
  Widget build(BuildContext context) {
    var colors = context.colors;
    var deltaInfo = _deltaInfo(context);
    var verified = item.isVerified;

    // Warna membedakan baris yang sudah/belum diinput: sudah dihitung
    // bernuansa hijau (latar + garis pinggir), belum tetap netral.
    return AppCard(
      padding: const EdgeInsets.all(AppTheme.space3),
      color: verified ? colors.success.withValues(alpha: 0.06) : null,
      border: verified
          ? Border.all(color: colors.success.withValues(alpha: 0.55))
          : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              if (verified)
                Icon(
                  Icons.check_circle_rounded,
                  size: 18,
                  color: colors.success,
                )
              else
                Container(
                  width: 8,
                  height: 8,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: colors.border,
                  ),
                ),
              const SizedBox(width: AppTheme.space2),
              Expanded(
                child: Text(
                  item.batchNumber ?? item.kodeBarang ?? 'Item ${item.id}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.robotoMono(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: colors.foreground,
                  ),
                ),
              ),
              if (deltaInfo != null)
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 2,
                  ),
                  decoration: BoxDecoration(
                    color: deltaInfo.$2.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(99),
                  ),
                  child: Text(
                    deltaInfo.$1,
                    style: GoogleFonts.roboto(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: deltaInfo.$2,
                    ),
                  ),
                )
              else
                // Status input yang jelas saat belum ada chip hasil hitung.
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 2,
                  ),
                  decoration: BoxDecoration(
                    color: verified
                        ? colors.success.withValues(alpha: 0.12)
                        : colors.textMuted.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(99),
                  ),
                  child: Text(
                    verified ? 'Sudah diinput' : 'Belum diinput',
                    style: GoogleFonts.roboto(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: verified ? colors.success : colors.textMuted,
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: AppTheme.space2),
          Text(
            'Barcode ${item.barcodeLabel ?? '-'}'
            '${item.tanggalPenerimaan != null ? ' · Terima ${_formatDate(item.tanggalPenerimaan)}' : ''}'
            ' · Exp ${_formatDate(item.expiredDateIni)}',
            style: GoogleFonts.roboto(
              fontSize: 11,
              height: 1.35,
              color: colors.textSecondary,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            'Acuan CRT ${_formatQty(item.expectedCrt)} / PCS ${_formatQty(item.expectedPcs)}',
            style: GoogleFonts.roboto(fontSize: 11, color: colors.textMuted),
          ),
          // Sisa umur simpan — petugas "ngeh" dengan barang dikelolanya:
          // umur dirancang saat terima vs sisa hari hidup saat ini.
          if (item.umurSimpanHari != null || item.sisaHariBatch != null)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Row(
                children: [
                  Icon(
                    Icons.hourglass_bottom_rounded,
                    size: 12,
                    color: (item.sisaHariBatch ?? 999) <= 7
                        ? colors.danger
                        : colors.textMuted,
                  ),
                  const SizedBox(width: 4),
                  Expanded(
                    child: Text(
                      [
                        if (item.umurSimpanHari != null)
                          'Umur simpan ${item.umurSimpanHari} hari',
                        if (item.sisaHariBatch != null)
                          'Sisa ${item.sisaHariBatch} hari',
                      ].join(' · '),
                      style: GoogleFonts.roboto(
                        fontSize: 11,
                        fontWeight: (item.sisaHariBatch ?? 999) <= 7
                            ? FontWeight.w700
                            : FontWeight.w400,
                        color: (item.sisaHariBatch ?? 999) <= 7
                            ? colors.danger
                            : colors.textSecondary,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          // Bantuan analisa sejak penerimaan — petugas (yang menerima
          // barang ini) langsung melihat kapan masalahnya dimulai.
          if (item.selisihTerima != null && item.selisihTerima != 0)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                'Sudah selisih saat terima: '
                '${item.selisihTerima! > 0 ? '+' : ''}'
                '${_formatQty(item.selisihTerima)} CRT dari rencana terima',
                style: GoogleFonts.roboto(
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                  color: colors.warning,
                ),
              ),
            )
          else if (item.conditionTerima != null &&
              item.conditionTerima!.toUpperCase() != 'FISIK_BAGUS')
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                'Kondisi saat terima: ${_conditionLabel(item.conditionTerima)}',
                style: GoogleFonts.roboto(
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                  color: colors.warning,
                ),
              ),
            ),
          if (item.isVerified) ...[
            const SizedBox(height: 2),
            Text(
              'Fisik CRT ${_formatQty(item.qtyFisikCrt)} / PCS ${_formatQty(item.qtyFisikPcs)}',
              style: GoogleFonts.roboto(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: colors.foreground,
              ),
            ),
            const SizedBox(height: AppTheme.space2),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                if (item.condition != null && item.condition!.isNotEmpty)
                  Text(
                    _conditionLabel(item.condition),
                    style: GoogleFonts.roboto(
                      fontSize: 11,
                      color: colors.textSecondary,
                    ),
                  ),
                if (item.disposition != null)
                  Text(
                    'Disposisi ${_dispositionLabel(item.disposition)}',
                    style: GoogleFonts.roboto(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: colors.textSecondary,
                    ),
                  ),
              ],
            ),
            if (item.notes != null && item.notes!.isNotEmpty) ...[
              const SizedBox(height: AppTheme.space2),
              Text(
                'Catatan: ${item.notes}',
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: GoogleFonts.roboto(
                  fontSize: 11,
                  color: colors.textSecondary,
                ),
              ),
            ],
          ],
          if (onCount != null) ...[
            const SizedBox(height: AppTheme.space3),
            AppSecondaryButton(
              text: item.isVerified ? 'Hitung Ulang' : 'Hitung Fisik',
              onPressed: onCount,
              height: 44,
            ),
          ],
        ],
      ),
    );
  }
}

/// Header cluster per barang: kode + nama + qty wave + progres hitung
/// dengan aksen rail warna.
class _OpnameClusterHeader extends StatelessWidget {
  const _OpnameClusterHeader({
    required this.item,
    required this.total,
    required this.counted,
  });

  final OpnameExpiredSessionItem item;
  final int total;
  final int counted;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.only(
      left: 10,
      right: AppTheme.space3,
      top: AppTheme.space2,
      bottom: AppTheme.space2,
    ),
    decoration: BoxDecoration(
      color: context.colors.foreground.withValues(alpha: 0.06),
      borderRadius: AppTheme.radiusLg,
    ),
    child: Row(
      children: [
        Container(
          width: 3,
          height: 28,
          decoration: BoxDecoration(
            color: counted == total
                ? context.colors.success
                : AppTheme.primary600,
            borderRadius: BorderRadius.circular(99),
          ),
        ),
        const SizedBox(width: AppTheme.space2),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '${item.kodeBarang ?? '?'} — ${item.namaBarang ?? '-'}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: GoogleFonts.roboto(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: context.colors.foreground,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                'Wave ${_formatQty(item.qtyWaveCrt)} CRT'
                '${(item.qtyWavePcs ?? 0) > 0 ? ' / ${_formatQty(item.qtyWavePcs)} PCS' : ''}'
                '${(item.statusIni ?? '').isNotEmpty ? ' · ${item.statusIni}' : ''}',
                style: GoogleFonts.roboto(
                  fontSize: 11,
                  color: context.colors.textSecondary,
                ),
              ),
            ],
          ),
        ),
        Text(
          '$counted/$total',
          style: GoogleFonts.roboto(
            fontSize: 12,
            fontWeight: FontWeight.w700,
            color: counted == total
                ? context.colors.success
                : context.colors.textSecondary,
          ),
        ),
      ],
    ),
  );
}
