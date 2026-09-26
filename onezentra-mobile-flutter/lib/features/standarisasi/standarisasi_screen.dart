import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:onezentra_mobile/core/api_client.dart';
import 'package:onezentra_mobile/features/auth/auth_provider.dart';
import 'package:onezentra_mobile/features/standarisasi/models/standarisasi_models.dart';
import 'package:onezentra_mobile/features/standarisasi/standarisasi_provider.dart';
import 'package:onezentra_mobile/features/standarisasi/standarisasi_service.dart';
import 'package:onezentra_mobile/features/standarisasi/standarisasi_sheets.dart';
import 'package:onezentra_mobile/theme/app_colors.dart';
import 'package:onezentra_mobile/widgets/denied_card.dart';
import 'package:onezentra_mobile/widgets/filter_chips.dart';
import 'package:onezentra_mobile/widgets/page_header.dart';
import 'package:onezentra_mobile/widgets/section_card.dart';
import 'package:onezentra_mobile/widgets/states.dart';
import 'package:onezentra_mobile/widgets/status_pill.dart';

/// Halaman master Standarisasi Tumpukan — padanan
/// `onezentra-web/src/app/standarisasi/page.tsx`.
///
/// Dibuka dari tiga tempat, semuanya dengan kontrak yang sama seperti web:
/// kartu modul "Standarisasi" di Beranda, kartu peringatan "Menunggu Approval",
/// dan baris aktivitas terbaru ber-`href="/standarisasi"`. Yang keempat datang
/// dari Validasi Dokumen: [initialProductCode] membuka form tambah dengan
/// produk yang bermasalah sudah terpilih — persis `?productId=` di web, yang
/// dipakai `openItem` di `validasi-sj/page.tsx`.
class StandarisasiScreen extends StatefulWidget {
  const StandarisasiScreen({super.key, this.service, this.initialProductCode});

  final StandarisasiService? service;

  /// BOS ID / kode barang yang akan dipilih di form tambah saat halaman dibuka.
  final String? initialProductCode;

  @override
  State<StandarisasiScreen> createState() => _StandarisasiScreenState();
}

class _StandarisasiScreenState extends State<StandarisasiScreen> {
  static const _debounce = Duration(milliseconds: 400);

  late final StandarisasiService _service;
  late final StandarisasiProvider _provider;
  final _searchCtrl = TextEditingController();
  Timer? _searchDebounce;

  /// Dipakai supaya produk dari Validasi Dokumen hanya dicari sekali, walau
  /// widget dibangun ulang (mis. operator menarik layar).
  bool _deepLinkHandled = false;

  @override
  void initState() {
    super.initState();
    _service = widget.service ?? StandarisasiService();
    _provider = StandarisasiProvider(_service);
    _searchCtrl.addListener(_onSearchChanged);
    // Setelah frame pertama: izin baru bisa dibaca, jadi user tanpa
    // `standarisasi.view` tidak menembak endpoint yang pasti 403.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _reload();
      _handleDeepLink();
    });
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _searchCtrl.dispose();
    _provider.dispose();
    super.dispose();
  }

  void _onSearchChanged() {
    final value = _searchCtrl.text.trim();
    _searchDebounce?.cancel();
    _searchDebounce = Timer(_debounce, () {
      if (!mounted || value == _provider.search) {
        return;
      }
      _provider.search = value;
      _provider.load(reset: true);
      _provider.loadStats();
    });
  }

  void _reload() {
    if (!mounted ||
        !context.read<AuthProvider>().hasPermission('standarisasi.view')) {
      return;
    }
    _provider.load(reset: true);
    _provider.loadStats();
  }

  /// Buka form tambah dengan produk yang dikirim Validasi Dokumen.
  ///
  /// Web memakai `npn.searchProduct(pid)` lalu memilih hasil yang BOS ID-nya
  /// persis sama, atau hasil pertama kalau tidak ada. Endpoint yang dipakai
  /// mobile (`standarisasi-tumpukan/search-product`) mencari kolom yang sama
  /// dan tidak butuh izin `npn.view`.
  Future<void> _handleDeepLink() async {
    final code = widget.initialProductCode?.trim();
    if (_deepLinkHandled || code == null || code.isEmpty) {
      return;
    }
    _deepLinkHandled = true;
    if (!context.read<AuthProvider>().hasPermission('standarisasi.view')) {
      _snack('Izin standarisasi.view diperlukan untuk membuka form ini.');
      return;
    }
    final service = _service;
    try {
      final results = await service.searchProduct(code);
      if (!mounted) return;
      if (results.isEmpty) {
        _snack('Produk $code tidak ditemukan di master NPN.');
        return;
      }
      final product = results.firstWhere(
        (p) => p.bosId == code,
        orElse: () => results.first,
      );
      await _openCreate(initialProduct: product);
    } catch (e) {
      if (!mounted) return;
      _snack(apiErrorMessage(e, 'Gagal mencari produk $code.'));
    }
  }

  Future<void> _openCreate({NpnProduct? initialProduct}) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => ChangeNotifierProvider<StandarisasiProvider>.value(
        value: _provider,
        child: StandarisasiCreateSheet(
          service: _service,
          initialProduct: initialProduct,
        ),
      ),
    );
  }

  Future<void> _openDetail(StandarisasiTumpukan row) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => ChangeNotifierProvider<StandarisasiProvider>.value(
        value: _provider,
        child: StandarisasiDetailSheet(row: row),
      ),
    );
  }

  void _snack(String message, {bool success = false}) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(message),
          backgroundColor: success ? AppColors.success : null,
        ),
      );
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final can = auth.hasPermission;

    if (!can('standarisasi.view')) {
      // Header tetap sama supaya operator tahu halaman mana yang dia buka; yang
      // berbeda hanya isi.
      return Scaffold(
        backgroundColor: AppColors.surface,
        body: Column(
          children: [
            PageHeader(
              title: 'Standarisasi Tumpukan',
              subtitle: 'Kelola standarisasi tumpukan produk per depo',
              icon: Icons.layers_outlined,
              leading: _backButton(),
            ),
            const Expanded(
              child: Padding(
                padding: EdgeInsets.all(20),
                child: DeniedCard(
                  message:
                      'Anda tidak memiliki izin untuk Standarisasi Tumpukan. '
                      'Hubungi admin gudang bila ini keliru.',
                ),
              ),
            ),
          ],
        ),
      );
    }

    return ChangeNotifierProvider<StandarisasiProvider>.value(
      value: _provider,
      child: Consumer<StandarisasiProvider>(
        builder: (context, provider, _) {
          // Pesan hasil aksi approve/reject/create — kalimat yang sama dengan
          // toast web, jadi kedua aplikasi konsisten.
          final notice = provider.notice;
          if (notice != null) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (!mounted) return;
              _snack(notice.message, success: !notice.isError);
              provider.clearNotice();
            });
          }
          return Scaffold(
            backgroundColor: AppColors.surface,
            body: Column(
              children: [
                PageHeader(
                  title: 'Standarisasi Tumpukan',
                  subtitle: 'Kelola standarisasi tumpukan produk per depo',
                  icon: Icons.layers_outlined,
                  leading: _backButton(),
                  trailing: can('standarisasi.create')
                      ? IconButton(
                          tooltip: 'Tambah Standarisasi',
                          onPressed: _openCreate,
                          icon: const Icon(Icons.add),
                          color: Colors.white,
                        )
                      : null,
                  statsLoading: provider.statsLoading,
                  statsError: provider.statsError,
                  onStatsRetry: provider.loadStats,
                  stats: [
                    HeaderStat(
                      label: 'Total',
                      value: '${provider.stats.total}',
                      dot: AppColors.gray300,
                    ),
                    HeaderStat(
                      label: 'Menunggu',
                      value: '${provider.stats.pending}',
                      dot: AppColors.amber500,
                      badge: AppColors.amber500,
                    ),
                    HeaderStat(
                      label: 'Disetujui',
                      value: '${provider.stats.approved}',
                      dot: AppColors.emerald600,
                      badge: AppColors.emerald600,
                    ),
                    HeaderStat(
                      label: 'Ditolak',
                      value: '${provider.stats.rejected}',
                      dot: AppColors.red600,
                      badge: AppColors.red600,
                    ),
                  ],
                ),
                Expanded(
                  child: RefreshIndicator(
                    onRefresh: () async {
                      provider.load(reset: true);
                      provider.loadStats();
                    },
                    child: ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
                      children: [
                        _StandarisasiListCard(
                          provider: provider,
                          searchCtrl: _searchCtrl,
                          onOpen: _openDetail,
                          onRetry: () => provider.load(reset: true),
                          onMore: provider.loadMore,
                          onCreate: can('standarisasi.create')
                              ? _openCreate
                              : null,
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget? _backButton() {
    return IconButton(
      tooltip: 'Kembali',
      onPressed: () => Navigator.of(context).maybePop(),
      icon: const Icon(Icons.arrow_back),
      color: Colors.white,
    );
  }
}

// --- Kartu daftar ---

/// Filter status — label identik dengan `filters` di `SearchInput` web.
const _standarisasiFilterOptions = <(String?, String)>[
  (null, 'Semua'),
  (standarisasiStatusPending, 'Menunggu'),
  (standarisasiStatusApproved, 'Disetujui'),
  (standarisasiStatusRejected, 'Ditolak'),
];

/// "Daftar Standarisasi" — padanan kartu tabel di web: pencarian produk, filter
/// status, lalu baris per produk dengan dimensi tumpukan dan status.
class _StandarisasiListCard extends StatelessWidget {
  const _StandarisasiListCard({
    required this.provider,
    required this.searchCtrl,
    required this.onOpen,
    required this.onRetry,
    required this.onMore,
    required this.onCreate,
  });

  final StandarisasiProvider provider;
  final TextEditingController searchCtrl;
  final ValueChanged<StandarisasiTumpukan> onOpen;
  final VoidCallback onRetry;
  final VoidCallback onMore;
  final VoidCallback? onCreate;

  @override
  Widget build(BuildContext context) {
    final entries = provider.entries;
    final hasSearch = provider.search.isNotEmpty;
    return SectionCard(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Divider(height: 1),
          const SectionHeader(
            title: 'Daftar Standarisasi',
            subtitle:
                'Standarisasi yang sudah disetujui menjadi syarat item produk '
                'boleh diperiksa di Validasi Dokumen.',
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        key: const Key('standarisasi-search'),
                        controller: searchCtrl,
                        decoration: const InputDecoration(
                          hintText: 'Cari produk...',
                          prefixIcon: Icon(Icons.search, size: 20),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      '${provider.totalRows}',
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w800,
                        color: AppColors.primary600,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                StatusFilterChips(
                  options: _standarisasiFilterOptions,
                  active: provider.statusFilter,
                  onChanged: provider.setStatusFilter,
                ),
              ],
            ),
          ),
          if (provider.error != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              child: ErrorCard(message: provider.error!, onRetry: onRetry),
            ),
          // Skeleton, bukan spinner penuh: saat filter berubah operator langsung
          // melihat bentuk baris yang akan muncul, dan isi lama tidak sempat
          // berkedip.
          if (provider.loading && entries.isEmpty)
            const Padding(
              padding: EdgeInsets.fromLTRB(16, 0, 16, 20),
              child: SkeletonList(rows: 3),
            ),
          if (!provider.loading && entries.isEmpty && provider.error == null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: EmptyState(
                title: hasSearch
                    ? 'Tidak ada standarisasi untuk "${provider.search}"'
                    : 'Belum ada standarisasi tumpukan',
                message: hasSearch
                    ? 'Coba kata kunci lain atau hapus pencarian.'
                    : 'Tambahkan standarisasi agar validasi item tidak terhenti '
                          'menunggu approval.',
                icon: Icons.layers_outlined,
                action: onCreate == null
                    ? null
                    : FilledButton.icon(
                        onPressed: onCreate,
                        icon: const Icon(Icons.add, size: 18),
                        label: const Text('Tambah Standarisasi'),
                      ),
              ),
            ),
          for (var i = 0; i < entries.length; i++) ...[
            _StandarisasiRow(row: entries[i], onTap: () => onOpen(entries[i])),
            if (i < entries.length - 1)
              const Divider(height: 1, indent: 16, endIndent: 16),
          ],
          if (provider.loading && entries.isNotEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 16),
              child: Center(
                child: SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
            ),
          if (provider.hasMore)
            Padding(
              padding: const EdgeInsets.all(12),
              child: OutlinedButton(
                onPressed: provider.loading ? null : onMore,
                child: const Text('Muat lebih banyak'),
              ),
            ),
          const SizedBox(height: 6),
        ],
      ),
    );
  }
}

/// Baris daftar — kolom web (BOS ID, produk, barcode, tier, tinggi, total,
/// status, request by) diratakan menjadi satu kartu, karena tabel 9 kolom
/// tidak bisa dibaca di layar 360px.
class _StandarisasiRow extends StatelessWidget {
  const _StandarisasiRow({required this.row, required this.onTap});

  final StandarisasiTumpukan row;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final product = row.npn;
    return ListTile(
      key: Key('standarisasi-row-${row.id}'),
      onTap: onTap,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      title: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Text(
              product?.bosId ?? '#${row.id}',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 13.5,
                fontWeight: FontWeight.w700,
                fontFamily: 'monospace',
                color: AppColors.gray900,
              ),
            ),
          ),
          const SizedBox(width: 8),
          StatusPill(
            label: standarisasiStatusLabel(row.status),
            tone: standarisasiStatusTone(row.status),
            dot: true,
          ),
        ],
      ),
      subtitle: Padding(
        padding: const EdgeInsets.only(top: 4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              product?.name ?? 'Produk tidak dimuat',
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 13, color: AppColors.gray600),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                _DimChip(label: 'Tier ${row.tier}'),
                _DimChip(label: 'Tinggi ${row.tinggiTumpukan}'),
                _TotalChip(value: row.totalTumpukan),
                if (row.namaDepo != null)
                  _DimChip(label: row.namaDepo!, muted: true),
              ],
            ),
            if (row.requestedByEmail != null) ...[
              const SizedBox(height: 6),
              Text(
                'Diminta oleh ${row.requestedByEmail}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 11.5,
                  color: AppColors.gray500,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _DimChip extends StatelessWidget {
  const _DimChip({required this.label, this.muted = false});

  final String label;
  final bool muted;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: muted ? AppColors.gray100 : AppColors.gray50,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: AppColors.gray200),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 11.5,
          fontWeight: FontWeight.w600,
          color: muted ? AppColors.gray500 : AppColors.gray700,
        ),
      ),
    );
  }
}

class _TotalChip extends StatelessWidget {
  const _TotalChip({required this.value});

  final int value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: AppColors.primary50,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        '$value total',
        style: const TextStyle(
          fontSize: 11.5,
          fontWeight: FontWeight.w700,
          color: AppColors.primary700,
        ),
      ),
    );
  }
}
