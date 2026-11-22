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

/// Nilai FISIK untuk tampilan metrik — CRT + BALL (unit kedua dari fisik)
/// bila ada. Pola ini sama dengan ACUAN di baris produk agar input kedua
/// unit tidak terlihat: user lihat hanya "fokus" ke angka CRT.
String _fisikMetricValue(double? crt, double? pcs) {
  var text = '${_formatQty(crt)} CRT';
  if (pcs != null && pcs != 0) {
    text += ' · ${_formatQty(pcs)} BALL';
  }
  return text;
}

/// Nilai display FISIK — saat satuan komposit (master NPN) aktif,
/// tampilkan total PCS dengan satuan komposit; sekaligus lihat
/// [_fisikMetricValue] bila tak ada satuan komposit.
String _compositeFisikValue(String? unit, double pcs, double crt) =>
    unit != null && unit.isNotEmpty
    ? '${_formatQty(pcs)} $unit'
    : _fisikMetricValue(crt, pcs);

/// Satuan komposit dari koleksi item — pertama yang punya data NPN
/// (production may vary per wave).
String? _firstCompUnit(Iterable<OpnameExpiredSessionItem> items) {
  for (var item in items) {
    if (item.compositeUnit != null) {
      return item.compositeUnit;
    }
  }
  return null;
}

/// Total hasil inputan fisik di sesi: jumlah CRT/BALL yang terverifikasi.
/// Ditampilkan di header sesi biar petugas langsung tahu berapa total fisik
/// dimasukkan (lihat kolom FISIK per baris) di lapangan.
(double, double) _sessionTotalFisik(OpnameExpiredSession session) {
  var crt = 0.0;
  var pcs = 0.0;
  for (var item in session.items) {
    if (!item.isVerified) {
      continue;
    }
    crt += item.qtyFisikCrt ?? 0;
    pcs += item.qtyFisikPcs ?? 0;
  }
  return (crt, pcs);
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

/// Nama bulan Indonesia untuk informasi batch. Tanggal terima/kedaluwarsa
/// ditulis "9 Sep 2026" (bukan 09/09/2026) supaya tidak ambigu di layar
/// kecil dan langsung terbaca sebagai tanggal, bukan angka acak.
const List<String> _shortMonths = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
];

String _formatDateLong(String? iso) {
  var raw = iso?.trim();
  if (raw == null || raw.isEmpty) {
    return '—';
  }
  var parsed = DateTime.tryParse(raw);
  if (parsed == null) {
    return raw;
  }
  return '${parsed.day} ${_shortMonths[parsed.month - 1]} ${parsed.year}';
}

/// Teks sisa umur simpan dari backend (`sisa_hari`, boleh negatif).
/// Tidak dihitung ulang di klien agar zona waktu gudang tetap otoritatif.
/// Null saat backend tidak mengirim angka — lebih jujur daripada menulis
/// "Tanpa tanggal" padahal tanggal kedaluwarsa batch tersedia.
String? _daysLeftLabel(int? days) {
  if (days == null) {
    return null;
  }
  if (days < 0) {
    return 'Lewat ${-days} hari';
  }
  if (days == 0) {
    return 'Hari ini';
  }
  return '$days hari lagi';
}

/// Nada urgensi kedaluwarsa: merah lewat, oranye <= 7 hari, kuning <= 30
/// hari, hijau sisanya — pola yang sama dengan dashboard expiry modern.
Color _expiryTone(ThemeColors colors, int? days) {
  if (days == null) {
    return colors.textMuted;
  }
  if (days < 0) {
    return colors.danger;
  }
  if (days <= 7) {
    return colors.critical;
  }
  if (days <= 30) {
    return colors.warning;
  }
  return colors.success;
}

/// Nada kartu kedaluwarsa: utamakan sisa hari (paling presisi), lalu jatuh
/// ke status risiko backend bila angka sisa hari tidak tersedia.
Color _expiryToneForItem(ThemeColors colors, OpnameExpiredSessionItem item) {
  if (item.sisaHariBatch != null) {
    return _expiryTone(colors, item.sisaHariBatch);
  }
  return switch ((item.statusIni ?? '').trim().toUpperCase()) {
    'EXPIRED' => colors.danger,
    'KRITIS' => colors.critical,
    'PERHATIAN' => colors.warning,
    'AMAN' => colors.success,
    _ => colors.textMuted,
  };
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

/// Kunci kelompokan principal di halaman detail sesi. Sumber utama
/// `clusterLabel` (principal_1, dari backend — sama seperti
/// monitoring kadaluarsa di web); fallback = kode produk, agar tetap
/// tertata bila data wave lama tidak punya principal.
String _principalKey(OpnameExpiredSessionItem item) {
  var principal = item.clusterLabel?.trim().toUpperCase();
  if (principal != null && principal.isNotEmpty) {
    return principal;
  }
  return _productKey(item);
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
/// koreksi diterapkan saat web memvalidasi, bukan per baris.
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
  // barang. Ringkasan + progres tetap terlihat. Otomatis ciutkan saat user
  // gulir ke bawah (pattern modern) dan kembali saat balik ke atas.
  bool _headerCompact = false;
  Timer? _searchTimer;

  final ScrollController _sessionScrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _sessionScrollController.addListener(_onSessionScrolled);
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
    _sessionScrollController.removeListener(_onSessionScrolled);
    _sessionScrollController.dispose();
    _searchTimer?.cancel();
    _provider.dispose();
    super.dispose();
  }

  /// Header ikut kompak saat daftar gulir ke bawah (user mulai mencari
  /// barang), kembali ke full saat balik ke atas.
  void _onSessionScrolled() {
    if (!_sessionScrollController.hasClients) {
      return;
    }
    var compact = _sessionScrollController.offset > 120;
    if (compact != _headerCompact) {
      setState(() => _headerCompact = compact);
    }
  }

  /// Debounce pencarian — typenuk sempit tidak meledak rebuild daftar per
  /// keystroke, hanya setelah 200 ms tanpa input.
  void _onSearchChanged(String value) {
    _searchTimer?.cancel();
    _searchTimer = Timer(const Duration(milliseconds: 200), () {
      if (!mounted) {
        return;
      }
      setState(() => _search = value);
    });
  }

  /// Hanya mengosongkan pencarian — filter status yang dipilih petugas
  /// tidak boleh ikut hilang saat menekan tombol "Bersihkan" di kolom cari.
  void _clearSearch() {
    _searchTimer?.cancel();
    setState(() {
      _searchController.clear();
      _search = '';
    });
  }

  /// Kembalikan detail ke kondisi awal saat sesi diganti atau saat petugas
  /// menekan "Tampilkan semua" pada empty state.
  void _resetDetailFilters() {
    _searchTimer?.cancel();
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
                : LayoutBuilder(
                    builder: (context, constraints) {
                      // Tablet: konten dibatasi 720dp dan ditengah, tidak
                      // diregangkan penuh seperti versi lama.
                      var side = constraints.maxWidth >= 760
                          ? (constraints.maxWidth - 720) / 2
                          : AppTheme.space4;
                      return ListView.separated(
                        itemCount: provider.sessions.length,
                        separatorBuilder: (child, index) =>
                            const SizedBox(height: AppTheme.space3),
                        padding: EdgeInsets.fromLTRB(
                          side,
                          AppTheme.space4,
                          side,
                          AppTheme.space4,
                        ),
                        itemBuilder: (_, index) => _OpnameSessionTile(
                          session: provider.sessions[index],
                          onTap: () {
                            // Filter/pencarian dari sesi sebelumnya jangan
                            // terbawa ke sesi lain — petugas selalu melihat
                            // kondisi awal.
                            _resetDetailFilters();
                            var id = provider.sessions[index].id;
                            provider.show(id);
                            _loadDrafts(id);
                          },
                        ),
                      );
                    },
                  ),
          );

    var inDetail = provider.selected != null;
    var colors = context.colors;

    return Scaffold(
      backgroundColor: colors.background,
      appBar: AppBar(
        elevation: 0,
        scrolledUnderElevation: 0,
        backgroundColor: colors.background,
        leading: inDetail
            ? IconButton(
                tooltip: 'Kembali ke daftar',
                icon: const Icon(Icons.arrow_back_rounded),
                onPressed: () {
                  _resetDetailFilters();
                  provider.clearSelection();
                },
              )
            : const Icon(Icons.inventory_2_rounded, size: 20),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Sesi Opname'),
            Text(
              inDetail
                  ? 'Hitung fisik · ${_formatDate(provider.selected!.weekStart)}'
                  : 'Tugas lapangan · ${provider.sessions.length} sesi aktif',
              style: GoogleFonts.roboto(
                fontSize: 10.5,
                fontWeight: FontWeight.w500,
                color: colors.textMuted,
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            onPressed: provider.load,
            tooltip: 'Muat ulang',
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: Column(
        children: [
          if (!inDetail && provider.sessions.isNotEmpty && !provider.isLoading)
            _buildOverviewBand(provider),
          Expanded(child: SafeArea(child: content)),
        ],
      ),
      bottomNavigationBar: canView && inDetail
          ? _buildActionDock(provider, context)
          : null,
    );
  }

  /// Ringkasan beban kerja di atas daftar: berapa sesi, berapa batch, dan
  /// berapa yang masih harus dihitung — dihitung dari agregat backend.
  Widget _buildOverviewBand(OpnameExpiredSessionProvider provider) {
    var colors = context.colors;
    var batchCount = 0;
    var pendingCount = 0;
    for (var session in provider.sessions) {
      var total = session.itemsCount ?? session.items.length;
      var done =
          session.verifiedCount ??
          session.items.where((i) => i.isVerified).length;
      batchCount += total;
      pendingCount += total - done;
    }

    return Container(
      width: double.infinity,
      margin: const EdgeInsets.fromLTRB(
        AppTheme.space4,
        AppTheme.space2,
        AppTheme.space4,
        0,
      ),
      padding: const EdgeInsets.all(AppTheme.space3),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            AppTheme.primary600.withValues(alpha: 0.14),
            AppTheme.primary600.withValues(alpha: 0.04),
          ],
        ),
        borderRadius: AppTheme.radius2xl,
        border: Border.all(color: AppTheme.primary600.withValues(alpha: 0.2)),
      ),
      child: Row(
        children: [
          Expanded(
            child: _OverviewMetric(
              icon: Icons.assignment_rounded,
              value: '${provider.sessions.length}',
              label: 'Sesi aktif',
              color: AppTheme.primary600,
            ),
          ),
          Container(width: 1, height: 34, color: colors.border),
          Expanded(
            child: _OverviewMetric(
              icon: Icons.layers_rounded,
              value: '$batchCount',
              label: 'Total batch',
              color: colors.info,
            ),
          ),
          Container(width: 1, height: 34, color: colors.border),
          Expanded(
            child: _OverviewMetric(
              icon: Icons.pending_actions_rounded,
              value: '$pendingCount',
              label: 'Perlu dihitung',
              color: colors.warning,
            ),
          ),
        ],
      ),
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
    // Crossref: produk disatukan di bawah header principal — mirip
    // monitoring kadaluarsa di web (`clusterLabel`), agar setiap principal
    // (mis. P3-BLC) memiliki satu kelompok yang rapi.
    var principalGroups = <String, List<String>>{};
    for (var key in products.keys) {
      var principal = _principalKey(products[key]!.first);
      principalGroups.putIfAbsent(principal, () => []).add(key);
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
          for (var group in principalGroups.entries) ...[
            _ExpandablePrincipalGroup(
              label: group.key,
              productCount: group.value.length,
              batchCount: group.value.fold(
                0,
                (sum, key) => sum + (products[key]?.length ?? 0),
              ),
              cards: [
                for (var productKey in group.value)
                  _OpnameProductCard(
                    items: products[productKey]!,
                    allItems: allProducts[productKey] ?? products[productKey]!,
                    drafts: _drafts,
                    onCount: session.acceptsCounting
                        ? (item) => _showVerifySheet(context, session, item)
                        : null,
                  ),
                const SizedBox(height: AppTheme.space3),
              ],
            ),
            const SizedBox(height: AppTheme.space3),
          ],
        ],
      );
    }

    // Header ikut bergulir bersama daftar — setelah petugas menggulir sedikit,
    // seluruh layar dipakai untuk barang yang akan dihitung.
    return RefreshIndicator(
      onRefresh: () => provider.show(session.id),
      child: ListView(
        controller: _sessionScrollController,
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(
          AppTheme.space3,
          AppTheme.space2,
          AppTheme.space3,
          AppTheme.space8,
        ),
        children: [
          // Batas lebar saat dibuka di tablet — daftar tetap terbaca, tidak
          // meregang selebar layar. Di ponsel (> 360dp) tidak ada perubahan.
          Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 760),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _buildSessionHeaderCard(session, countedTotal),
                  if (session.items.length > 1) ...[
                    const SizedBox(height: AppTheme.space3),
                    TextField(
                      controller: _searchController,
                      onChanged: _onSearchChanged,
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
            ),
          ),
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
              color: selected ? AppTheme.primary600 : colors.surfaceCard,
              borderRadius: AppTheme.radiusFull,
              border: Border.all(
                color: selected ? AppTheme.primary600 : colors.border,
              ),
              boxShadow: selected
                  ? [
                      BoxShadow(
                        color: AppTheme.primary600.withValues(alpha: 0.22),
                        blurRadius: 8,
                        offset: const Offset(0, 2),
                      ),
                    ]
                  : null,
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 6,
                  height: 6,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: selected ? Colors.white : colors.border,
                  ),
                ),
                const SizedBox(width: AppTheme.space2),
                Text(
                  label,
                  style: GoogleFonts.roboto(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: selected ? Colors.white : colors.textSecondary,
                  ),
                ),
                const SizedBox(width: AppTheme.space2),
                Text(
                  '$count',
                  style: GoogleFonts.roboto(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    color: selected ? Colors.white : colors.textMuted,
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
    int countedTotal,
  ) {
    var total = session.items.length;
    var productCount = session.items.map(_productKey).toSet().length;
    var progress = total == 0 ? 0.0 : countedTotal / total;
    var totalFisik = _sessionTotalFisik(session);
    var sessionCompUnit = _firstCompUnit(session.items);
    var hint = _statusHint(session.status);
    var colors = context.colors;

    // Header ringkas: identitas + progres + aksi utama, dibedakan dengan
    // gradient jelemaan agar terasa modern & profesional.
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(10, 8, 10, 9),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            AppTheme.primary600.withValues(alpha: 0.12),
            colors.surfaceCard,
          ],
        ),
        borderRadius: AppTheme.radius2xl,
        border: Border.all(color: colors.border),
        boxShadow: [
          BoxShadow(
            color: AppTheme.primary600.withValues(alpha: 0.08),
            offset: const Offset(0, 2),
            blurRadius: 8,
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
          // Ringkasan lima metrik — pembacaan sekilas tanpa menggulir.
          const SizedBox(height: AppTheme.space2),
          Row(
            children: [
              _OpnameStatTile(
                icon: Icons.layers_rounded,
                value: '$total',
                label: 'Batch',
                color: AppTheme.primary600,
              ),
              const SizedBox(width: 6),
              _OpnameStatTile(
                icon: Icons.task_alt_rounded,
                value: '$countedTotal',
                label: 'Selesai',
                color: colors.success,
              ),
              const SizedBox(width: 6),
              _OpnameStatTile(
                icon: Icons.fact_check_rounded,
                value: _compositeFisikValue(
                  sessionCompUnit,
                  totalFisik.$2,
                  totalFisik.$1,
                ),
                label: 'Fisik',
                color: AppTheme.primary600,
                tooltip:
                    'Total hasil inputan fisik — jumlah seluruh baris yang '
                    'terverifikasi (CRT + BALL).',
              ),
              const SizedBox(width: 6),
              _OpnameStatTile(
                icon: Icons.pending_actions_rounded,
                value: '${total - countedTotal}',
                label: 'Sisa',
                color: colors.warning,
              ),
              const SizedBox(width: 6),
              _OpnameStatTile(
                icon: Icons.edit_note_rounded,
                value: '${_drafts.length}',
                label: 'Draf lokal',
                color: colors.info,
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
            const SizedBox(height: AppTheme.space2),
            Row(
              children: [
                Text(
                  'Progres hitung',
                  style: GoogleFonts.roboto(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: colors.textSecondary,
                  ),
                ),
                const Spacer(),
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
            const SizedBox(height: 6),
            ClipRRect(
              borderRadius: AppTheme.radiusFull,
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 250),
                height: 9,
                decoration: BoxDecoration(color: colors.border),
                child: LinearProgressIndicator(
                  value: progress,
                  minHeight: 9,
                  backgroundColor: Colors.transparent,
                  valueColor: AlwaysStoppedAnimation<Color>(
                    progress == 1 ? colors.success : AppTheme.primary600,
                  ),
                ),
              ),
            ),
          ],
          if (session.inputCompletedAt != null) ...[
            const SizedBox(height: AppTheme.space2),
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

  /// Aksi utama ditempatkan di zona jempol (bottom dock) mengikuti pola
  /// aplikasi gudang modern: tombol tidak ikut bergulir bersama ratusan batch,
  /// sehingga petugas tidak perlu menggulir ke atas untuk memulai/submit.
  Widget? _buildActionDock(
    OpnameExpiredSessionProvider provider,
    BuildContext context,
  ) {
    var session = provider.selected;
    if (session == null) {
      return null;
    }

    if (session.isOpen) {
      return Container(
        decoration: BoxDecoration(
          color: context.colors.surfaceCard,
          border: Border(top: BorderSide(color: context.colors.border)),
        ),
        padding: const EdgeInsets.fromLTRB(
          AppTheme.space4,
          AppTheme.space2,
          AppTheme.space4,
          AppTheme.space2,
        ),
        child: SafeArea(
          top: false,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: _buildSessionActions(session, provider, context),
          ),
        ),
      );
    }

    var total = session.items.length;
    if (!session.acceptsCounting ||
        total == 0 ||
        session.inputCompletedAt != null) {
      return null;
    }
    var ready = session.items
        .where((i) => i.isVerified || _drafts.containsKey(i.id))
        .length;
    if (ready < total) {
      return null;
    }

    return Container(
      decoration: BoxDecoration(
        color: context.colors.surfaceCard,
        border: Border(top: BorderSide(color: context.colors.border)),
      ),
      padding: const EdgeInsets.fromLTRB(
        AppTheme.space4,
        AppTheme.space2,
        AppTheme.space4,
        AppTheme.space2,
      ),
      child: SafeArea(
        top: false,
        child: AppPrimaryButton(
          text: 'Submit Hasil Opname',
          leadingIcon: Icons.send_rounded,
          onPressed: provider.isLoading
              ? null
              : () => _submitHasil(provider, session),
          isLoading: provider.isLoading,
          height: 44,
        ),
      ),
    );
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
  // Kolom masih kosong = belum ada masukan, bukan "fisik 0". Tanpa syarat ini
  // sheet langsung mengatakan "Tandai habis" sebelum petugas mengetik apa pun.
  bool get _isMarkedEmpty =>
      _qtyCrt.text.trim().isNotEmpty && _qtyCrtValue == 0 && _qtyPcsValue == 0;

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
      _qtyCrt.text = expectedCrt != null ? _inputQty(expectedCrt) : '';
      _qtyPcs.text = expectedPcs != null ? _inputQty(expectedPcs) : '';
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
      // Tindak lanjut fisik (retur/disposal) dan koreksi waktu habis
      // tetap dipicu saat approver memvalidasi di web.
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
    var hasInput = _qtyCrt.text.trim().isNotEmpty;
    var expiryTone = _expiryToneForItem(colors, item);

    Color feedbackColor = _isMarkedEmpty
        ? colors.warning
        : delta == null
        ? colors.textMuted
        : delta == 0
        ? colors.success
        : delta > 0
        ? colors.warning
        : colors.danger;

    String feedbackText = _isMarkedEmpty
        ? 'Tandai habis — fisik 0; koreksi (retur/disposal) dilakukan saat web memvalidasi sesi ini.'
        : delta == null
        ? 'Isi qty fisik untuk melihat selisih terhadap acuan.'
        : delta == 0
        ? 'Sesuai acuan'
        : 'Selisih ${delta > 0 ? '+' : ''}${_formatQty(delta)} CRT dari acuan';

    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: Container(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.of(context).size.height * 0.94,
        ),
        decoration: BoxDecoration(
          color: colors.background,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
          border: Border(top: BorderSide(color: colors.border)),
        ),
        child: SafeArea(
          top: false,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Header tetap terlihat; isi bisa digulir saat keyboard muncul.
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Center(
                      child: Container(
                        width: 40,
                        height: 4,
                        decoration: BoxDecoration(
                          color: colors.border,
                          borderRadius: BorderRadius.circular(99),
                        ),
                      ),
                    ),
                    const SizedBox(height: 14),
                    Row(
                      children: [
                        Container(
                          width: 42,
                          height: 42,
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              colors: [
                                AppTheme.primary600.withValues(alpha: 0.9),
                                AppTheme.primary600.withValues(alpha: 0.55),
                              ],
                            ),
                            borderRadius: AppTheme.radiusXl,
                          ),
                          child: const Icon(
                            Icons.fact_check_rounded,
                            size: 22,
                            color: Colors.white,
                          ),
                        ),
                        const SizedBox(width: AppTheme.space3),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Hitung Fisik',
                                style: GoogleFonts.roboto(
                                  fontSize: 19,
                                  fontWeight: FontWeight.w800,
                                  color: colors.foreground,
                                ),
                              ),
                              Text(
                                item.namaBarang ??
                                    item.kodeBarang ??
                                    'Batch tanpa nama',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: GoogleFonts.roboto(
                                  fontSize: 11,
                                  color: colors.textMuted,
                                ),
                              ),
                            ],
                          ),
                        ),
                        IconButton(
                          onPressed: () => Navigator.of(context).pop(),
                          icon: const Icon(Icons.close_rounded, size: 22),
                          tooltip: 'Tutup',
                          color: colors.textMuted,
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              Flexible(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(20, 14, 20, 12),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      _buildTargetCard(colors, item, expiryTone),
                      const SizedBox(height: 16),
                      Text(
                        'AKSI CEPAT',
                        style: GoogleFonts.roboto(
                          fontSize: 10,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 0.8,
                          color: colors.textMuted,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Expanded(
                            child: _QuickActionButton(
                              label:
                                  'Sesuai acuan (${_formatQty(item.expectedCrt)} CRT)',
                              icon: Icons.done_all_rounded,
                              onTap: _applyAcuan,
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: _QuickActionButton(
                              label: 'Habis (0)',
                              icon: Icons.inventory_2_outlined,
                              onTap: _applyHabis,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 18),
                      Text(
                        'HASIL HITUNG',
                        style: GoogleFonts.roboto(
                          fontSize: 10,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 0.8,
                          color: colors.textMuted,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            flex: 3,
                            child: _QtyStepper(
                              fieldKey: const Key('verify_qty_crt'),
                              label: 'Qty Fisik (CRT)',
                              controller: _qtyCrt,
                              onChanged: (_) => setState(() {}),
                              onStep: (step) => _stepQty(_qtyCrt, step),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            flex: 2,
                            child: _QtyStepper(
                              fieldKey: const Key('verify_qty_pcs'),
                              label: 'Qty (PCS)',
                              controller: _qtyPcs,
                              onChanged: (_) => setState(() {}),
                              onStep: (step) => _stepQty(_qtyPcs, step),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      _buildComparisonCard(
                        colors,
                        item,
                        delta,
                        feedbackColor,
                        feedbackText,
                        hasInput,
                      ),
                      const SizedBox(height: 16),
                      AppTextField(
                        controller: _notes,
                        label: 'Catatan (opsional)',
                        maxLines: 2,
                      ),
                      if (_errorMessage != null) ...[
                        const SizedBox(height: 12),
                        Container(
                          padding: const EdgeInsets.all(12),
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
                      ],
                    ],
                  ),
                ),
              ),
              // Aksi utama selalu di zona jempol — tidak ikut tergulir.
              Container(
                decoration: BoxDecoration(
                  color: colors.background,
                  border: Border(top: BorderSide(color: colors.border)),
                ),
                padding: const EdgeInsets.fromLTRB(20, 10, 20, 12),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    AppPrimaryButton(
                      text: 'Simpan Hasil Hitung',
                      onPressed: _saving ? null : _save,
                      isLoading: _saving,
                      height: 50,
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
            ],
          ),
        ),
      ),
    );
  }

  /// Satu langkah +/- pada kolom qty. Nilai kosong dianggap 0 sehingga
  /// tombol tambah langsung memberi angka 1, dan tombol kurang tidak pernah
  /// membuat angka negatif.
  void _stepQty(TextEditingController controller, double step) {
    var current = double.tryParse(controller.text.replaceAll(',', '.')) ?? 0;
    if (current == 0 && step < 0) {
      return;
    }
    var next = (current + step).clamp(0, double.infinity).toDouble();
    var text = _inputQty(next);
    controller.value = TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: text.length),
    );
    setState(() {});
  }

  /// Pembanding tiga kolom — pola "expected vs counted vs variance" yang
  /// dipakai aplikasi stock opname modern: acuan, hasil fisik, selisih.
  Widget _buildComparisonCard(
    ThemeColors colors,
    OpnameExpiredSessionItem item,
    double? delta,
    Color feedbackColor,
    String feedbackText,
    bool hasInput,
  ) => AnimatedContainer(
    duration: const Duration(milliseconds: 200),
    padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
    decoration: BoxDecoration(
      color: feedbackColor.withValues(alpha: 0.08),
      borderRadius: AppTheme.radiusLg,
      border: Border.all(color: feedbackColor.withValues(alpha: 0.35)),
    ),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          children: [
            _SheetMetric(
              label: 'ACUAN',
              value:
                  '${_formatQty(item.expectedCrt)} CRT'
                  '${item.expectedPcs != null ? ' · ${_formatQty(item.expectedPcs)} PCS' : ''}',
              color: colors.textSecondary,
            ),
            _SheetMetric(
              label: 'FISIK',
              value: hasInput
                  ? _fisikMetricValue(_qtyCrtValue, _qtyPcsValue)
                  : '—',
              color: colors.foreground,
            ),
            _SheetMetric(
              label: 'SELISIH',
              value: delta == null
                  ? '—'
                  : '${delta > 0 ? '+' : ''}${_formatQty(delta)} CRT',
              color: feedbackColor,
            ),
          ],
        ),
        const SizedBox(height: 8),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(
              _isMarkedEmpty
                  ? Icons.inventory_2_outlined
                  : delta == null
                  ? Icons.info_outline_rounded
                  : delta == 0
                  ? Icons.check_circle_outline_rounded
                  : delta > 0
                  ? Icons.trending_up_rounded
                  : Icons.trending_down_rounded,
              size: 16,
              color: feedbackColor,
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                feedbackText,
                style: GoogleFonts.roboto(
                  fontSize: 11.5,
                  fontWeight: FontWeight.w700,
                  height: 1.35,
                  color: feedbackColor,
                ),
              ),
            ),
          ],
        ),
      ],
    ),
  );

  /// Identitas batch + tanggal yang paling sering dicari petugas.
  /// Tanggal terima dan kedaluwarsa punya blok sendiri dengan angka besar
  /// dan status relatif ("25 hari lagi"), bukan teks kecil terpotong.
  Widget _buildTargetCard(
    ThemeColors colors,
    OpnameExpiredSessionItem item,
    Color expiryTone,
  ) => Container(
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(
      gradient: LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [
          AppTheme.primary600.withValues(alpha: 0.12),
          colors.surfaceCard,
        ],
      ),
      borderRadius: AppTheme.radius2xl,
      border: Border.all(color: AppTheme.primary600.withValues(alpha: 0.25)),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            const Icon(
              Icons.qr_code_2_rounded,
              size: 18,
              color: AppTheme.primary600,
            ),
            const SizedBox(width: 6),
            Expanded(
              child: Text(
                item.batchNumber ?? item.kodeBarang ?? 'Item ${item.id}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: GoogleFonts.robotoMono(
                  fontSize: 15,
                  fontWeight: FontWeight.w800,
                  color: colors.foreground,
                ),
              ),
            ),
            if (item.statusIni != null && item.statusIni!.trim().isNotEmpty)
              AppBadge(
                text: OpnameStatus.label(item.statusIni),
                variant: _riskBadgeVariant(item.statusIni!),
              ),
          ],
        ),
        const SizedBox(height: 4),
        Text(
          '${item.kodeBarang ?? '-'} · ${item.namaBarang ?? 'Tanpa nama'}',
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: GoogleFonts.roboto(
            fontSize: 12,
            height: 1.3,
            color: colors.textSecondary,
          ),
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: _TargetMetric(
                icon: Icons.inventory_2_rounded,
                label: 'QTY EXPIRED',
                value: '${_formatQty(item.qtyWaveCrt)} CRT',
                color: AppTheme.primary600,
              ),
            ),
            const SizedBox(width: 6),
            Expanded(
              child: _TargetMetric(
                icon: Icons.my_location_rounded,
                label: 'ACUAN SISTEM',
                value:
                    '${_formatQty(item.expectedCrt)} CRT'
                    '${item.expectedPcs != null ? ' · ${_formatQty(item.expectedPcs)} PCS' : ''}',
                color: colors.foreground,
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: _DateFactCard(
                icon: Icons.event_available_rounded,
                label: 'DITERIMA',
                date: _formatDateLong(item.tanggalPenerimaan),
                tone: colors.info,
              ),
            ),
            const SizedBox(width: 6),
            Expanded(
              child: _DateFactCard(
                icon: Icons.hourglass_bottom_rounded,
                label: 'KEDALUWARSA',
                date: _formatDateLong(item.expiredDateIni),
                tone: expiryTone,
                helper: _daysLeftLabel(item.sisaHariBatch),
              ),
            ),
          ],
        ),
        if (item.barcodeLabel != null && item.barcodeLabel!.isNotEmpty) ...[
          const SizedBox(height: 8),
          Row(
            children: [
              Icon(Icons.qr_code_rounded, size: 13, color: colors.textMuted),
              const SizedBox(width: 4),
              Expanded(
                child: Text(
                  'Barcode ${item.barcodeLabel}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.robotoMono(
                    fontSize: 10.5,
                    color: colors.textMuted,
                  ),
                ),
              ),
              if (item.umurSimpanHari != null)
                Text(
                  'Umur simpan ${item.umurSimpanHari} hari',
                  style: GoogleFonts.roboto(
                    fontSize: 10,
                    color: colors.textMuted,
                  ),
                ),
            ],
          ),
        ],
        // Bantuan analisa: masalah yang sudah ada sejak penerimaan.
        if (item.selisihTerima != null && item.selisihTerima != 0)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              'Sudah selisih saat terima: '
              '${item.selisihTerima! > 0 ? '+' : ''}'
              '${_formatQty(item.selisihTerima)} CRT',
              style: GoogleFonts.roboto(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: colors.warning,
              ),
            ),
          )
        else if (item.conditionTerima != null &&
            item.conditionTerima!.toUpperCase() != 'FISIK_BAGUS')
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              'Kondisi saat terima: ${_conditionLabel(item.conditionTerima)}',
              style: GoogleFonts.roboto(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: colors.warning,
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

/// Tombol aksi cepat berukuran sentuh lapangan (>= 44 dp), menggantikan
/// chip kecil yang sulit ditekan saat memegang barang.
class _QuickActionButton extends StatelessWidget {
  const _QuickActionButton({
    required this.label,
    required this.icon,
    this.onTap,
  });

  final String label;
  final IconData icon;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    var colors = context.colors;
    return SizedBox(
      height: 46,
      child: OutlinedButton.icon(
        onPressed: onTap,
        icon: Icon(icon, size: 17, color: AppTheme.primary600),
        label: Text(
          label,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: GoogleFonts.roboto(
            fontSize: 11.5,
            fontWeight: FontWeight.w700,
            color: colors.foreground,
          ),
        ),
        style: OutlinedButton.styleFrom(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          backgroundColor: colors.surfaceCard,
          side: BorderSide(color: colors.border),
          shape: const RoundedRectangleBorder(borderRadius: AppTheme.radiusLg),
        ),
      ),
    );
  }
}

/// Blok tanggal yang mudah dipindai: label kecil, tanggal besar, dan status
/// relatif berwarna. Dipakai di baris batch maupun sheet hitung agar
/// tanggal terima/kedaluwarsa tidak lagi jadi teks pinggiran yang terpotong.
class _DateFactCard extends StatelessWidget {
  const _DateFactCard({
    required this.icon,
    required this.label,
    required this.date,
    required this.tone,
    this.helper,
    this.dense = false,
  });

  final IconData icon;
  final String label;
  final String date;
  final Color tone;
  final String? helper;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    var colors = context.colors;
    if (dense) {
      // Mode ringkas (baris batch/produk): satu baris — label + tanggal +
      // helper, menyisakkan ruang untuk metrik & chip di bawahnya.
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
        decoration: BoxDecoration(
          color: tone.withValues(alpha: 0.07),
          borderRadius: AppTheme.radiusLg,
          border: Border.all(color: tone.withValues(alpha: 0.22)),
        ),
        child: Row(
          children: [
            Icon(icon, size: 11, color: tone),
            const SizedBox(width: 5),
            Expanded(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.baseline,
                textBaseline: TextBaseline.alphabetic,
                children: [
                  Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.roboto(
                      fontSize: 9,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.4,
                      color: tone,
                    ),
                  ),
                  const SizedBox(width: 4),
                  Expanded(
                    child: FittedBox(
                      fit: BoxFit.scaleDown,
                      alignment: Alignment.centerLeft,
                      child: Text(
                        date,
                        maxLines: 1,
                        style: GoogleFonts.roboto(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: colors.foreground,
                        ),
                      ),
                    ),
                  ),
                  if (helper != null) ...[
                    const SizedBox(width: 3),
                    Expanded(
                      child: Text(
                        helper!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.roboto(
                          fontSize: 9,
                          fontWeight: FontWeight.w600,
                          color: tone,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      );
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
      decoration: BoxDecoration(
        color: tone.withValues(alpha: 0.07),
        borderRadius: AppTheme.radiusLg,
        border: Border.all(color: tone.withValues(alpha: 0.22)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 16, color: tone),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.roboto(
                    fontSize: 9.5,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.5,
                    color: colors.textMuted,
                  ),
                ),
                const SizedBox(height: 1),
                FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerLeft,
                  child: Text(
                    date,
                    maxLines: 1,
                    style: GoogleFonts.roboto(
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                      height: 1.15,
                      color: colors.foreground,
                    ),
                  ),
                ),
                if (helper != null) ...[
                  const SizedBox(height: 1),
                  Text(
                    helper!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.roboto(
                      fontSize: 10.5,
                      fontWeight: FontWeight.w700,
                      color: tone,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Metrik ringkas pada kartu target sheet hitung (qty expired / acuan).
class _TargetMetric extends StatelessWidget {
  const _TargetMetric({
    required this.icon,
    required this.label,
    required this.value,
    required this.color,
  });

  final IconData icon;
  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    var colors = context.colors;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 7),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: AppTheme.radiusLg,
      ),
      child: Row(
        children: [
          Icon(icon, size: 14, color: color),
          const SizedBox(width: 6),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.roboto(
                    fontSize: 8.5,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.4,
                    color: colors.textMuted,
                  ),
                ),
                Text(
                  value,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.roboto(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w800,
                    color: color,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Kolom pembanding acuan / fisik / selisih di sheet hitung.
class _SheetMetric extends StatelessWidget {
  const _SheetMetric({
    required this.label,
    required this.value,
    required this.color,
  });

  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    var colors = context.colors;
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: GoogleFonts.roboto(
              fontSize: 8.5,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.4,
              color: colors.textMuted,
            ),
          ),
          const SizedBox(height: 2),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              value,
              maxLines: 1,
              style: GoogleFonts.roboto(
                fontSize: 13,
                fontWeight: FontWeight.w800,
                color: color,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Kolom angka dengan tombol +/- besar — input lapangan tanpa harus
/// memanggil keyboard untuk koreksi satu-dua unit.
class _QtyStepper extends StatelessWidget {
  const _QtyStepper({
    required this.label,
    required this.controller,
    required this.onChanged,
    required this.onStep,
    this.fieldKey,
  });

  final String label;
  final TextEditingController controller;
  final ValueChanged<String> onChanged;
  final ValueChanged<double> onStep;
  final Key? fieldKey;

  @override
  Widget build(BuildContext context) {
    var colors = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: GoogleFonts.roboto(
            fontSize: 11,
            fontWeight: FontWeight.w700,
            color: colors.textSecondary,
          ),
        ),
        const SizedBox(height: 6),
        Container(
          height: 54,
          decoration: BoxDecoration(
            color: colors.surfaceCard,
            borderRadius: AppTheme.radiusXl,
            border: Border.all(color: colors.border),
          ),
          child: Row(
            children: [
              _StepButton(
                icon: Icons.remove_rounded,
                tooltip: 'Kurangi',
                onTap: () => onStep(-1),
              ),
              Expanded(
                child: TextField(
                  key: fieldKey,
                  controller: controller,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  textAlign: TextAlign.center,
                  onChanged: onChanged,
                  style: GoogleFonts.roboto(
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                    color: colors.foreground,
                  ),
                  decoration: InputDecoration(
                    isCollapsed: true,
                    filled: false,
                    border: InputBorder.none,
                    enabledBorder: InputBorder.none,
                    focusedBorder: InputBorder.none,
                    disabledBorder: InputBorder.none,
                    errorBorder: InputBorder.none,
                    focusedErrorBorder: InputBorder.none,
                    contentPadding: EdgeInsets.zero,
                    hintText: '0',
                    hintStyle: GoogleFonts.roboto(
                      fontSize: 22,
                      fontWeight: FontWeight.w800,
                      color: colors.textMuted,
                    ),
                  ),
                ),
              ),
              _StepButton(
                icon: Icons.add_rounded,
                tooltip: 'Tambah',
                onTap: () => onStep(1),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _StepButton extends StatelessWidget {
  const _StepButton({
    required this.icon,
    required this.tooltip,
    required this.onTap,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Tooltip(
    message: tooltip,
    child: InkWell(
      onTap: onTap,
      borderRadius: AppTheme.radiusLg,
      child: SizedBox(
        width: 40,
        height: 54,
        child: Icon(icon, size: 20, color: AppTheme.primary600),
      ),
    ),
  );
}

/// Angka polos untuk isi kolom input: tanpa pemisah ribuan agar bisa
/// di-parse balik saat disimpan ("1.000" tidak boleh terbaca 1,0).
String _inputQty(double value) => value == value.truncateToDouble()
    ? value.toInt().toString()
    : value.toString();

/// Strip durasi opname di header sesi: dari "Mulai Sesi" sampai penghitungan
/// selesai (saat semua baris dalam grup produk siap, petugas tekan Submit).
///
/// - sesi berjalan: durasi hidup berdetak per detik (menit–detik);
/// - sesi selesai: durasi terkunci mulai → input_completed_at, tetap tampil
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
        _parseTimestamp(widget.session.inputCompletedAt) ??
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
        _parseTimestamp(widget.session.inputCompletedAt) ??
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

/// Metrik ringkas di pita ringkasan daftar sesi.
class _OverviewMetric extends StatelessWidget {
  const _OverviewMetric({
    required this.icon,
    required this.value,
    required this.label,
    required this.color,
  });

  final IconData icon;
  final String value;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    var colors = context.colors;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 15, color: color),
            const SizedBox(width: 5),
            Text(
              value,
              style: GoogleFonts.roboto(
                fontSize: 16,
                fontWeight: FontWeight.w800,
                color: color,
              ),
            ),
          ],
        ),
        const SizedBox(height: 2),
        Text(
          label,
          style: GoogleFonts.roboto(
            fontSize: 9.5,
            fontWeight: FontWeight.w600,
            color: colors.textMuted,
          ),
        ),
      ],
    );
  }
}

/// Satu metrik ringkas di header detail (Material 3 metric card).
/// Dipakai untuk memberi pembacaan instan: total, selesai, sisa, dan draf.
class _OpnameStatTile extends StatelessWidget {
  const _OpnameStatTile({
    required this.icon,
    required this.value,
    required this.label,
    required this.color,
    this.tooltip,
  });

  final IconData icon;
  final String value;
  final String label;
  final Color color;
  final String? tooltip;

  @override
  Widget build(BuildContext context) {
    var colors = context.colors;
    return Expanded(
      child: Tooltip(
        message: tooltip ?? '',
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding: const EdgeInsets.symmetric(vertical: 5, horizontal: 4),
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.10),
            borderRadius: AppTheme.radiusLg,
            border: Border.all(color: color.withValues(alpha: 0.22)),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 17, color: color),
              const SizedBox(height: 3),
              Text(
                value,
                style: GoogleFonts.roboto(
                  fontSize: 20,
                  fontWeight: FontWeight.w800,
                  color: color,
                ),
              ),
              const SizedBox(height: 1),
              Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: GoogleFonts.roboto(
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                  color: colors.textMuted,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Progres melingkar padat untuk kartu sesi — lebih mudah dipindai daripada
/// batang 3px, tetap hemat ruang di layar sempit.
class _OpnameProgressRing extends StatelessWidget {
  const _OpnameProgressRing({
    required this.progress,
    required this.counted,
    required this.total,
  });

  final double progress;
  final int counted;
  final int total;

  @override
  Widget build(BuildContext context) {
    var colors = context.colors;
    var done = counted == total;
    return SizedBox(
      width: 46,
      height: 46,
      child: Stack(
        alignment: Alignment.center,
        children: [
          CircularProgressIndicator(
            value: progress,
            strokeWidth: 4,
            backgroundColor: colors.border,
            valueColor: AlwaysStoppedAnimation<Color>(
              done ? colors.success : AppTheme.primary600,
            ),
          ),
          Text(
            total == 0 ? '—' : '${(progress * 100).round()}%',
            style: GoogleFonts.roboto(
              fontSize: 11,
              fontWeight: FontWeight.w800,
              color: done ? colors.success : colors.foreground,
            ),
          ),
        ],
      ),
    );
  }
}

/// Skeleton statis (tanpa animasi berulang) — memberi konteks tata letak
/// lebih cepat daripada spinner tunggal, sesuai pola loading modern.
class _OpnameSessionLoading extends StatelessWidget {
  const _OpnameSessionLoading();

  Widget _placeholder(double width, double height, Color color) => Container(
    width: width,
    height: height,
    decoration: BoxDecoration(
      color: color,
      borderRadius: BorderRadius.circular(6),
    ),
  );

  @override
  Widget build(BuildContext context) {
    var colors = context.colors;
    return ListView(
      padding: const EdgeInsets.all(AppTheme.space4),
      children: [
        Text(
          'Memuat sesi...',
          style: GoogleFonts.roboto(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: colors.textMuted,
          ),
        ),
        const SizedBox(height: AppTheme.space3),
        for (var i = 0; i < 3; i++) ...[
          Container(
            padding: const EdgeInsets.all(AppTheme.space3),
            decoration: BoxDecoration(
              color: colors.surfaceCard,
              borderRadius: AppTheme.radius2xl,
              border: Border.all(color: colors.border),
            ),
            child: Row(
              children: [
                _placeholder(44, 44, colors.surfaceHover),
                const SizedBox(width: AppTheme.space3),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _placeholder(150, 12, colors.surfaceHover),
                      const SizedBox(height: 8),
                      _placeholder(96, 10, colors.surfaceHover),
                    ],
                  ),
                ),
                _placeholder(40, 40, colors.surfaceHover),
              ],
            ),
          ),
          const SizedBox(height: AppTheme.space3),
        ],
      ],
    );
  }
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
    // Daftar dari backend hanya membawa dua agregat (tanpa items). Fallback
    // ke items dipertahankan untuk fixtures/respons lama.
    var counted =
        session.verifiedCount ??
        session.items.where((i) => i.isVerified).length;
    var total = session.itemsCount ?? session.items.length;

    var statusColor = switch (session.status) {
      'APPROVED' || 'COMPLETED' => colors.success,
      'REVISI' => colors.critical,
      'CANCELLED' => colors.danger,
      'PENDING_APPROVAL' => colors.warning,
      _ => AppTheme.primary600,
    };
    var progress = total == 0 ? 0.0 : counted / total;

    return AppCard(
      padding: EdgeInsets.zero,
      onTap: onTap,
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Rail status — warna langsung terbaca tanpa membaca teks badge.
            Container(width: 4, color: statusColor),
            const SizedBox(width: AppTheme.space3),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: AppTheme.space3),
                child: Row(
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: statusColor.withValues(alpha: 0.12),
                        borderRadius: AppTheme.radiusXl,
                      ),
                      child: Icon(_statusIcon, size: 22, color: statusColor),
                    ),
                    const SizedBox(width: AppTheme.space3),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
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
                          const SizedBox(height: 6),
                          AppBadge(
                            text: OpnameSessionStatus.label(session.status),
                            variant: _sessionBadgeVariant(session.status),
                            icon: _sessionIcon(session.status),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: AppTheme.space2),
                    Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        _OpnameProgressRing(
                          progress: progress,
                          counted: counted,
                          total: total,
                        ),
                        const SizedBox(height: 2),
                        Text(
                          total > 0
                              ? '$counted/$total dihitung'
                              : 'Tidak ada batch',
                          style: GoogleFonts.roboto(
                            fontSize: 9.5,
                            color: colors.textMuted,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(width: 2),
                    Icon(
                      Icons.chevron_right_rounded,
                      size: 18,
                      color: colors.textMuted,
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Kartu produk — satu produk, semua batch-nya
// ---------------------------------------------------------------------------

/// Header kelompokan principal: mirik monitoring kadaluarsa di web
/// (3px rail berwarna, nama principal, jumlah produk & batch di dalamnya).
/// Group collapsible per principal — petugas bisa buka/tutup; maksudnya:
/// fokus ke satu principal kalau lagi mengerjakan satu jenis produk.
class _ExpandablePrincipalGroup extends StatefulWidget {
  const _ExpandablePrincipalGroup({
    required this.label,
    required this.productCount,
    required this.batchCount,
    required this.cards,
  });

  final String label;
  final int productCount;
  final int batchCount;
  final List<Widget> cards;

  @override
  State<_ExpandablePrincipalGroup> createState() =>
      _ExpandablePrincipalGroupState();
}

class _ExpandablePrincipalGroupState extends State<_ExpandablePrincipalGroup> {
  bool _expanded = true;

  @override
  Widget build(BuildContext context) {
    var colors = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Material(
          color: colors.surfaceCard,
          borderRadius: AppTheme.radiusXl,
          child: InkWell(
            onTap: () => setState(() => _expanded = !_expanded),
            borderRadius: AppTheme.radiusXl,
            child: Container(
              padding: const EdgeInsets.symmetric(
                horizontal: AppTheme.space2,
                vertical: 6,
              ),
              decoration: BoxDecoration(
                borderRadius: AppTheme.radiusXl,
                border: Border.all(color: colors.border),
              ),
              child: Row(
                children: [
                  Container(
                    width: 28,
                    height: 28,
                    decoration: BoxDecoration(
                      color: colors.primaryWell,
                      borderRadius: AppTheme.radiusLg,
                    ),
                    child: Icon(
                      Icons.business_rounded,
                      size: 15,
                      color: colors.primaryWellText,
                    ),
                  ),
                  const SizedBox(width: AppTheme.space2),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          widget.label,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: GoogleFonts.roboto(
                            fontSize: 13,
                            fontWeight: FontWeight.w800,
                            color: colors.foreground,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          '${widget.productCount} produk · ${widget.batchCount} batch',
                          style: GoogleFonts.roboto(
                            fontSize: 10.5,
                            color: colors.textMuted,
                          ),
                        ),
                      ],
                    ),
                  ),
                  AnimatedRotation(
                    turns: _expanded ? 0 : 0.5,
                    duration: const Duration(milliseconds: 200),
                    child: Icon(
                      Icons.expand_less_rounded,
                      size: 20,
                      color: colors.textMuted,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(height: AppTheme.space2),
        if (_expanded)
          Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: widget.cards,
          ),
      ],
    );
  }
}

/// Ringkasan kecil per produk: total, sudah dihitung, habis/kosong, dan sisa.
/// Ditempatkan di dalam kartu supaya petugas melihat komposisi batch produk
/// yang sama tanpa membuka satu per satu (beberapa batch bisa berisi habis,
/// sebagian belum dihitung).
class _ProductMiniStat extends StatelessWidget {
  const _ProductMiniStat({
    required this.icon,
    required this.label,
    required this.value,
    required this.color,
  });

  final IconData icon;
  final String label;
  final Object value;
  final Color color;

  @override
  Widget build(BuildContext context) => Expanded(
    child: Container(
      padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: AppTheme.radiusLg,
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: color),
          const SizedBox(width: 4),
          Expanded(
            child: Text(
              '$label $value',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: GoogleFonts.roboto(
                fontSize: 12,
                fontWeight: FontWeight.w800,
                color: color,
              ),
            ),
          ),
        ],
      ),
    ),
  );
}

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
    // Batch yang ditandai habis: fisik 0 CRT dan 0 PCS setelah diverifikasi.
    var emptyCount = allItems
        .where(
          (item) =>
              item.isVerified &&
              (item.qtyFisikCrt ?? 0) == 0 &&
              (item.qtyFisikPcs ?? 0) == 0,
        )
        .length;
    var remaining = total - counted;
    var complete = counted == total;
    // Fisik total di produk — dari baris yang terverifikasi: CRT/BALL, atau
    // total PCS dengan satuan komposit master NPN bila setting aktif.
    var compUnit = _firstCompUnit(allItems);
    var totalFisikCrt = allItems
        .where((item) => item.isVerified)
        .fold<double>(0, (sum, item) => sum + (item.qtyFisikCrt ?? 0));
    var totalFisikPcs = allItems
        .where((item) => item.isVerified)
        .fold<double>(0, (sum, item) => sum + (item.qtyFisikPcs ?? 0));
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
      padding: const EdgeInsets.all(10),
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
          const SizedBox(height: 6),
          Row(
            children: [
              _ProductMiniStat(
                icon: Icons.layers_rounded,
                label: 'Total',
                value: total,
                color: AppTheme.primary600,
              ),
              const SizedBox(width: 4),
              _ProductMiniStat(
                icon: Icons.task_alt_rounded,
                label: 'Dihitung',
                value: counted,
                color: colors.success,
              ),
              const SizedBox(width: 4),
              _ProductMiniStat(
                icon: Icons.fact_check_rounded,
                label: 'Fisik',
                value: _compositeFisikValue(
                  compUnit,
                  totalFisikPcs,
                  totalFisikCrt,
                ),
                color: AppTheme.primary600,
              ),
              const SizedBox(width: 4),
              _ProductMiniStat(
                icon: Icons.inventory_2_rounded,
                label: 'Habis',
                value: emptyCount,
                color: colors.warning,
              ),
              const SizedBox(width: 4),
              _ProductMiniStat(
                icon: Icons.pending_actions_rounded,
                label: 'Sisa',
                value: remaining,
                color: colors.textMuted,
              ),
            ],
          ),
          const SizedBox(height: AppTheme.space2),
          for (var i = 0; i < items.length; i++) ...[
            if (i > 0) const SizedBox(height: 4),
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
      padding: const EdgeInsets.fromLTRB(6, 5, 6, 5),
      decoration: BoxDecoration(
        color: colors.foreground.withValues(alpha: 0.06),
        borderRadius: AppTheme.radiusLg,
      ),
      child: Row(
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: accent.withValues(alpha: 0.16),
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
                    fontSize: 15.5,
                    fontWeight: FontWeight.w800,
                    height: 1.3,
                    color: colors.foreground,
                  ),
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        'Qty expired ${_formatQty(stokWave)} CRT'
                        '${stokPcs > 0 ? ' / ${_formatQty(stokPcs)} PCS' : ''}'
                        ' · $total batch',
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
            mainAxisSize: MainAxisSize.min,
            children: [
              _OpnameProgressRing(
                progress: total == 0 ? 0 : counted / total,
                counted: counted,
                total: total,
              ),
              Text(
                '$counted/$total',
                style: GoogleFonts.roboto(
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  color: complete ? colors.success : colors.textSecondary,
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
    var expiryTone = _expiryToneForItem(colors, item);
    var statusColor = verified ? colors.success : colors.warning;
    var statusText = draft != null
        ? 'Draf'
        : verified
        ? 'Sudah dihitung'
        : 'Belum dihitung';

    Widget chip(String text, {Color? color, IconData? icon}) => Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: (color ?? colors.textMuted).withValues(alpha: 0.10),
        borderRadius: AppTheme.radiusFull,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 11, color: color ?? colors.textMuted),
            const SizedBox(width: 4),
          ],
          Text(
            text,
            style: GoogleFonts.roboto(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              color: color ?? colors.textSecondary,
            ),
          ),
        ],
      ),
    );

    return Container(
      padding: const EdgeInsets.fromLTRB(10, 9, 10, 12),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: AppTheme.radiusLg,
        border: Border(left: BorderSide(color: statusColor, width: 3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
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
              const SizedBox(width: 6),
              Text(
                'BATCH $index/$total',
                style: GoogleFonts.roboto(
                  fontSize: 9.5,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.3,
                  color: colors.textMuted,
                ),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  item.batchNumber ?? item.kodeBarang ?? 'Item ${item.id}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.robotoMono(
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                    color: colors.foreground,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 2),
          Text(
            item.namaBarang ?? item.kodeBarang ?? 'Tanpa nama',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: GoogleFonts.roboto(
              fontSize: 10.5,
              color: colors.textSecondary,
            ),
          ),
          const SizedBox(height: 8),
          // Tanggal terima & kedaluwarsa: dua blok besar yang bisa dipindai
          // sekilas, bukan satu baris kecil yang mudah terpotong.
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: _DateFactCard(
                  icon: Icons.event_available_rounded,
                  label: 'DITERIMA',
                  date: _formatDateLong(item.tanggalPenerimaan),
                  tone: colors.info,
                  dense: true,
                ),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: _DateFactCard(
                  icon: Icons.hourglass_bottom_rounded,
                  label: 'KEDALUWARSA',
                  date: _formatDateLong(item.expiredDateIni),
                  tone: expiryTone,
                  helper: _daysLeftLabel(item.sisaHariBatch),
                  dense: true,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          // Acuan vs fisik vs selisih — pola stock opname modern.
          Row(
            children: [
              _MiniFact(
                label: 'ACUAN',
                value: '${_formatQty(item.expectedCrt)} CRT',
                color: colors.textSecondary,
              ),
              _MiniFact(
                label: 'FISIK',
                value: verified
                    ? _compositeFisikValue(
                        item.compositeUnit,
                        item.qtyFisikPcs ?? 0,
                        item.qtyFisikCrt ?? 0,
                      )
                    : '—',
                color: colors.foreground,
              ),
              _MiniFact(
                label: 'SELISIH',
                value: deltaInfo?.$1 ?? '—',
                color: deltaInfo?.$2 ?? colors.textMuted,
              ),
            ],
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 4,
            runSpacing: 4,
            children: [
              chip(
                statusText,
                color: draft != null
                    ? colors.info
                    : verified
                    ? colors.success
                    : colors.warning,
              ),
              if (draft != null)
                chip(
                  'Draf CRT ${_formatQty(_draftQty(draft!['qty_fisik_crt']))} · '
                  'PCS ${_formatQty(_draftQty(draft!['qty_fisik_pcs']))} — belum dikirim',
                  color: colors.info,
                  icon: Icons.save_rounded,
                ),
              chip(
                'Barcode ${item.barcodeLabel ?? '—'}',
                icon: Icons.qr_code_rounded,
              ),
              if (item.umurSimpanHari != null)
                chip(
                  'Umur simpan ${item.umurSimpanHari} hari',
                  icon: Icons.hourglass_empty_rounded,
                ),
              if (item.diterimaMingguIni)
                chip(
                  'Terima minggu ini',
                  color: colors.primaryWellText,
                  icon: Icons.local_shipping_rounded,
                ),
              if (item.selisihTerima != null && item.selisihTerima != 0)
                chip(
                  'Selisih saat terima '
                  '${item.selisihTerima! > 0 ? '+' : ''}'
                  '${_formatQty(item.selisihTerima)} CRT',
                  color: colors.warning,
                  icon: Icons.warning_amber_rounded,
                )
              else if (item.conditionTerima != null &&
                  item.conditionTerima!.toUpperCase() != 'FISIK_BAGUS')
                chip(
                  'Kondisi terima: ${_conditionLabel(item.conditionTerima)}',
                  color: colors.warning,
                  icon: Icons.warning_amber_rounded,
                ),
              if (item.notes != null && item.notes!.isNotEmpty)
                chip('Catatan: ${item.notes}', color: colors.textMuted),
              if (verified && item.disposition != null)
                chip(
                  'Disposisi ${_dispositionLabel(item.disposition)}',
                  color: colors.textMuted,
                  icon: Icons.alt_route_rounded,
                ),
            ],
          ),
          if (onCount != null) ...[
            const SizedBox(height: 8),
            SizedBox(
              height: 44,
              child: OutlinedButton.icon(
                onPressed: onCount,
                icon: Icon(
                  verified ? Icons.refresh_rounded : Icons.edit_note_rounded,
                  size: 18,
                ),
                label: Text(
                  verified ? 'Hitung Ulang' : 'Hitung Fisik',
                  style: GoogleFonts.roboto(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppTheme.primary600,
                  side: const BorderSide(color: AppTheme.primary600),
                  shape: const RoundedRectangleBorder(
                    borderRadius: AppTheme.radiusLg,
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Metrik kecil acuan/fisik/selisih di baris batch.
class _MiniFact extends StatelessWidget {
  const _MiniFact({
    required this.label,
    required this.value,
    required this.color,
  });

  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    var colors = context.colors;
    return Expanded(
      child: Container(
        margin: const EdgeInsets.only(right: 4),
        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 5),
        decoration: BoxDecoration(
          color: colors.surfaceHover,
          borderRadius: AppTheme.radiusLg,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: GoogleFonts.roboto(
                fontSize: 8,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.4,
                color: colors.textMuted,
              ),
            ),
            const SizedBox(height: 1),
            FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: Text(
                value,
                maxLines: 1,
                style: GoogleFonts.roboto(
                  fontSize: 11.5,
                  fontWeight: FontWeight.w800,
                  color: color,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
