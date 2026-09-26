import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:onezentra_mobile/features/auth/auth_provider.dart';
import 'package:onezentra_mobile/features/gate/scanner_screen.dart';
import 'package:onezentra_mobile/features/standarisasi/standarisasi_screen.dart';
import 'package:onezentra_mobile/features/standarisasi/standarisasi_service.dart';
import 'package:onezentra_mobile/features/validation/models/validation_models.dart';
import 'package:onezentra_mobile/features/validation/validation_item_sheet.dart';
import 'package:onezentra_mobile/features/validation/validation_list_provider.dart';
import 'package:onezentra_mobile/features/validation/validation_service.dart';
import 'package:onezentra_mobile/features/validation/validation_session_provider.dart';
import 'package:onezentra_mobile/theme/app_colors.dart';
import 'package:onezentra_mobile/widgets/denied_card.dart';
import 'package:onezentra_mobile/widgets/filter_chips.dart';
import 'package:onezentra_mobile/widgets/page_header.dart';
import 'package:onezentra_mobile/widgets/pressable.dart';
import 'package:onezentra_mobile/widgets/section_card.dart';
import 'package:onezentra_mobile/widgets/states.dart';
import 'package:onezentra_mobile/widgets/status_pill.dart';

/// Permintaan membuka dokumen tertentu tanpa scan ulang — dikirim dari tab
/// Check In lewat [ValidationScreen.startRequest].
///
/// `token` naik setiap permintaan (dari [HomeShell]) supaya dokumen yang sama
/// bisa dibuka lagi setelah operator menekan "Pindai dokumen lain", dan
/// rebuild biasa tidak memunculkan permintaan basi.
class ValidationStartRequest {
  const ValidationStartRequest({
    required this.rencanaKirimId,
    required this.token,
  });

  final int rencanaKirimId;
  final int token;
}

/// Validasi Dokumen untuk operator: **daftar dokumen** (yang masih berjalan bisa
/// dilanjutkan tanpa scan ulang) atau scan barcode PO transporter untuk dokumen
/// baru → periksa tiap item (barcode produk, qty aktual, expired, kondisi,
/// foto) → selesaikan validasi.
///
/// Backend: `SjValidationController` (`index`, `stats`, `show`,
/// `start-by-code`, `start/{rencanaKirim}`, `scan`, `complete`).
///
/// Susunan layar meniru `onezentra-web/src/app/validasi-sj/page.tsx`: panel
/// scan (dokumen baru) di atas, "Daftar Validasi" (pekerjaan yang tertunda)
/// di bawahnya.
class ValidationScreen extends StatefulWidget {
  const ValidationScreen({
    super.key,
    this.service,
    this.standarisasiService,
    this.startRequest,
  });

  /// Bisa di-inject untuk pengujian; default memakai Dio global.
  final ValidationService? service;

  /// Dipakai halaman Standarisasi yang dibuka dari gerbang item. Harus
  /// di-inject bersama [service] di test supaya perpindahan halaman tidak
  /// menembak jaringan.
  final StandarisasiService? standarisasiService;

  /// Bila diisi, dokumen langsung dibuka (tanpa scan/ketik ulang PO).
  final ValidationStartRequest? startRequest;

  @override
  State<ValidationScreen> createState() => _ValidationScreenState();
}

class _ValidationScreenState extends State<ValidationScreen> {
  late final ValidationSessionProvider _session;
  late final ValidationListProvider _list;

  /// Pencarian + debounce milik state ini (bukan provider) karena
  /// [ValidationListProvider] tidak menyimpan teks pencarian — hanya
  /// [GateProvider]-like `search` dikirim sebagai argumen saat memuat.
  final _searchCtrl = TextEditingController();
  String _debouncedSearch = '';
  Timer? _searchDebounce;

  int? _handledToken;

  @override
  void initState() {
    super.initState();
    final service = widget.service ?? ValidationService();
    _session = ValidationSessionProvider(service);
    _list = ValidationListProvider(service);
    _searchCtrl.addListener(_onSearchChanged);
    // Setelah frame pertama: izin baru bisa dibaca, jadi tab tanpa
    // `sj_validation.view` tidak menembak endpoint yang pasti 403.
    WidgetsBinding.instance.addPostFrameCallback((_) => _reloadList());
    _openFromRequest();
  }

  @override
  void didUpdateWidget(covariant ValidationScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    _openFromRequest();
  }

  void _onSearchChanged() {
    final value = _searchCtrl.text.trim();
    _searchDebounce?.cancel();
    _searchDebounce = Timer(const Duration(milliseconds: 400), () {
      if (!mounted || value == _debouncedSearch) {
        return;
      }
      _debouncedSearch = value;
      _loadList(reset: true);
    });
  }

  /// Muat ulang daftar + statistik dari awal.
  Future<void> _reloadList() async {
    if (!mounted) {
      return;
    }
    if (!context.read<AuthProvider>().hasPermission('sj_validation.view')) {
      return;
    }
    _loadList(reset: true);
    _list.loadStats();
  }

  void _loadList({bool reset = false}) {
    if (!context.read<AuthProvider>().hasPermission('sj_validation.view')) {
      return;
    }
    _list.load(reset: reset, search: _debouncedSearch);
  }

  /// Buka dokumen yang dikirim Check In. Token dijaga agar rebuild biasa
  /// (mis. ganti tab, ganti izin) tidak memulai ulang validasi yang sama.
  void _openFromRequest() {
    final request = widget.startRequest;
    if (request == null || request.token == _handledToken) {
      return;
    }
    _handledToken = request.token;
    _session.startByRencanaKirim(request.rencanaKirimId);
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _searchCtrl.dispose();
    _list.dispose();
    _session.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    if (!auth.hasPermission('sj_validation.view')) {
      // Tanpa izin, pita header tetap sama supaya operator tahu menu mana
      // yang dia buka; yang berbeda hanya isi (kartu penolakan).
      return Scaffold(
        backgroundColor: AppColors.surface,
        body: Column(
          children: [
            const PageHeader(
              title: 'Validasi Dokumen',
              subtitle: 'Kontrol fisik produk, quantity, kondisi, dan expired.',
              icon: Icons.task_alt,
            ),
            const Expanded(
              child: Padding(
                padding: EdgeInsets.all(20),
                child: DeniedCard(
                  message:
                      'Anda tidak memiliki izin untuk Validasi Dokumen. '
                      'Hubungi admin gudang bila ini keliru.',
                ),
              ),
            ),
          ],
        ),
      );
    }

    return MultiProvider(
      providers: [
        ChangeNotifierProvider<ValidationSessionProvider>.value(
          value: _session,
        ),
        ChangeNotifierProvider<ValidationListProvider>.value(value: _list),
      ],
      child: _ValidationBody(
        searchCtrl: _searchCtrl,
        debouncedSearch: () => _debouncedSearch,
        reloadList: _reloadList,
        standarisasiService: widget.standarisasiService,
      ),
    );
  }
}

class _ValidationBody extends StatefulWidget {
  const _ValidationBody({
    required this.searchCtrl,
    required this.debouncedSearch,
    required this.reloadList,
    this.standarisasiService,
  });

  final TextEditingController searchCtrl;

  /// Nilai pencarian yang **sudah** dipakai untuk request (setelah debounce).
  final String Function() debouncedSearch;

  /// Muat ulang daftar + statistik — dipanggil setelah aksi yang mengubah
  /// status dokumen (selesai / batal) dan saat kembali ke daftar.
  final Future<void> Function() reloadList;

  final StandarisasiService? standarisasiService;

  @override
  State<_ValidationBody> createState() => _ValidationBodyState();
}

class _ValidationBodyState extends State<_ValidationBody> {
  final _codeCtrl = TextEditingController();

  /// Pernah dialihkan ke halaman Standarisasi karena item terkunci; menyalakan
  /// banner amber di atas daftar item (padanan `wasRedirected` di web).
  bool _redirectedToStandarisasi = false;

  @override
  void dispose() {
    _codeCtrl.dispose();
    super.dispose();
  }

  /// Buka baris daftar: `show` bersifat baca-saja, jadi dokumen yang dibatalkan
  /// tidak ikut membuat validasi baru di belakang layar.
  Future<void> _openEntry(SjValidationSummary entry) async {
    await context.read<ValidationSessionProvider>().openById(entry.id);
  }

  /// Kembali ke daftar dokumen, lalu muat ulang — status di server bisa saja
  /// sudah berubah karena aksi operator lain (mis. supervisor di web).
  Future<void> _backToList() async {
    context.read<ValidationSessionProvider>().reset();
    await widget.reloadList();
  }

  Future<void> _openScanner({
    required String title,
    required String hint,
  }) async {
    final code = await Navigator.of(context).push<String>(
      MaterialPageRoute(
        builder: (_) => ScannerScreen(title: title, hint: hint),
      ),
    );
    if (code == null || !mounted) {
      return;
    }
    final value = code.trim();
    if (value.isEmpty) {
      return;
    }
    _codeCtrl.text = value;
    _codeCtrl.selection = TextSelection.collapsed(offset: value.length);
    if (mounted) {
      await context.read<ValidationSessionProvider>().startByCode(value);
    }
  }

  Future<void> _startFromInput() async {
    await context.read<ValidationSessionProvider>().startByCode(_codeCtrl.text);
  }

  Future<void> _openItem(SjValidationItem item) async {
    final session = context.read<ValidationSessionProvider>();
    final validation = session.validation;
    if (validation == null || !validation.isInProgress) {
      _snack('Validasi dokumen ini sudah tidak berjalan.');
      return;
    }
    if (!context.read<AuthProvider>().hasPermission('sj_validation.validate')) {
      _snack('Anda tidak memiliki izin untuk memeriksa item.');
      return;
    }
    // Gerbang yang sama dengan `openItem` di
    // `onezentra-web/src/app/validasi-sj/page.tsx`: produk yang standarisasinya
    // belum disetujui tidak boleh diperiksa, jadi operator dibawa ke halaman
    // Standarisasi — bukan diberi form yang hasilnya pasti ditolak.
    if (item.needsStackApproval) {
      await _openStandarisasiFor(item);
      return;
    }
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => ChangeNotifierProvider<ValidationSessionProvider>.value(
        value: session,
        child: ValidationItemSheet(item: item),
      ),
    );
  }

  /// Buka halaman Standarisasi untuk produk yang memblokir item ini, lalu segarkan
  /// dokumen saat operator kembali.
  ///
  /// Penanda [_redirectedToStandarisasi] menyalakan banner amber seperti
  /// `wasRedirected` di web (`?from=standarisasi`), supaya operator tahu
  /// kenapa item ini tidak bisa diperiksa.
  Future<void> _openStandarisasiFor(SjValidationItem item) async {
    setState(() => _redirectedToStandarisasi = true);
    await _openStandarisasiPage(productCode: item.kodeBarang);
  }

  /// Buka halaman Standarisasi (dari gerbang item atau tombol banner).
  Future<void> _openStandarisasiPage({String? productCode}) async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) => StandarisasiScreen(
          service: widget.standarisasiService,
          initialProductCode: productCode,
        ),
      ),
    );
    if (!mounted ||
        context.read<ValidationSessionProvider>().validation == null) {
      return;
    }
    // Standarisasi disetujui di luar dokumen ini, jadi status item di memori
    // sudah basi — tanpa `refresh()` operator masih melihat item terkunci.
    await context.read<ValidationSessionProvider>().refresh();
  }

  Future<void> _confirmComplete() async {
    final session = context.read<ValidationSessionProvider>();
    final validation = session.validation;
    if (validation == null) return;

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Selesaikan validasi?'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '${validation.validatedItems} dari ${validation.totalItems} item '
              'sudah diperiksa.',
              style: const TextStyle(fontSize: 13.5),
            ),
            if (validation.mismatchItems > 0) ...[
              const SizedBox(height: 8),
              Text(
                '${validation.mismatchItems} item berselisih — notifikasi email '
                'akan dikirim ke BLC & Admin Distribusi.',
                style: const TextStyle(
                  fontSize: 13,
                  color: AppColors.warningText,
                ),
              ),
            ],
            const SizedBox(height: 8),
            const Text(
              'Status dokumen menjadi Verified dan proses Receiving dibuat. '
              'Tindakan ini permanen.',
              style: TextStyle(fontSize: 12, color: AppColors.gray500),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Batal'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Ya, Selesaikan'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    final done = await session.complete();
    if (!done || !mounted) return;
    // Pesan dari provider menyebut jumlah selisih + notifikasi email (parity
    // dengan pesan web), bukan sekadar "selesai".
    _snack(session.notice ?? 'Validasi dokumen selesai.', success: true);
    await widget.reloadList();
  }

  Future<void> _confirmCancel() async {
    final session = context.read<ValidationSessionProvider>();
    if (session.validation == null) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Batalkan validasi?'),
        content: const Text(
          'Semua hasil pemeriksaan item pada dokumen ini akan dibuang dan '
          'tidak bisa dilanjutkan.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Kembali'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.errorText),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Ya, Batalkan'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    final done = await session.cancel();
    if (!done || !mounted) return;
    _snack(session.notice ?? 'Validasi dibatalkan.');
    await widget.reloadList();
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
    final session = context.watch<ValidationSessionProvider>();
    final list = context.watch<ValidationListProvider>();
    final validation = session.validation;

    return Scaffold(
      backgroundColor: AppColors.surface,
      body: Column(
        children: [
          // Judul + angka ringkasan dalam satu pita, seperti header
          // `validasi-sj/page.tsx` di web. Web hanya menaruh 4 angka
          // (Hari ini / Berjalan / Selesai / Total); angka "Dibatalkan"
          // tetap terjangkau lewat chip filter di bawah, jadi tidak ada
          // informasi yang hilang.
          PageHeader(
            title: 'Validasi Dokumen',
            subtitle: 'Kontrol fisik produk, quantity, kondisi, dan expired.',
            icon: Icons.task_alt,
            leading: validation == null
                ? null
                : IconButton(
                    tooltip: 'Kembali ke daftar validasi',
                    onPressed: _backToList,
                    icon: const Icon(Icons.arrow_back),
                    color: Colors.white,
                  ),
            trailing: validation == null
                ? null
                : IconButton(
                    tooltip: 'Pindai dokumen lain',
                    onPressed: session.itemBusy ? null : _backToList,
                    icon: const Icon(Icons.qr_code_scanner),
                    color: Colors.white,
                  ),
            statsLoading: list.statsLoading,
            statsError: list.statsError,
            onStatsRetry: list.loadStats,
            stats: [
              HeaderStat(label: 'Hari ini', value: '${list.stats.today}'),
              HeaderStat(
                label: 'Berjalan',
                value: '${list.stats.inProgress}',
                dot: AppColors.blue200,
                badge: AppColors.blue200,
                onBadge: AppColors.blue700,
              ),
              HeaderStat(
                label: 'Selesai',
                value: '${list.stats.completed}',
                dot: AppColors.successBright,
                badge: AppColors.successBright,
              ),
              HeaderStat(
                label: 'Total',
                value: '${list.stats.total}',
                dot: AppColors.gray300,
              ),
            ],
          ),
          Expanded(
            child: validation == null
                ? _buildStartView(session, auth)
                : _buildDetailView(session, auth, validation),
          ),
        ],
      ),
    );
  }

  Widget _buildStartView(ValidationSessionProvider session, AuthProvider auth) {
    // Backend menolak `start-by-code` tanpa `sj_validation.create`, jadi tombol
    // dimatikan lebih awal dengan penjelasan — bukan 403 setelah operator scan.
    final canStart = auth.hasPermission('sj_validation.create');
    final list = context.watch<ValidationListProvider>();
    return RefreshIndicator(
      onRefresh: widget.reloadList,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
        children: [
          if (_redirectedToStandarisasi) ...[
            _StackApprovalBanner(onOpen: _openStandarisasiPage),
            const SizedBox(height: 12),
          ],
          SectionCard(
            child: _ScanDocCard(
              controller: _codeCtrl,
              busy: session.startBusy,
              enabled: canStart,
              errorText: session.error,
              onSubmit: _startFromInput,
              onScan: () => _openScanner(
                title: 'Scan PO / SJ',
                hint:
                    'Arahkan kamera ke barcode dokumen pengiriman (PO Transporter)',
              ),
            ),
          ),
          if (auth.hasPermission('gate.view')) ...[
            const SizedBox(height: 12),
            const _FromCheckPointHint(),
          ],
          if (!canStart) ...[
            const SizedBox(height: 12),
            const DeniedCard(
              message:
                  'Anda tidak memiliki izin memulai validasi. '
                  'Hubungi admin gudang bila ini keliru.',
            ),
          ],
          const SizedBox(height: 14),
          _ValidationListCard(
            entries: list.entries,
            loading: list.loading,
            error: list.error,
            total: list.totalRows,
            hasMore: list.hasMore,
            statusFilter: list.statusFilter,
            searchCtrl: widget.searchCtrl,
            search: widget.debouncedSearch(),
            onOpen: _openEntry,
            onRetry: _listReload,
            onMore: _listMore,
            onStatusFilter: (status) => list.setStatusFilter(status),
          ),
          const SizedBox(height: 16),
          const _HowToCard(),
        ],
      ),
    );
  }

  void _listReload() {
    final list = context.read<ValidationListProvider>();
    list.load(reset: true, search: widget.debouncedSearch());
  }

  void _listMore() {
    final list = context.read<ValidationListProvider>();
    list.loadMore(widget.debouncedSearch());
  }

  Widget _buildDetailView(
    ValidationSessionProvider session,
    AuthProvider auth,
    SjValidation validation,
  ) {
    final canComplete = auth.hasPermission('sj_validation.complete');
    final canCancel = auth.hasPermission('sj_validation.edit');
    final canInspect = auth.hasPermission('sj_validation.validate');
    // Backend hanya menerima scan/complete saat IN_PROGRESS. Membuka lagi
    // dokumen yang validasinya sudah final (mis. dari tombol "Mulai
    // Validasi" di Check In) harus jadi tampilan baca-saja, bukan jalan buntu
    // dengan tombol yang pasti ditolak 422.
    final actionable = validation.isInProgress;

    // Tarik-torefresh juga di detail: status dokumen bisa berubah di server
    // oleh orang lain (mis. supervisor yang bekerja di web), jadi operator
    // di lapangan perlu cara cepat menyegarkan tanpa keluar ke daftar.
    return RefreshIndicator(
      onRefresh: session.refresh,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
        children: [
          _DocHeaderCard(validation: validation),
          const SizedBox(height: 14),
          _ProgressCard(validation: validation),
          const SizedBox(height: 14),
          if (!actionable) ...[
            MessageCard(
              message: validation.status == statusCompleted
                  ? 'Validasi dokumen ini sudah selesai. '
                        'Membukanya hanya menampilkan hasil pemeriksaan.'
                  : 'Validasi dokumen ini berstatus '
                        '${validationStatusLabel(validation.status)} '
                        'sehingga tidak bisa dilanjutkan.',
              tone: MessageTone.neutral,
            ),
            const SizedBox(height: 14),
          ],
          if (session.error != null) ...[
            MessageCard(
              message: session.error!,
              tone: MessageTone.error,
              icon: Icons.error_outline,
            ),
            const SizedBox(height: 14),
          ],
          if (_redirectedToStandarisasi) ...[
            _StackApprovalBanner(onOpen: _openStandarisasiPage),
            const SizedBox(height: 14),
          ],
          if (!canInspect) ...[
            const DeniedCard(
              message:
                  'Anda bisa melihat dokumen ini, tetapi tidak memeriksa item. '
                  'Izin sj_validation.validate diperlukan.',
            ),
            const SizedBox(height: 14),
          ],
          Row(
            children: [
              const Text(
                'Item dokumen',
                style: TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 15,
                  color: AppColors.gray800,
                ),
              ),
              const Spacer(),
              // Teks angka tetap boleh menyusut: pada skala font sistem yang
              // besar, "x/y diperiksa" ikut membesar dan Row ini bisa meluber.
              Flexible(
                child: Text(
                  '${validation.validatedItems}/${validation.totalItems} diperiksa',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: AppColors.gray500,
                    fontSize: 13,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          for (final item in validation.items) ...[
            _ItemTile(
              item: item,
              enabled: actionable && !session.itemBusy && canInspect,
              onTap: () => _openItem(item),
            ),
            const SizedBox(height: 8),
          ],
          const SizedBox(height: 8),
          FilledButton.icon(
            onPressed:
                !actionable ||
                    session.itemBusy ||
                    validation.pendingItems > 0 ||
                    !canComplete
                ? null
                : _confirmComplete,
            style: FilledButton.styleFrom(
              minimumSize: const Size.fromHeight(52),
              backgroundColor: AppColors.success,
            ),
            icon: const Icon(Icons.task_alt),
            label: Text(
              !canComplete
                  ? 'Selesaikan Validasi'
                  : validation.pendingItems > 0
                  ? 'Selesaikan (${validation.pendingItems} item lagi)'
                  : 'Selesaikan Validasi',
            ),
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: !actionable || session.itemBusy || !canCancel
                ? null
                : _confirmCancel,
            style: OutlinedButton.styleFrom(
              minimumSize: const Size.fromHeight(48),
              foregroundColor: AppColors.errorText,
              side: const BorderSide(color: AppColors.errorBorder),
            ),
            icon: const Icon(Icons.close),
            label: const Text('Batalkan Validasi'),
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: session.itemBusy ? null : _backToList,
            style: OutlinedButton.styleFrom(
              minimumSize: const Size.fromHeight(48),
            ),
            icon: const Icon(Icons.list_alt),
            label: const Text('Kembali ke Daftar Validasi'),
          ),
        ],
      ),
    );
  }
}

// --- Kartu & tile ---

/// "Daftar Validasi" — padanan tabel `Daftar Validasi` di web: seluruh dokumen
/// yang sudah pernah divalidasi, bisa dicari per PO dan difilter status, lalu
/// dibuka lewat satu ketukan untuk melanjutkan pekerjaan yang tertunda.
class _ValidationListCard extends StatelessWidget {
  const _ValidationListCard({
    required this.entries,
    required this.loading,
    required this.error,
    required this.total,
    required this.hasMore,
    required this.statusFilter,
    required this.searchCtrl,
    required this.search,
    required this.onOpen,
    required this.onRetry,
    required this.onMore,
    required this.onStatusFilter,
  });

  final List<SjValidationSummary> entries;
  final bool loading;
  final String? error;
  final int total;
  final bool hasMore;
  final String? statusFilter;
  final TextEditingController searchCtrl;
  final String search;
  final ValueChanged<SjValidationSummary> onOpen;
  final VoidCallback onRetry;
  final VoidCallback onMore;
  final ValueChanged<String?> onStatusFilter;

  @override
  Widget build(BuildContext context) {
    final hasSearch = search.isNotEmpty;
    return SectionCard(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Divider(height: 1),
          const SectionHeader(
            title: 'Daftar Validasi',
            subtitle:
                'Ketuk dokumen untuk membuka detail dan melanjutkan '
                'pemeriksaan yang belum selesai.',
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
                        key: const Key('validation-search'),
                        controller: searchCtrl,
                        decoration: const InputDecoration(
                          hintText: 'Cari PO Transporter...',
                          prefixIcon: Icon(Icons.search, size: 20),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      '$total',
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
                  options: validationStatusFilterOptions,
                  active: statusFilter,
                  onChanged: onStatusFilter,
                ),
              ],
            ),
          ),
          if (error != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              child: ErrorCard(message: error!, onRetry: onRetry),
            ),
          // Skeleton, bukan spinner penuh: saat filter berubah operator
          // langsung melihat bentuk baris yang akan muncul, dan isi lama
          // tidak sempat berkedip.
          if (loading && entries.isEmpty)
            const Padding(
              padding: EdgeInsets.fromLTRB(16, 0, 16, 20),
              child: SkeletonList(rows: 3),
            ),
          if (!loading && entries.isEmpty && error == null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: EmptyState(
                title: hasSearch
                    ? 'Tidak ada validasi untuk "$search"'
                    : 'Belum ada validasi dokumen',
                message: hasSearch
                    ? 'Coba kata kunci lain atau hapus pencarian.'
                    : 'Scan atau ketik PO di panel atas untuk memulai.',
                icon: Icons.fact_check_outlined,
              ),
            ),
          for (var i = 0; i < entries.length; i++) ...[
            _ValidationListRow(
              entry: entries[i],
              onTap: () => onOpen(entries[i]),
            ),
            if (i < entries.length - 1)
              const Divider(height: 1, indent: 16, endIndent: 16),
          ],
          if (loading && entries.isNotEmpty)
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
          if (hasMore)
            Padding(
              padding: const EdgeInsets.all(12),
              child: OutlinedButton(
                onPressed: loading ? null : onMore,
                child: const Text('Muat lebih banyak'),
              ),
            ),
          const SizedBox(height: 6),
        ],
      ),
    );
  }
}

/// Baris daftar — isi mengikuti kartu mobile di web: PO, driver • tujuan,
/// status, dan tanggal (mulai untuk yang berjalan, selesai untuk yang final).
class _ValidationListRow extends StatelessWidget {
  const _ValidationListRow({required this.entry, required this.onTap});

  final SjValidationSummary entry;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final identity = [
      entry.driverName,
      entry.destinationName,
    ].where((v) => v.isNotEmpty && v != '-').join(' • ');
    final date = entry.isInProgress
        ? formatValidationDate(entry.startedAt)
        : formatValidationDate(entry.completedAt);
    final dateLabel = entry.isInProgress ? 'Mulai' : 'Selesai';
    final subtitle = [
      if (identity.isNotEmpty) identity,
      if (date != null) '$dateLabel $date',
    ].join('\n');

    return ListTile(
      key: Key('validation-row-${entry.id}'),
      onTap: onTap,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      leading: Container(
        width: 42,
        height: 42,
        decoration: BoxDecoration(
          color: _messageTone(entry.status) == MessageTone.success
              ? AppColors.successBg
              : AppColors.primary50,
          borderRadius: BorderRadius.circular(12),
        ),
        alignment: Alignment.center,
        child: Icon(
          entry.isInProgress
              ? Icons.pending_actions
              : Icons.fact_check_outlined,
          size: 20,
          color: entry.isInProgress ? AppColors.primary600 : AppColors.success,
        ),
      ),
      title: Text(
        entry.poTransporter,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5),
      ),
      subtitle: subtitle.isEmpty
          ? null
          : Text(
              subtitle,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 12.5),
            ),
      trailing: StatusPill(
        label: validationStatusLabel(entry.status),
        tone: validationStatusTone(entry.status),
      ),
    );
  }
}

/// Filter status — superset dari web: di layar kecil, operator lebih cepat
/// menemukan pekerjaan tertunda dengan memfilter "Berjalan" daripada menggulir
/// semua baris. Bentuk chip-nya dipakai bersama lewat
/// [StatusFilterChips] (`lib/widgets/filter_chips.dart`).
const validationStatusFilterOptions = <(String?, String)>[
  (null, 'Semua'),
  (statusInProgress, 'Berjalan'),
  (statusCompleted, 'Selesai'),
  (statusCancelled, 'Dibatalkan'),
];

/// Warna status validasi: hijau = selesai, merah = dibatalkan, biru = sedang
/// berjalan (sama dengan warna badge `statusConfig` di web).
PillTone validationStatusTone(String status) => switch (status) {
  statusCompleted => PillTone.success,
  statusCancelled => PillTone.danger,
  _ => PillTone.primary,
};

/// Nada pesan untuk status validasi — dipisah dari [validationStatusTone]
/// supaya kartu pesan bisa memakai [MessageTone] yang sama dengan tab lain.
MessageTone _messageTone(String status) => switch (status) {
  statusCompleted => MessageTone.success,
  statusCancelled => MessageTone.error,
  _ => MessageTone.info,
};

class _ScanDocCard extends StatelessWidget {
  const _ScanDocCard({
    required this.controller,
    required this.busy,
    required this.enabled,
    required this.errorText,
    required this.onSubmit,
    required this.onScan,
  });

  final TextEditingController controller;
  final bool busy;
  final bool enabled;
  final String? errorText;
  final VoidCallback onSubmit;
  final VoidCallback onScan;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SectionHeader(
          title: 'Pindai dokumen',
          subtitle:
              'Scan barcode PO Transporter pada dokumen SJ, atau ketik '
              'nomornya jika barcode tidak terbaca.',
        ),
        const Divider(height: 1),
        Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              FilledButton.icon(
                onPressed: busy || !enabled ? null : onScan,
                style: FilledButton.styleFrom(
                  minimumSize: const Size.fromHeight(52),
                  backgroundColor: AppColors.primary600,
                ),
                icon: busy
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Icon(Icons.qr_code_scanner),
                label: Text(
                  busy ? 'Memuat dokumen...' : 'Scan Barcode Dokumen',
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  const Expanded(child: Divider(color: AppColors.gray200)),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 10),
                    child: Text(
                      'atau',
                      style: TextStyle(fontSize: 12, color: AppColors.gray400),
                    ),
                  ),
                  const Expanded(child: Divider(color: AppColors.gray200)),
                ],
              ),
              const SizedBox(height: 12),
              TextField(
                key: const Key('validation-code'),
                controller: controller,
                textCapitalization: TextCapitalization.characters,
                textInputAction: TextInputAction.go,
                onSubmitted: (_) => busy || !enabled ? null : onSubmit(),
                decoration: InputDecoration(
                  hintText: 'PO Transporter',
                  prefixIcon: const Icon(
                    Icons.confirmation_number_outlined,
                    size: 20,
                  ),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(AppRadius.input),
                  ),
                ),
              ),
              const SizedBox(height: 10),
              OutlinedButton(
                onPressed: busy || !enabled ? null : onSubmit,
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size.fromHeight(48),
                ),
                child: const Text('Mulai Validasi'),
              ),
              if (errorText != null) ...[
                const SizedBox(height: 12),
                MessageCard(
                  message: errorText!,
                  tone: MessageTone.error,
                  icon: Icons.error_outline,
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _FromCheckPointHint extends StatelessWidget {
  const _FromCheckPointHint();

  @override
  Widget build(BuildContext context) {
    return SectionCard(
      color: AppColors.gray50,
      child: const Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.info_outline, size: 18, color: AppColors.gray600),
          SizedBox(width: 10),
          Expanded(
            child: Text(
              'Sudah scan di tab Check In? Tekan "Mulai Validasi" pada kartu '
              'dokumen di sana — PO-nya tidak perlu di-scan atau diketik lagi.',
              style: TextStyle(
                color: AppColors.gray700,
                fontSize: 12.5,
                height: 1.35,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _HowToCard extends StatelessWidget {
  const _HowToCard();

  @override
  Widget build(BuildContext context) {
    const steps = <(String, String)>[
      ('Scan', 'Pindai barcode dokumen SJ / PO Transporter, satu kali saja.'),
      ('Periksa', 'Scan barcode kemasan, isi qty & tanggal expired.'),
      ('Kondisi', 'Pilih kondisi fisik; kondisi bermasalah wajib foto.'),
      ('Selesaikan', 'Setelah semua item diperiksa, tekan Selesaikan.'),
    ];
    return SectionCard(
      color: AppColors.gray50,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Alur validasi',
            style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
          ),
          const SizedBox(height: 10),
          for (var i = 0; i < steps.length; i++) ...[
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 22,
                  height: 22,
                  alignment: Alignment.center,
                  decoration: const BoxDecoration(
                    color: AppColors.primary600,
                    shape: BoxShape.circle,
                  ),
                  child: Text(
                    '${i + 1}',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        steps[i].$1,
                        style: const TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 13.5,
                        ),
                      ),
                      Text(
                        steps[i].$2,
                        style: const TextStyle(
                          fontSize: 12.5,
                          color: AppColors.gray500,
                          height: 1.35,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            if (i < steps.length - 1) const SizedBox(height: 10),
          ],
        ],
      ),
    );
  }
}

class _DocHeaderCard extends StatelessWidget {
  const _DocHeaderCard({required this.validation});

  final SjValidation validation;

  @override
  Widget build(BuildContext context) {
    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  validation.poTransporter,
                  style: const TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 16,
                  ),
                ),
              ),
              StatusPill(
                label: validationStatusLabel(validation.status),
                tone: validationStatusTone(validation.status),
              ),
            ],
          ),
          const SizedBox(height: 12),
          _InfoRow(label: 'Nopol', value: validation.nopol),
          _InfoRow(label: 'Driver', value: validation.driverName),
          _InfoRow(label: 'Tujuan', value: validation.destinationName),
          if (validation.validatorName != null)
            _InfoRow(label: 'Validator', value: validation.validatorName!),
        ],
      ),
    );
  }
}

class _ProgressCard extends StatelessWidget {
  const _ProgressCard({required this.validation});

  final SjValidation validation;

  @override
  Widget build(BuildContext context) {
    final percent = (validation.progress * 100).round();
    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text(
                'Progres',
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
              ),
              const Spacer(),
              Text(
                '$percent%',
                style: const TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 14,
                  color: AppColors.primary600,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: validation.progress,
              minHeight: 8,
              backgroundColor: AppColors.gray100,
              color: AppColors.successBright,
            ),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _MiniStat(
                label: 'Sudah',
                value: '${validation.validatedItems}',
                color: AppColors.success,
              ),
              _MiniStat(
                label: 'Selisih',
                value: '${validation.mismatchItems}',
                color: AppColors.warningText,
              ),
              _MiniStat(
                label: 'Belum',
                value: '${validation.pendingItems}',
                color: AppColors.gray500,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Banner "Standarisasi Tumpukan Belum Disetujui" — padanan blok amber di
/// `validasi-sj/page.tsx` yang muncul setelah `router.push` dari `openItem`.
///
/// Kata-katanya, warna amber, dan tombol "Buat Standarisasi" disalin apa adanya
/// karena banner ini menjelaskan kenapa operator tiba-tiba tidak bisa memeriksa
/// item — kalimat baru akan membingungkan.
class _StackApprovalBanner extends StatelessWidget {
  const _StackApprovalBanner({required this.onOpen});

  final Future<void> Function() onOpen;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.warningBg,
        border: Border.all(color: AppColors.amber200),
        borderRadius: BorderRadius.circular(AppRadius.panel),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: AppColors.amber100,
              borderRadius: BorderRadius.circular(8),
            ),
            alignment: Alignment.center,
            child: const Icon(
              Icons.warning_amber_rounded,
              size: 20,
              color: AppColors.amber600,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Standarisasi Tumpukan Belum Disetujui',
                  style: TextStyle(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w800,
                    color: AppColors.amber900,
                  ),
                ),
                const SizedBox(height: 4),
                const Text(
                  'Buat dan approv standarisasi tumpukan terlebih dahulu di '
                  'halaman Standarisasi. Setelah disetujui BLC, baru lanjutkan '
                  'validasi dokumen.',
                  style: TextStyle(
                    fontSize: 12.5,
                    height: 1.35,
                    color: AppColors.amber700,
                  ),
                ),
                const SizedBox(height: 10),
                Align(
                  alignment: Alignment.centerLeft,
                  child: FilledButton.icon(
                    key: const Key('validation-standarisasi-banner-action'),
                    onPressed: onOpen,
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.amber600,
                      minimumSize: const Size(0, 44),
                    ),
                    icon: const Icon(Icons.arrow_forward, size: 14),
                    label: const Text(
                      'Buat Standarisasi',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
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

class _ItemTile extends StatelessWidget {
  const _ItemTile({
    required this.item,
    required this.enabled,
    required this.onTap,
  });

  final SjValidationItem item;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    // Baris yang produknya belum punya standarisasi disetujui diberi border
    // amber dan tanda peringatan, sama seperti tombol item amber di
    // `validasi-sj/page.tsx` — supaya operator tahu sebelum mengetuk bahwa
    // yang dibuka adalah halaman Standarisasi, bukan form pemeriksaan.
    final blocked = item.needsStackApproval;
    final warning = item.stackWarningLabel;
    // Baris ini adalah target sentuh terbesar di layar validasi: isinya lima
    // potongan terpisah (kode, nama, chip qty, pill status, peringatan), yang
    // tanpa label semantics akan dibaca screen reader sebagai lima node tak
    // berurutan. Satu label gabungan membuat operator dengar "kode, nama,
    // hasil qty, status" dalam satu perubahan fokus — persis yang dia lihat.
    final qtySuffix = item.satuan.isEmpty ? '' : ' ${item.satuan}';
    final qtyText = item.actualQty == null
        ? 'rencana ${formatQty(item.expectedQty)}$qtySuffix'
        : '${formatQty(item.actualQty!)} dari ${formatQty(item.expectedQty)}'
              '$qtySuffix';
    return Pressable(
      key: Key('validation-item-${item.id}'),
      color: blocked ? AppColors.warningBg : AppColors.card,
      borderRadius: BorderRadius.circular(16),
      border: BorderSide(
        color: blocked ? AppColors.amber200 : AppColors.gray200,
      ),
      enabled: enabled,
      semanticLabel:
          '${item.kodeBarang}, ${item.namaBarang}, $qtyText, '
          '${item.summaryLabel}${warning == null ? '' : '. $warning'}',
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    item.kodeBarang,
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 13.5,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    item.namaBarang,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 13,
                      color: AppColors.gray600,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      _QtyChip(item: item),
                      StatusPill(
                        label: item.summaryLabel,
                        tone: item.isPending
                            ? PillTone.neutral
                            : item.isMismatch
                            ? PillTone.warning
                            : PillTone.success,
                      ),
                    ],
                  ),
                  if (warning != null) ...[
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        const Icon(
                          Icons.warning_amber_rounded,
                          size: 15,
                          color: AppColors.amber600,
                        ),
                        const SizedBox(width: 5),
                        Expanded(
                          child: Text(
                            warning,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 11.5,
                              fontWeight: FontWeight.w600,
                              color: AppColors.amber700,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 8),
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Icon(
                blocked ? Icons.arrow_forward : Icons.chevron_right,
                color: blocked ? AppColors.amber600 : AppColors.gray400,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _QtyChip extends StatelessWidget {
  const _QtyChip({required this.item});

  final SjValidationItem item;

  @override
  Widget build(BuildContext context) {
    final actual = item.actualQty;
    final suffix = item.satuan.isEmpty ? '' : ' ${item.satuan}';
    final text = actual == null
        ? 'Rencana ${formatQty(item.expectedQty)}$suffix'
        : '${formatQty(actual)} / ${formatQty(item.expectedQty)}$suffix';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: AppColors.gray100,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        text,
        style: const TextStyle(
          fontSize: 11.5,
          fontWeight: FontWeight.w600,
          color: AppColors.gray700,
        ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 72,
            child: Text(
              label,
              style: const TextStyle(
                fontSize: 12.5,
                color: AppColors.gray500,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(fontSize: 13.5, color: AppColors.gray800),
            ),
          ),
        ],
      ),
    );
  }
}

class _MiniStat extends StatelessWidget {
  const _MiniStat({
    required this.label,
    required this.value,
    required this.color,
  });

  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            '$label ',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: color,
            ),
          ),
          Text(
            value,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w800,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}
