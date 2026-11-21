import 'dart:async';

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import 'package:onezentra_mobile/core/theme/app_theme.dart';
import 'package:onezentra_mobile/features/auth/providers/auth_provider.dart';
import 'package:onezentra_mobile/features/opname/models/opname_expired_models.dart';
import 'package:onezentra_mobile/features/opname/models/opname_expired_session_models.dart';
import 'package:onezentra_mobile/features/opname/providers/opname_expired_session_provider.dart';
import 'package:onezentra_mobile/features/opname/repositories/opname_expired_session_repository.dart';
import 'package:onezentra_mobile/features/opname/services/opname_session_draft_store.dart';
import 'package:onezentra_mobile/shared/widgets/app_widgets.dart';

AppBadgeVariant _sessionBadgeVariant(String status) => switch (status) {
  'OPEN' => AppBadgeVariant.info,
  'IN_PROGRESS' => AppBadgeVariant.primary,
  'PENDING_APPROVAL' => AppBadgeVariant.warning,
  'APPROVED' => AppBadgeVariant.success,
  'COMPLETED' => AppBadgeVariant.success,
  'REVISI' => AppBadgeVariant.critical,
  'CANCELLED' => AppBadgeVariant.danger,
  _ => AppBadgeVariant.gray,
};

/// Aksen warna per produk — sama seperti kartu warna-warni di menu Opname
/// Expired. Memakai token tema supaya tetap kontras di mode gelap.
Color _productAccent(String key, ThemeColors colors) {
  var palette = <Color>[
    colors.info,
    colors.success,
    colors.warning,
    colors.critical,
    colors.primaryWellText,
    colors.danger,
  ];
  return palette[key.hashCode % palette.length];
}

AppBadgeVariant _riskBadgeVariant(String status) => switch (status) {
  'EXPIRED' => AppBadgeVariant.danger,
  'KRITIS' => AppBadgeVariant.critical,
  'PERHATIAN' => AppBadgeVariant.warning,
  'AMAN' => AppBadgeVariant.success,
  _ => AppBadgeVariant.gray,
};

IconData? _sessionIcon(String status) => switch (status) {
  'OPEN' => Icons.lock_open_rounded,
  'IN_PROGRESS' => Icons.play_circle_rounded,
  'PENDING_APPROVAL' => Icons.hourglass_top_rounded,
  'APPROVED' => Icons.verified_rounded,
  'COMPLETED' => Icons.check_circle_rounded,
  'REVISI' => Icons.edit_note_rounded,
  'CANCELLED' => Icons.cancel_rounded,
  _ => null,
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
    _conditionLabels[condition?.trim().toUpperCase()] ?? condition ?? '—';

String _dispositionLabel(String? value) => switch (value) {
  'LANJUT' => 'Lanjut',
  'RETUR' => 'Retur',
  'DISPOSAL' => 'Disposal',
  _ => value ?? '—',
};

double? _draftQty(dynamic value) {
  if (value is num) {
    return value.toDouble();
  }
  return double.tryParse(value?.toString() ?? '');
}

final NumberFormat _qtyFormatter = NumberFormat('#,##0.##', 'id_ID');

/// Angka quantity: tidak pernah menampilkan '-' polos (bisa berarti nol,
/// tidak ada acuan, atau belum ada data). Em-dash dipakai hanya untuk "tidak
/// tersedia", dan desimal dibatasi dua angka agar tidak muncul float panjang.
String _formatQty(double? value) {
  if (value == null) {
    return '—';
  }
  if (value == value.truncateToDouble()) {
    return value.toInt().toString();
  }
  return _qtyFormatter.format(value);
}

/// Format tanggal tampilan dd/MM/yyyy — baku warga gudang; input tetap ISO
/// dari backend (yyyy-MM-dd), fallback string asli bila tak terurai.
String _dateOut(DateTime parsed) => DateFormat('dd/MM/yyyy').format(parsed);

String _formatDate(String? iso) {
  var raw = iso?.trim();
  if (raw == null || raw.isEmpty) {
    return '—';
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

/// Kunci pengelompokan produk. Kode barang dipakai agar batch dari wave
/// berbeda tetap berkumpul dalam satu kartu; waveId jadi fallback untuk data
/// tanpa kode.
String _productKey(OpnameExpiredSessionItem item) {
  var code = item.kodeBarang?.trim().toUpperCase();
  if (code != null && code.isNotEmpty) {
    return code;
  }
  return 'wave-${item.waveId}';
}

/// Panduan langkah sesuai status — petugas tidak perlu menebak yang mana
/// berikutnya (pemisahan tugas: counter tidak bisa menyetujui dirinya).
String _statusHint(String status) => switch (status) {
  'OPEN' => 'Tekan "Mulai Sesi" untuk memulai, lalu hitung tiap baris.',
  'IN_PROGRESS' =>
    'Hitung semua baris sampai 0 sisa. Validasi dilakukan dari web.',
  'PENDING_APPROVAL' =>
    'Sesi lama menunggu validasi dari web — koreksi berlaku setelah disetujui.',
  'REVISI' => 'Perbaiki baris yang ditandai, lalu validasi ulang dari web.',
  'CANCELLED' =>
    'Sesi dibatalkan. Setelah qty dikoreksi, buat sesi baru untuk wave yang sama.',
  'APPROVED' => 'Sesi disetujui — koreksi wave telah berlaku.',
  'COMPLETED' => 'Sesi selesai — koreksi wave telah berlaku.',
  _ => '',
};

/// Sesi Opname Expired — alur kerja lapangan (aturan A2).
///
/// Daftar sesi → detail dengan ringkasan progres → hitung fisik per label
/// batch → simpan draf lokal bila belum selesai → submit hasil. Validasi
/// koreksi dilakukan di web, bukan per baris oleh BLC.
class OpnameExpiredSessionPage extends StatefulWidget {
  const OpnameExpiredSessionPage({super.key, this.repository, this.draftStore});

  final OpnameExpiredSessionRepository? repository;
  final OpnameSessionDraftStore? draftStore;

  @override
  State<OpnameExpiredSessionPage> createState() =>
      _OpnameExpiredSessionPageState();
}

class _OpnameExpiredSessionPageState extends State<OpnameExpiredSessionPage> {
  late final OpnameExpiredSessionProvider _provider =
      OpnameExpiredSessionProvider(repository: widget.repository);
  late final OpnameSessionDraftStore _draftStore =
      widget.draftStore ?? OpnameSessionDraftStore();

  /// Hasil hitung yang tersimpan di perangkat tapi belum dikirim ke server.
  /// Kunci = item id. Draft tidak mengubah status verifikasi baris.
  Map<int, Map<String, dynamic>> _drafts = {};

  // Filter cepat nama produk / kode barang / nomor batch di halaman detail.
  final TextEditingController _searchController = TextEditingController();
  String _search = '';

  // Filter status hitung: ALL | PENDING | DONE. Satu kosakata dengan aksi
  // "Hitung Fisik" dan chip status baris — petugas tidak perlu menebak
  // apakah "diinput" dan "dihitung" adalah keadaan yang sama.
  String _itemFilter = 'ALL';

  // Petugas bisa menciutkan detail header saat ingin fokus penuh ke daftar
  // barang. Ringkasan + progres tetap terlihat.
  bool _headerCompact = false;

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
    _searchController.dispose();
    _provider.dispose();
    super.dispose();
  }

  /// Hanya mengosongkan pencarian — filter status yang dipilih petugas
  /// tidak boleh ikut hilang saat menekan tombol "Bersihkan" di kolom cari.
  void _clearSearch() {
    setState(() {
      _searchController.clear();
      _search = '';
    });
  }

  /// Kembalikan detail ke kondisi awal saat sesi diganti atau saat petugas
  /// menekan "Tampilkan semua" pada empty state.
  void _resetDetailFilters() {
    setState(() {
      _searchController.clear();
      _search = '';
      _itemFilter = 'ALL';
    });
  }

  Future<void> _loadDrafts(int sessionId) async {
    var loaded = await _draftStore.load(sessionId);
    if (!mounted) {
      return;
    }
    setState(() => _drafts = loaded);
  }

  Future<void> _saveDraft(
    int sessionId,
    int itemId,
    Map<String, dynamic> data,
  ) async {
    var next = Map<int, Map<String, dynamic>>.from(_drafts);
    next[itemId] = data;
    await _draftStore.save(sessionId, next);
    if (!mounted) {
      return;
    }
    setState(() => _drafts = next);
  }

  /// Submit: sinkronkan draf lokal ke server dulu, baru tandai input selesai.
  /// Gagal di tengah jalan → draf tetap tersimpan di perangkat.
  Future<void> _submitHasil(
    OpnameExpiredSessionProvider provider,
    OpnameExpiredSession session,
  ) async {
    if (_drafts.isEmpty) {
      await provider.markInputComplete(session.id);
      return;
    }
    var pending = Map<int, Map<String, dynamic>>.from(_drafts);
    for (var itemId in pending.keys.toList()) {
      var error = await provider.verifyItem(
        session.id,
        itemId,
        pending[itemId]!,
      );
      if (error != null) {
        if (!mounted) {
          return;
        }
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Draft gagal dikirim: $error')));
        return;
      }
    }
    await _draftStore.clear(session.id);
    if (!mounted) {
      return;
    }
    setState(() => _drafts = {});
    await provider.markInputComplete(session.id);
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
                      onTap: () {
                        // Filter/pencarian dari sesi sebelumnya jangan terbawa
                        // ke sesi lain — petugas selalu melihat kondisi awal.
                        _resetDetailFilters();
                        var id = provider.sessions[index].id;
                        provider.show(id);
                        _loadDrafts(id);
                      },
                    ),
                  ),
          );

    return Scaffold(
      backgroundColor: context.colors.background,
      appBar: AppBar(
        title: const Text('Sesi Opname'),
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
    var searched = session.items.where((item) {
      if (needle.isEmpty) {
        return true;
      }
      // Cari cepat: nama/kode barang, nomor batch, atau barcode label.
      return (item.namaBarang ?? '').toLowerCase().contains(needle) ||
          (item.kodeBarang ?? '').toLowerCase().contains(needle) ||
          (item.batchNumber ?? '').toLowerCase().contains(needle) ||
          (item.barcodeLabel ?? '').toLowerCase().contains(needle);
    }).toList();
    var items = searched
        .where(
          (item) => switch (_itemFilter) {
            'PENDING' => !item.isVerified,
            'DONE' => item.isVerified,
            _ => true,
          },
        )
        .toList();
    // Satu produk = satu kartu. Batch produk yang sama (walau berasal dari
    // wave berbeda) disatukan agar petugas tidak perlu mencocokkan header
    // cluster terpisah dengan barisnya saat menghitung di lapangan.
    var products = <String, List<OpnameExpiredSessionItem>>{};
    for (var item in items) {
      products.putIfAbsent(_productKey(item), () => []).add(item);
    }
    // Progres kartu dihitung dari seluruh batch produk (tanpa filter), supaya
    // filter tidak membuat kartu tampak "0/2 padahal 3 batch masih menunggu".
    var allProducts = <String, List<OpnameExpiredSessionItem>>{};
    for (var item in session.items) {
      allProducts.putIfAbsent(_productKey(item), () => []).add(item);
    }
    var countedTotal = session.items.where((i) => i.isVerified).length;

    Widget listContent;
    if (needle.isNotEmpty && searched.isEmpty) {
      listContent = const Padding(
        padding: EdgeInsets.symmetric(vertical: AppTheme.space8),
        child: AppEmptyState(
          icon: Icons.search_off_rounded,
          title: 'Tidak ada yang cocok',
          subtitle: 'Coba kata kunci lain — nama produk atau kode batch.',
        ),
      );
    } else if (items.isEmpty) {
      listContent = Padding(
        padding: const EdgeInsets.symmetric(vertical: AppTheme.space8),
        child: AppEmptyState(
          icon: Icons.filter_alt_off_rounded,
          title: _filterLabel.isEmpty
              ? 'Tidak ada batch'
              : 'Tidak ada batch $_filterLabel',
          subtitle: 'Ganti filter status hitung atau kosongkan pencarian.',
          action: TextButton(
            onPressed: _resetDetailFilters,
            style: TextButton.styleFrom(minimumSize: const Size(0, 44)),
            child: const Text('Tampilkan semua'),
          ),
        ),
      );
    } else {
      listContent = Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (var entry in products.entries) ...[
            _OpnameProductCard(
              items: entry.value,
              allItems: allProducts[entry.key] ?? entry.value,
              drafts: _drafts,
              onCount: session.acceptsCounting
                  ? (item) => _showVerifySheet(context, session, item)
                  : null,
            ),
            const SizedBox(height: AppTheme.space4),
          ],
        ],
      );
    }

    // Header ikut bergulir bersama daftar — setelah petugas menggulir sedikit,
    // seluruh layar dipakai untuk barang yang akan dihitung.
    return RefreshIndicator(
      onRefresh: () => provider.show(session.id),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(
          AppTheme.space4,
          AppTheme.space4,
          AppTheme.space4,
          AppTheme.space8,
        ),
        children: [
          _buildSessionHeaderCard(session, provider, countedTotal),
          if (session.items.length > 1) ...[
            const SizedBox(height: AppTheme.space3),
            TextField(
              controller: _searchController,
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
                        tooltip: 'Bersihkan pencarian',
                        onPressed: _clearSearch,
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
          ],
          if (session.items.isNotEmpty) ...[
            const SizedBox(height: AppTheme.space3),
            _buildInputFilterChips(context, searched),
          ],
          const SizedBox(height: AppTheme.space4),
          listContent,
        ],
      ),
    );
  }

  String get _filterLabel => switch (_itemFilter) {
    'PENDING' => 'belum dihitung',
    'DONE' => 'sudah dihitung',
    _ => '',
  };

  /// Filter status hitung (bukan status risiko barang). Sengaja memakai
  /// kosakata yang sama dengan aksi "Hitung Fisik" dan chip status baris
  /// supaya petugas tidak melihat dua istilah untuk satu keadaan.
  Widget _buildInputFilterChips(
    BuildContext context,
    List<OpnameExpiredSessionItem> searched,
  ) {
    // Jumlah chip mengikuti hasil pencarian aktif, bukan seluruh sesi,
    // supaya angka di chip menggambarkan baris yang benar-benar tampil.
    var pending = searched.where((item) => !item.isVerified).length;
    var done = searched.length - pending;
    var colors = context.colors;
    return Wrap(
      spacing: AppTheme.space2,
      runSpacing: AppTheme.space2,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        // Label kontekstual: "Belum"/"Sudah" hanya jelas kalau pembacanya
        // tahu yang difilter adalah status hitung, bukan risiko barang.
        SizedBox(
          height: 44,
          child: Align(
            alignment: Alignment.centerLeft,
            child: Text(
              'Tampilkan:',
              style: GoogleFonts.roboto(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: colors.textMuted,
              ),
            ),
          ),
        ),
        _inputFilterChip(
          context,
          label: 'Semua',
          semanticLabel: 'semua batch',
          value: 'ALL',
          count: searched.length,
          onTap: () => setState(() => _itemFilter = 'ALL'),
        ),
        _inputFilterChip(
          context,
          label: 'Belum',
          semanticLabel: 'yang belum dihitung',
          value: 'PENDING',
          count: pending,
          onTap: () => setState(() => _itemFilter = 'PENDING'),
        ),
        _inputFilterChip(
          context,
          label: 'Sudah',
          semanticLabel: 'yang sudah dihitung',
          value: 'DONE',
          count: done,
          onTap: () => setState(() => _itemFilter = 'DONE'),
        ),
      ],
    );
  }

  Widget _inputFilterChip(
    BuildContext context, {
    required String label,
    required String semanticLabel,
    required String value,
    required int count,
    required VoidCallback onTap,
  }) {
    var selected = _itemFilter == value;
    var colors = context.colors;
    return Semantics(
      button: true,
      selected: selected,
      label: 'Filter status hitung: $semanticLabel, $count batch',
      child: ConstrainedBox(
        // Target sentuh lapangan: minimal 44px, tidak boleh chip mikro.
        constraints: const BoxConstraints(minHeight: 44),
        child: InkWell(
          key: ValueKey('opname-input-filter-$value'),
          onTap: onTap,
          borderRadius: AppTheme.radiusFull,
          child: Container(
            padding: const EdgeInsets.symmetric(
              horizontal: AppTheme.space3,
              vertical: AppTheme.space2,
            ),
            decoration: BoxDecoration(
              color: selected
                  ? colors.foreground.withValues(alpha: 0.12)
                  : colors.surfaceHover,
              borderRadius: AppTheme.radiusFull,
              border: Border.all(
                color: selected
                    ? colors.foreground.withValues(alpha: 0.4)
                    : colors.border,
                width: selected ? 1.5 : 1,
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 6,
                  height: 6,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: selected ? colors.foreground : colors.border,
                  ),
                ),
                const SizedBox(width: AppTheme.space2),
                Text(
                  label,
                  style: GoogleFonts.roboto(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: selected ? colors.foreground : colors.textSecondary,
                  ),
                ),
                const SizedBox(width: AppTheme.space2),
                Text(
                  '$count',
                  style: GoogleFonts.roboto(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: selected ? colors.foreground : colors.textMuted,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildSessionHeaderCard(
    OpnameExpiredSession session,
    OpnameExpiredSessionProvider provider,
    int countedTotal,
  ) {
    var total = session.items.length;
    var productCount = session.items.map(_productKey).toSet().length;
    // Draft lokal dihitung sebagai "siap" — nanti disinkronkan saat submit.
    var readyTotal = session.items
        .where((i) => i.isVerified || _drafts.containsKey(i.id))
        .map((i) => i.id)
        .toSet()
        .length;
    var progress = total == 0 ? 0.0 : countedTotal / total;
    var hint = _statusHint(session.status);
    var colors = context.colors;

    // Header ringkas: identitas + progres + aksi utama. Tidak ada lagi hero
    // tinggi yang menyisakan sedikit ruang untuk daftar barang.
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AppTheme.space3),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [colors.surfaceCard, colors.surface, colors.surfaceHover],
        ),
        borderRadius: AppTheme.radius2xl,
        border: Border.all(color: colors.foreground.withValues(alpha: 0.08)),
        boxShadow: [
          BoxShadow(
            color: colors.surfaceHover,
            blurRadius: 12,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [
                      AppTheme.primary600.withValues(alpha: 0.9),
                      AppTheme.primary600,
                    ],
                  ),
                  borderRadius: AppTheme.radiusLg,
                ),
                child: const Icon(
                  Icons.inventory_2_rounded,
                  size: 18,
                  color: Colors.white,
                ),
              ),
              const SizedBox(width: AppTheme.space2),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'SESI OPNAME EXPIRED',
                      style: GoogleFonts.roboto(
                        fontSize: 9,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.7,
                        color: colors.textMuted,
                      ),
                    ),
                    const SizedBox(height: 1),
                    Text(
                      'Sesi minggu ${_formatDate(session.weekStart)}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.roboto(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: colors.foreground,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: AppTheme.space2),
              AppBadge(
                text: OpnameSessionStatus.label(session.status),
                variant: _sessionBadgeVariant(session.status),
                icon: _sessionIcon(session.status),
              ),
              IconButton(
                onPressed: () =>
                    setState(() => _headerCompact = !_headerCompact),
                tooltip: _headerCompact
                    ? 'Tampilkan detail sesi'
                    : 'Ciutkan header',
                icon: Icon(
                  _headerCompact
                      ? Icons.expand_more_rounded
                      : Icons.expand_less_rounded,
                  size: 20,
                  color: colors.textMuted,
                ),
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(minWidth: 24, minHeight: 32),
                visualDensity: VisualDensity.compact,
              ),
            ],
          ),
          const SizedBox(height: AppTheme.space2),
          Row(
            children: [
              Icon(Icons.warehouse_rounded, size: 12, color: colors.textMuted),
              const SizedBox(width: 4),
              Expanded(
                child: Text(
                  session.namaDepo ?? session.kodeDepo ?? '-',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.roboto(
                    fontSize: 11,
                    color: colors.textSecondary,
                  ),
                ),
              ),
              const SizedBox(width: AppTheme.space2),
              Text(
                '$productCount produk · $total batch',
                style: GoogleFonts.roboto(
                  fontSize: 10,
                  color: colors.textMuted,
                ),
              ),
            ],
          ),
          if (!_headerCompact && hint.isNotEmpty) ...[
            const SizedBox(height: AppTheme.space2),
            Container(
              padding: const EdgeInsets.symmetric(
                horizontal: AppTheme.space2,
                vertical: 6,
              ),
              decoration: BoxDecoration(
                color: colors.infoWell,
                borderRadius: AppTheme.radiusLg,
              ),
              child: Row(
                children: [
                  Icon(
                    Icons.info_outline_rounded,
                    size: 13,
                    color: colors.info,
                  ),
                  const SizedBox(width: AppTheme.space2),
                  Expanded(
                    child: Tooltip(
                      message: hint,
                      child: Text(
                        hint,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.roboto(
                          fontSize: 10.5,
                          color: colors.info,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
          if (total > 0) ...[
            if (!_headerCompact) ...[
              const SizedBox(height: AppTheme.space2),
              _SessionDuration(session: session),
            ],
            const SizedBox(height: 6),
            Row(
              children: [
                Expanded(
                  child: ClipRRect(
                    borderRadius: AppTheme.radiusFull,
                    child: LinearProgressIndicator(
                      value: progress,
                      minHeight: 6,
                      backgroundColor: colors.border,
                      valueColor: AlwaysStoppedAnimation<Color>(
                        progress == 1 ? colors.success : AppTheme.primary600,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: AppTheme.space3),
                Text(
                  '$countedTotal/$total dihitung',
                  style: GoogleFonts.roboto(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: countedTotal == total
                        ? colors.success
                        : colors.textSecondary,
                  ),
                ),
              ],
            ),
          ],
          if (session.acceptsCounting &&
              total > 0 &&
              (session.inputCompletedAt != null || readyTotal == total)) ...[
            const SizedBox(height: AppTheme.space2),
            if (session.inputCompletedAt == null)
              AppPrimaryButton(
                text: 'Submit Hasil Opname',
                leadingIcon: Icons.send_rounded,
                onPressed: provider.isLoading
                    ? null
                    : () => _submitHasil(provider, session),
                height: 40,
              )
            else
              Row(
                children: [
                  Icon(
                    Icons.check_circle_outline_rounded,
                    size: 14,
                    color: colors.success,
                  ),
                  const SizedBox(width: AppTheme.space2),
                  Expanded(
                    child: Text(
                      'Input selesai — validasi dilakukan dari web.',
                      style: GoogleFonts.roboto(
                        fontSize: 11,
                        color: colors.success,
                      ),
                    ),
                  ),
                ],
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
      // Petugas lapangan hanya memulai sesi yang sudah dibuat di web —
      // pembatalan bukan haknya, jadi tombol Batalkan sengaja tidak ada.
      return [
        const SizedBox(height: AppTheme.space2),
        AppPrimaryButton(
          text: 'Mulai Sesi',
          leadingIcon: Icons.play_arrow_rounded,
          onPressed: () => provider.start(session.id),
          isLoading: provider.isLoading,
          height: 40,
        ),
      ];
    }

    // Tidak ada aksi approval di mobile: petugas hanya menginput,
    // keputusan/validasi sepenuhnya di web.
    return const <Widget>[];
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
      // Draft lokal dipakai sebagai nilai awal bila petugas belum mengirim.
      draft: _drafts[item.id],
      // Sheet menangani state simpan & error sendiri; onVerify mengembalikan
      // pesan error (null = sukses) supaya sheet bisa tampil inline.
      onVerify: (data, photoPath) =>
          _provider.verifyItem(session.id, item.id, data, photoPath: photoPath),
      onSaveDraft: (data) => _saveDraft(session.id, item.id, data),
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
              'Anda tidak memiliki izin untuk melihat Sesi Opname.',
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
    required this.onSaveDraft,
    this.draft,
  });

  final OpnameExpiredSession session;
  final OpnameExpiredSessionItem item;

  /// Nilai draf lokal yang belum dikirim ke server.
  final Map<String, dynamic>? draft;

  /// Mengembalikan pesan error (null = sukses).
  final Future<String?> Function(Map<String, dynamic> data, String? photoPath)
  onVerify;

  /// Simpan ke perangkat saja — tidak memanggil API.
  final Future<void> Function(Map<String, dynamic> data) onSaveDraft;

  @override
  State<_VerifySheet> createState() => _VerifySheetState();
}

class _VerifySheetState extends State<_VerifySheet> {
  late final TextEditingController _qtyCrt = TextEditingController(
    text:
        widget.draft?['qty_fisik_crt']?.toString() ??
        widget.item.qtyFisikCrt?.toString() ??
        '',
  );
  late final TextEditingController _qtyPcs = TextEditingController(
    text:
        widget.draft?['qty_fisik_pcs']?.toString() ??
        widget.item.qtyFisikPcs?.toString() ??
        '',
  );
  late final TextEditingController _notes = TextEditingController(
    text: widget.draft?['notes']?.toString() ?? widget.item.notes ?? '',
  );

  // Kondisi fisik tidak diminta dari petugas — backend tetap menyimpan
  // kondisi; mobile mengirim bawaan FISIK_BAGUS.
  static const String _condition = 'FISIK_BAGUS';
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
      _errorMessage = null;
    });
  }

  void _applyHabis() {
    setState(() {
      _qtyCrt.text = '0';
      _qtyPcs.text = '0';
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
      // Proses disposisi (lanjut/retur/disposal) sudah dilepas dari alur
      // hitung — tindak lanjut fisik diurus terpisah di lapangan;
      // koreksi tetap menunggu validasi BLC di web.
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

  /// Simpan ke perangkat — dipakai saat hitungan belum selesai atau jaringan
  /// bermasalah. Draft dikirim ke server saat petugas menekan Submit.
  Future<void> _saveDraftLocal() async {
    await widget.onSaveDraft(<String, dynamic>{
      'qty_fisik_crt': _qtyCrtValue,
      'qty_fisik_pcs': _qtyPcsValue,
      'condition': _condition,
      'notes': _notes.text.trim().isEmpty ? null : _notes.text.trim(),
      'identified_via': 'manual',
    });
    if (mounted) {
      Navigator.of(context).pop();
    }
  }

  String? _validate() {
    if (_qtyCrt.text.trim().isEmpty ||
        double.tryParse(_qtyCrt.text.replaceAll(',', '.')) == null) {
      return 'Qty fisik (CRT) wajib diisi angka.';
    }
    if (_qtyCrtValue < 0 || _qtyPcsValue < 0) {
      return 'Qty tidak boleh negatif.';
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
                // Tanpa disposisi: tindak lanjut fisik (retur/disposal)
                // diurus terpisah di lapangan, bukan bagian sheet hitung.
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
                const SizedBox(height: AppTheme.space2),
                AppSecondaryButton(
                  text: widget.draft == null
                      ? 'Simpan Draf di Perangkat'
                      : 'Perbarui Draf',
                  onPressed: _saving ? null : _saveDraftLocal,
                  height: 44,
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

    // Chip durasi ringkas — cukup untuk memberi pace tanpa memakan ruang
    // daftar barang seperti strip durasi versi lama.
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppTheme.space2,
        vertical: 6,
      ),
      decoration: BoxDecoration(
        color: colors.foreground.withValues(alpha: 0.04),
        borderRadius: AppTheme.radiusLg,
        border: Border.all(color: colors.border),
      ),
      child: Row(
        children: [
          Icon(
            isRunning ? Icons.timer_rounded : Icons.timer_outlined,
            size: 14,
            color: isRunning ? AppTheme.primary600 : colors.textMuted,
          ),
          const SizedBox(width: 6),
          // Label boleh dipangkas, angka durasi tetap terbaca penuh.
          Flexible(
            child: Text(
              isRunning ? 'Durasi berjalan' : 'Durasi opname',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: GoogleFonts.roboto(fontSize: 10, color: colors.textMuted),
            ),
          ),
          const SizedBox(width: AppTheme.space2),
          Text(
            _formatDuration(duration),
            style: GoogleFonts.robotoMono(
              fontSize: 12,
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

  IconData get _statusIcon => switch (session.status) {
    'IN_PROGRESS' => Icons.play_arrow_rounded,
    'PENDING_APPROVAL' => Icons.schedule_rounded,
    'APPROVED' || 'COMPLETED' => Icons.check_circle_rounded,
    'REVISI' => Icons.replay_rounded,
    _ => Icons.hourglass_empty_rounded,
  };

  @override
  Widget build(BuildContext context) {
    var colors = context.colors;
    var counted = session.items.where((i) => i.isVerified).length;
    var total = session.items.length;

    return AppCard(
      padding: const EdgeInsets.all(AppTheme.space3),
      onTap: onTap,
      child: Row(
        children: [
          // Ikon tile gradien selaras kartu menu beranda.
          Container(
            width: 46,
            height: 46,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  AppTheme.primary600.withValues(alpha: 0.22),
                  AppTheme.primary600.withValues(alpha: 0.08),
                ],
              ),
              borderRadius: AppTheme.radiusXl,
            ),
            child: Icon(_statusIcon, size: 22, color: AppTheme.primary600),
          ),
          const SizedBox(width: AppTheme.space3),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Sesi minggu ${_formatDate(session.weekStart)}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.roboto(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: colors.foreground,
                  ),
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    Icon(
                      Icons.warehouse_rounded,
                      size: 13,
                      color: colors.textMuted,
                    ),
                    const SizedBox(width: 4),
                    Expanded(
                      child: Text(
                        session.namaDepo ?? session.kodeDepo ?? '-',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.roboto(
                          fontSize: 12,
                          color: colors.textSecondary,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: AppTheme.space2),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              AppBadge(
                text: OpnameSessionStatus.label(session.status),
                variant: _sessionBadgeVariant(session.status),
                icon: _sessionIcon(session.status),
              ),
              const SizedBox(height: 4),
              Text(
                total > 0 && counted > 0
                    ? '$counted/$total dihitung'
                    : '$total batch',
                style: GoogleFonts.roboto(
                  fontSize: 11,
                  color: colors.textMuted,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Kartu produk — satu produk, semua batch-nya
// ---------------------------------------------------------------------------

/// Satu produk = satu kartu. Header memuat identitas + progres, baris batch
/// di bawahnya dipisah divider. Petugas tidak perlu mencocokkan header cluster
/// terpisah dengan barisnya saat menghitung fisik di lapangan.
class _OpnameProductCard extends StatelessWidget {
  const _OpnameProductCard({
    required this.items,
    required this.allItems,
    required this.drafts,
    required this.onCount,
  });

  /// Baris yang tampil setelah filter diterapkan.
  final List<OpnameExpiredSessionItem> items;

  /// Seluruh batch produk ini, dipakai untuk progres & identitas agar warna
  /// hijau tidak menyesatkan saat filter aktif.
  final List<OpnameExpiredSessionItem> allItems;
  final Map<int, Map<String, dynamic>> drafts;
  final ValueChanged<OpnameExpiredSessionItem>? onCount;

  @override
  Widget build(BuildContext context) {
    var colors = context.colors;
    var first = allItems.first;
    var counted = allItems.where((item) => item.isVerified).length;
    var total = allItems.length;
    var complete = counted == total;
    var productAccent = _productAccent(_productKey(first), colors);
    var accent = complete ? colors.success : productAccent;
    var count = onCount;
    // Stok acuan dihitung per wave unik — produk yang panen dari dua wave
    // tidak boleh menampilkan angka wave pertama seolah-olah itu totalnya.
    var waveQty = <int, double>{};
    var wavePcs = <int, double>{};
    for (var item in allItems) {
      waveQty[item.waveId] = item.qtyWaveCrt ?? 0;
      wavePcs[item.waveId] = item.qtyWavePcs ?? 0;
    }
    var stokWave = waveQty.values.fold<double>(0, (sum, value) => sum + value);
    var stokPcs = wavePcs.values.fold<double>(0, (sum, value) => sum + value);
    // Produk gabungan bisa membawa batch dengan status risiko berbeda —
    // jangan tampilkan status batch pertama seolah berlaku untuk semuanya.
    var statuses = allItems
        .map((item) => (item.statusIni ?? '').trim().toUpperCase())
        .where((value) => value.isNotEmpty)
        .toSet();
    var status = statuses.length == 1
        ? statuses.first
        : statuses.length > 1
        ? 'CAMPURAN'
        : '';

    return AppCard(
      padding: const EdgeInsets.all(AppTheme.space4),
      color: complete ? colors.success.withValues(alpha: 0.05) : null,
      border: complete
          ? Border.all(color: colors.success.withValues(alpha: 0.45))
          : Border(top: BorderSide(color: productAccent, width: 3)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _buildProductHeader(
            context,
            first,
            status,
            stokWave,
            stokPcs,
            counted,
            total,
            complete,
            accent,
          ),
          const SizedBox(height: AppTheme.space2),
          for (var i = 0; i < items.length; i++) ...[
            if (i > 0) const SizedBox(height: AppTheme.space2),
            _OpnameBatchRow(
              item: items[i],
              // Posisi stabil dari seluruh batch, bukan urutan hasil filter —
              // kalau tidak, filter DONE membuat sisa batch tampak hilang.
              index: allItems.indexOf(items[i]) + 1,
              total: total,
              draft: drafts[items[i].id],
              onCount: count == null ? null : () => count(items[i]),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildProductHeader(
    BuildContext context,
    OpnameExpiredSessionItem item,
    String status,
    double stokWave,
    double stokPcs,
    int counted,
    int total,
    bool complete,
    Color accent,
  ) {
    var colors = context.colors;
    var mixed = status == 'CAMPURAN';
    return Container(
      padding: const EdgeInsets.fromLTRB(
        AppTheme.space2,
        AppTheme.space2,
        AppTheme.space3,
        AppTheme.space2,
      ),
      decoration: BoxDecoration(
        color: colors.foreground.withValues(alpha: 0.06),
        borderRadius: AppTheme.radiusLg,
      ),
      child: Row(
        children: [
          Container(
            width: 30,
            height: 30,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  accent.withValues(alpha: 0.18),
                  accent.withValues(alpha: 0.06),
                ],
              ),
              borderRadius: AppTheme.radiusLg,
            ),
            child: Icon(
              complete ? Icons.check_rounded : Icons.inventory_2_rounded,
              size: 17,
              color: accent,
            ),
          ),
          const SizedBox(width: AppTheme.space2),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${item.kodeBarang ?? 'Tanpa kode'} — ${item.namaBarang ?? 'Tanpa nama'}',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.roboto(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: colors.foreground,
                  ),
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        '$total batch · Stok wave ${_formatQty(stokWave)} CRT'
                        '${stokPcs > 0 ? ' / ${_formatQty(stokPcs)} PCS' : ''}',
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.roboto(
                          fontSize: 11,
                          color: colors.textSecondary,
                        ),
                      ),
                    ),
                    if (status.isNotEmpty) ...[
                      const SizedBox(width: AppTheme.space2),
                      Tooltip(
                        message: mixed
                            ? 'Status risiko tiap batch berbeda — lihat tanggal expired pada masing-masing batch.'
                            : 'Status risiko produk minggu ini.',
                        child: AppBadge(
                          text: mixed ? 'Campuran' : OpnameStatus.label(status),
                          variant: mixed
                              ? AppBadgeVariant.gray
                              : _riskBadgeVariant(status),
                        ),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: AppTheme.space2),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '$counted/$total',
                style: GoogleFonts.roboto(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: complete ? colors.success : colors.textSecondary,
                ),
              ),
              const SizedBox(height: 4),
              SizedBox(
                width: 48,
                height: 4,
                child: ClipRRect(
                  borderRadius: AppTheme.radiusFull,
                  child: LinearProgressIndicator(
                    value: total == 0 ? 0 : counted / total,
                    backgroundColor: colors.border,
                    valueColor: AlwaysStoppedAnimation<Color>(accent),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Baris satu label batch di dalam kartu produk: identitas fisik, acuan,
/// kondisi penerimaan, hasil hitung, dan aksi — semuanya berdekatan supaya
/// tidak ada ambiguitas antara acuan sistem dan hasil petugas.
class _OpnameBatchRow extends StatelessWidget {
  const _OpnameBatchRow({
    required this.item,
    required this.index,
    required this.total,
    required this.onCount,
    this.draft,
  });

  final OpnameExpiredSessionItem item;
  final int index;
  final int total;
  final VoidCallback? onCount;

  /// Draft lokal belum dikirim ke server — ditampilkan jelas sebagai draf.
  final Map<String, dynamic>? draft;

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

    return Container(
      padding: const EdgeInsets.fromLTRB(
        AppTheme.space3,
        AppTheme.space3,
        AppTheme.space2,
        AppTheme.space2,
      ),
      decoration: BoxDecoration(
        color: verified
            ? colors.success.withValues(alpha: 0.10)
            : colors.warning.withValues(alpha: 0.08),
        borderRadius: AppTheme.radiusLg,
        border: Border(
          left: BorderSide(
            color: verified ? colors.success : colors.warning,
            width: 3,
          ),
        ),
      ),
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
                    color: colors.warning,
                  ),
                ),
              const SizedBox(width: AppTheme.space2),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'BATCH $index/$total',
                      style: GoogleFonts.roboto(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.4,
                        color: colors.textSecondary,
                      ),
                    ),
                    const SizedBox(height: 1),
                    Text(
                      item.batchNumber ?? item.kodeBarang ?? 'Item ${item.id}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.robotoMono(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: colors.foreground,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      item.namaBarang ?? item.kodeBarang ?? 'Tanpa nama',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.roboto(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: colors.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
              if (deltaInfo != null)
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppTheme.space2,
                    vertical: 2,
                  ),
                  decoration: BoxDecoration(
                    color: deltaInfo.$2.withValues(alpha: 0.12),
                    borderRadius: AppTheme.radiusFull,
                  ),
                  child: Text(
                    deltaInfo.$1,
                    style: GoogleFonts.roboto(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: deltaInfo.$2,
                    ),
                  ),
                )
              else
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppTheme.space2,
                    vertical: 2,
                  ),
                  decoration: BoxDecoration(
                    color: draft != null
                        ? colors.infoWell
                        : verified
                        ? colors.success.withValues(alpha: 0.18)
                        : colors.warning.withValues(alpha: 0.18),
                    borderRadius: AppTheme.radiusFull,
                  ),
                  child: Text(
                    draft != null
                        ? 'Draf'
                        : verified
                        ? 'Sudah dihitung'
                        : 'Belum dihitung',
                    style: GoogleFonts.roboto(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: draft != null
                          ? colors.info
                          : verified
                          ? colors.success
                          : colors.warning,
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: AppTheme.space2),
          Text(
            'Barcode ${item.barcodeLabel ?? '—'}'
            '${item.tanggalPenerimaan != null ? ' · Terima ${_formatDate(item.tanggalPenerimaan)}' : ''}'
            ' · Exp ${_formatDate(item.expiredDateIni)}',
            style: GoogleFonts.roboto(
              fontSize: 11,
              height: 1.35,
              color: colors.textSecondary,
            ),
          ),
          if (draft != null)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                'Draf CRT ${_formatQty(_draftQty(draft!['qty_fisik_crt']))} · '
                'PCS ${_formatQty(_draftQty(draft!['qty_fisik_pcs']))} — belum dikirim',
                style: GoogleFonts.roboto(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: colors.info,
                ),
              ),
            ),
          if (item.diterimaMingguIni)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppTheme.space2,
                  vertical: 2,
                ),
                decoration: BoxDecoration(
                  color: colors.primaryWell,
                  borderRadius: AppTheme.radiusFull,
                  border: Border.all(color: colors.primaryWellBorder),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.local_shipping_rounded,
                      size: 11,
                      color: colors.primaryWellText,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      'Terima minggu ini',
                      style: GoogleFonts.roboto(
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        color: colors.primaryWellText,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          const SizedBox(height: 2),
          Text(
            'Acuan batch CRT ${_formatQty(item.expectedCrt)} · PCS '
            '${item.expectedPcs == null ? 'tanpa acuan' : _formatQty(item.expectedPcs)}',
            style: GoogleFonts.roboto(fontSize: 11, color: colors.textMuted),
          ),
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
          if (verified) ...[
            const SizedBox(height: 2),
            Text(
              'Fisik CRT ${_formatQty(item.qtyFisikCrt)} · PCS ${_formatQty(item.qtyFisikPcs)}',
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
              text: verified ? 'Hitung Ulang' : 'Hitung Fisik',
              onPressed: onCount,
              height: 44,
            ),
          ],
        ],
      ),
    );
  }
}
