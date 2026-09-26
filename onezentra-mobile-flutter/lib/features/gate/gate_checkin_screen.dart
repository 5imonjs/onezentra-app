import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:onezentra_mobile/features/auth/auth_provider.dart';
import 'package:onezentra_mobile/features/gate/gate_provider.dart';
import 'package:onezentra_mobile/features/gate/gate_service.dart';
import 'package:onezentra_mobile/features/gate/gate_session_provider.dart';
import 'package:onezentra_mobile/features/gate/models/gate_models.dart';
import 'package:onezentra_mobile/features/gate/scanner_screen.dart';
import 'package:onezentra_mobile/theme/app_colors.dart';
import 'package:onezentra_mobile/widgets/denied_card.dart';
import 'package:onezentra_mobile/widgets/page_header.dart';
import 'package:onezentra_mobile/widgets/section_card.dart';
import 'package:onezentra_mobile/widgets/states.dart';
import 'package:onezentra_mobile/widgets/status_pill.dart';

/// Check In Point — mirror `onezentra-web/src/app/gate/page.tsx`:
/// scan PO/Nopol → lookup → Gate IN / Verify / Gate OUT + riwayat.
///
/// Dokumen yang sama tidak perlu di-scan dua kali: dari kartu hasil lookup
/// ada tombol "Mulai Validasi →" yang membuka tab Validasi Dokumen dengan
/// dokumen yang sudah ditemukan ([onOpenValidation]).
///
/// state aksi (dokumen yang sedang diproses) di-scope ke layar ini lewat
/// [GateSessionProvider] supaya tidak pernah bertahan lintas akun.
class GateCheckinScreen extends StatefulWidget {
  const GateCheckinScreen({super.key, this.service, this.onOpenValidation});

  /// Bisa di-inject untuk pengujian; default memakai Dio global.
  final GateService? service;

  /// Dipanggil dengan id rencana kirim saat operator menekan "Mulai
  /// Validasi" — shell yang memutuskan tab mana yang dibuka. Null = tombol
  /// disembunyikan (mis. dipakai layar tanpa navigasi).
  final void Function(int rencanaKirimId)? onOpenValidation;

  @override
  State<GateCheckinScreen> createState() => _GateCheckinScreenState();
}

class _GateCheckinScreenState extends State<GateCheckinScreen> {
  final _scanCtrl = TextEditingController();
  final _searchCtrl = TextEditingController();
  String _debouncedSearch = '';
  Timer? _searchDebounce;

  @override
  void initState() {
    super.initState();
    _searchCtrl.addListener(_onSearchChanged);
  }

  void _onSearchChanged() {
    final value = _searchCtrl.text.trim();
    _searchDebounce?.cancel();
    _searchDebounce = Timer(const Duration(milliseconds: 400), () {
      if (!mounted || value == _debouncedSearch) {
        return;
      }
      _debouncedSearch = value;
      context.read<GateProvider>().loadHistory(reset: true, search: value);
    });
  }

  /// Kosongkan pencarian dan muat daftar penuh sekaligus. Tombol "Hapus
  /// pencarian" harus mengembalikan daftar, bukan hanya mengosongkan kotak —
  /// kalau state yang sudah dipakai server tidak ikut direset, pull-to-refresh
  /// berikutnya akan memuat kata kunci lama lagi.
  void _clearSearch() {
    _searchCtrl.clear();
    _debouncedSearch = '';
    context.read<GateProvider>().loadHistory(reset: true, search: '');
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _scanCtrl.dispose();
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _reloadAfterCommit() async {
    final gate = context.read<GateProvider>();
    await Future.wait([
      gate.loadStats(),
      gate.loadHistory(reset: true, search: _debouncedSearch),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    if (!auth.hasPermission('gate.view')) {
      // Tanpa izin, layar tetap memakai pita header yang sama supaya operator
      // langsung tahu menu mana yang dia buka, bukan menemukan halaman kosong.
      return Scaffold(
        backgroundColor: AppColors.surface,
        body: Column(
          children: [
            const PageHeader(
              title: 'Check In Point',
              subtitle: 'Scan PO / Nopol - IN OUT • auto status',
              icon: Icons.location_on_outlined,
            ),
            const Expanded(
              child: Padding(
                padding: EdgeInsets.all(20),
                child: DeniedCard(
                  message:
                      'Anda tidak memiliki izin untuk melihat Check In Point.',
                ),
              ),
            ),
          ],
        ),
      );
    }

    return ChangeNotifierProvider<GateSessionProvider>(
      create: (_) => GateSessionProvider(
        widget.service ?? GateService(),
        onCommitted: _reloadAfterCommit,
      ),
      child: _GateCheckinBody(
        scanCtrl: _scanCtrl,
        searchCtrl: _searchCtrl,
        debouncedSearch: () => _debouncedSearch,
        onOpenValidation: widget.onOpenValidation,
        onClearSearch: _clearSearch,
      ),
    );
  }
}

class _GateCheckinBody extends StatelessWidget {
  const _GateCheckinBody({
    required this.scanCtrl,
    required this.searchCtrl,
    required this.debouncedSearch,
    this.onOpenValidation,
    this.onClearSearch,
  });

  final TextEditingController scanCtrl;
  final TextEditingController searchCtrl;
  final String Function() debouncedSearch;
  final void Function(int rencanaKirimId)? onOpenValidation;

  /// Dipakai tombol "Hapus pencarian" di kondisi daftar kosong.
  final VoidCallback? onClearSearch;

  /// Validasi hanya bisa dilanjutkan dari sini bila shell menyediakan
  /// navigasinya (tombol "Mulai Validasi") **dan** akun punya izin
  /// `sj_validation.create` — sama dengan middleware endpoint start.
  bool _canStartValidation(BuildContext context) {
    return onOpenValidation != null &&
        context.read<AuthProvider>().hasPermission('sj_validation.create');
  }

  /// Setelah Gate IN tercatat, kartu dokumen dikosongkan (supaya operator
  /// bisa scan kendaraan berikutnya) — tapi dokumennya langsung bisa
  /// dilanjutkan ke Validasi tanpa scan ulang.
  bool _canContinueValidation(
    GateSessionProvider session,
    BuildContext context,
  ) {
    final committed = session.lastCommitted;
    return committed != null &&
        _canStartValidation(context) &&
        isDocumentValidatable(committed.status);
  }

  Future<void> _openScanner(BuildContext context) async {
    final code = await Navigator.of(
      context,
    ).push<String>(MaterialPageRoute(builder: (_) => const ScannerScreen()));
    if (code == null || !context.mounted) {
      return;
    }
    final value = code.trim();
    if (value.isEmpty) {
      return;
    }
    scanCtrl.text = value;
    scanCtrl.selection = TextSelection.collapsed(offset: value.length);
    await context.read<GateSessionProvider>().lookup(value);
  }

  void _deny(BuildContext context, String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _confirmAction(BuildContext context, String type) async {
    final session = context.read<GateSessionProvider>();
    final auth = context.read<AuthProvider>();
    final rk = session.found;
    if (rk == null) {
      return;
    }
    if ((type == 'IN' || type == 'OUT') && !auth.hasPermission('gate.create')) {
      _deny(
        context,
        type == 'IN'
            ? 'Anda tidak memiliki izin gate.create untuk Gate IN.'
            : 'Anda tidak memiliki izin gate.create untuk Gate OUT.',
      );
      return;
    }
    if (type == 'VERIFY' && !auth.hasPermission('rencana_kirim.edit')) {
      _deny(
        context,
        'Anda tidak memiliki izin rencana_kirim.edit untuk verifikasi.',
      );
      return;
    }

    final title = switch (type) {
      'IN' => 'Catat Gate IN?',
      'OUT' => 'Catat Gate OUT?',
      _ => 'Verifikasi Dokumen?',
    };
    final desc = switch (type) {
      'IN' =>
        'Kendaraan masuk dicatat dan status rencana kirim berubah menjadi '
            'Check In.',
      'OUT' => 'Pastikan kendaraan benar-benar keluar dari area depo.',
      _ =>
        'Dokumen dinyatakan terverifikasi dan status berubah menjadi '
            'Terverifikasi.',
    };

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Subtitle modal di web: peringatan bahwa aksi tidak bisa dibatalkan
            // diletakkan sebelum data, jadi operator membacanya saat masih bisa
            // menekan Batal.
            const Text(
              'Periksa kembali data sebelum mencatat — aksi ini tersimpan '
              'permanen.',
              style: TextStyle(fontSize: 12, color: AppColors.gray500),
            ),
            const SizedBox(height: 12),
            _ConfirmRow(label: 'PO Transporter', value: rk.poTransporter),
            _ConfirmRow(label: 'Nopol', value: rk.nopol),
            _ConfirmRow(label: 'Driver', value: rk.driverName),
            _ConfirmRow(label: 'Status', value: gateStatusLabel(rk.status)),
            const SizedBox(height: 8),
            Text(desc, style: const TextStyle(fontSize: 13)),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Batal'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: type == 'OUT'
                  ? AppColors.errorText
                  : AppColors.primary600,
            ),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(switch (type) {
              'IN' => 'Ya, Catat IN',
              'OUT' => 'Ya, Catat OUT',
              _ => 'Ya, Verifikasi',
            }),
          ),
        ],
      ),
    );
    if (ok != true || !context.mounted) {
      return;
    }

    final success = switch (type) {
      'IN' => await session.gateIn(),
      'OUT' => await session.gateOut(),
      _ => await session.verify(),
    };
    if (success) {
      scanCtrl.clear();
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final gate = context.watch<GateProvider>();
    final session = context.watch<GateSessionProvider>();

    return Scaffold(
      backgroundColor: AppColors.surface,
      body: Column(
        children: [
          // Judul dan angka ringkasan jadi satu pita, persis seperti header
          // `gate/page.tsx` di web. Sebelumnya AppBar gelap berdiri sendiri lalu
          // kartu statistik gelap lain di bawahnya: dua blok gelap dengan isi
          // yang saling terkait, dan tidak ada satu pun yang lengkap.
          PageHeader(
            title: 'Check In Point',
            subtitle: 'Scan PO / Nopol - IN OUT • auto status',
            icon: Icons.location_on_outlined,
            statsLoading: gate.statsLoading,
            statsError: gate.statsError,
            onStatsRetry: gate.loadStats,
            stats: [
              HeaderStat(label: 'Hari ini', value: '${gate.stats.hariIni}'),
              HeaderStat(
                label: 'Terjadwal',
                value: '${gate.stats.terjadwal}',
                dot: AppColors.blue200,
                badge: AppColors.blue200,
                onBadge: AppColors.blue700,
              ),
              HeaderStat(
                label: 'Selesai',
                value: '${gate.stats.selesai}',
                dot: AppColors.successBright,
                badge: AppColors.successBright,
              ),
              HeaderStat(
                label: 'Total',
                value: '${gate.stats.total}',
                dot: AppColors.gray300,
              ),
            ],
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async {
                await Future.wait([
                  gate.loadStats(),
                  gate.loadHistory(reset: true, search: debouncedSearch()),
                ]);
              },
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  Center(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 720),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          SectionCard(
                            padding: EdgeInsets.zero,
                            child: _ScanCard(
                              controller: scanCtrl,
                              busy: session.lookupBusy,
                              onSearch: () => context
                                  .read<GateSessionProvider>()
                                  .lookup(scanCtrl.text),
                              onScanCamera: () => _openScanner(context),
                            ),
                          ),
                          if (session.resultOk != null) ...[
                            const SizedBox(height: 12),
                            MessageCard(
                              message: session.resultOk!,
                              tone: MessageTone.success,
                              icon: Icons.check_circle_outline,
                            ),
                          ],
                          if (session.resultError != null) ...[
                            const SizedBox(height: 12),
                            MessageCard(
                              message: session.resultError!,
                              tone: MessageTone.error,
                              icon: Icons.error_outline,
                            ),
                          ],
                          if (_canContinueValidation(session, context)) ...[
                            const SizedBox(height: 12),
                            _ContinueValidationCard(
                              rk: session.lastCommitted!,
                              onStart: () =>
                                  onOpenValidation!(session.lastCommitted!.id),
                            ),
                          ],
                          if (session.found != null) ...[
                            const SizedBox(height: 12),
                            _FoundCard(
                              rk: session.found!,
                              busy: session.actionBusy,
                              canGateCreate: auth.hasPermission('gate.create'),
                              canVerify: auth.hasPermission(
                                'rencana_kirim.edit',
                              ),
                              onIn: () => _confirmAction(context, 'IN'),
                              onOut: () => _confirmAction(context, 'OUT'),
                              onVerify: () => _confirmAction(context, 'VERIFY'),
                              onValidate: _canStartValidation(context)
                                  ? () => onOpenValidation!(session.found!.id)
                                  : null,
                              onClear: context
                                  .read<GateSessionProvider>()
                                  .clearFound,
                            ),
                          ],
                          const SizedBox(height: 12),
                          _HistoryCard(
                            items: gate.history,
                            loading: gate.historyLoading,
                            error: gate.historyError,
                            total: gate.totalRows,
                            searchCtrl: searchCtrl,
                            hasMore: gate.hasMoreHistory,
                            onRetry: () => gate.loadHistory(
                              reset: true,
                              search: debouncedSearch(),
                            ),
                            onMore: () => gate.nextPage(debouncedSearch()),
                            onClearSearch: onClearSearch,
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ScanCard extends StatelessWidget {
  const _ScanCard({
    required this.controller,
    required this.busy,
    required this.onSearch,
    required this.onScanCamera,
  });

  final TextEditingController controller;
  final bool busy;
  final VoidCallback onSearch;
  final VoidCallback onScanCamera;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SectionHeader(
          title: 'Quick Scan',
          subtitle:
              'Satu scan cukup: dokumen yang ketemu bisa langsung '
              'dilanjutkan ke Gate IN atau Validasi Dokumen.',
        ),
        const Divider(height: 1),
        Padding(
          padding: const EdgeInsets.all(16),
          child: IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(
                  child: TextField(
                    controller: controller,
                    textInputAction: TextInputAction.search,
                    onSubmitted: (_) => onSearch(),
                    decoration: const InputDecoration(
                      hintText: 'PO / Nopol...',
                      prefixIcon: Icon(Icons.search, size: 20),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                FilledButton(
                  onPressed: busy ? null : onSearch,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.gray900,
                    minimumSize: const Size(76, 48),
                  ),
                  child: busy
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Text('Cari'),
                ),
                const SizedBox(width: 8),
                Tooltip(
                  message: 'Pindai dengan kamera',
                  child: OutlinedButton(
                    onPressed: onScanCamera,
                    style: OutlinedButton.styleFrom(
                      padding: EdgeInsets.zero,
                      minimumSize: const Size(48, 48),
                    ),
                    child: const Icon(Icons.qr_code_scanner),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

/// Kartu lanjutan setelah gate tercatat: satu-satunya aksi yang tersisa untuk
/// dokumen tersebut adalah memeriksa isinya, jadi PO-nya diteruskan apa adanya
/// ke tab Validasi.
class _ContinueValidationCard extends StatelessWidget {
  const _ContinueValidationCard({required this.rk, required this.onStart});

  final RencanaKirimSummary rk;
  final VoidCallback onStart;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.primary200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Icon(
                Icons.fact_check_outlined,
                color: AppColors.primary600,
                size: 20,
              ),
              const SizedBox(width: 8),
              const Expanded(
                child: Text(
                  'Langkah berikutnya: Validasi Dokumen',
                  style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5),
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            '${rk.poTransporter} • ${gateStatusLabel(rk.status)}',
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(color: AppColors.gray500, fontSize: 12.5),
          ),
          const SizedBox(height: 12),
          FilledButton.icon(
            key: const Key('gate-continue-validation'),
            onPressed: onStart,
            style: FilledButton.styleFrom(
              minimumSize: const Size.fromHeight(48),
              backgroundColor: AppColors.primary600,
            ),
            icon: const Icon(Icons.arrow_forward, size: 18),
            label: const Text('Mulai Validasi'),
          ),
        ],
      ),
    );
  }
}

class _FoundCard extends StatelessWidget {
  const _FoundCard({
    required this.rk,
    required this.busy,
    required this.canGateCreate,
    required this.canVerify,
    required this.onIn,
    required this.onOut,
    required this.onVerify,
    required this.onValidate,
    required this.onClear,
  });

  final RencanaKirimSummary rk;
  final bool busy;
  final bool canGateCreate;
  final bool canVerify;
  final VoidCallback onIn;
  final VoidCallback onOut;
  final VoidCallback onVerify;
  final VoidCallback? onValidate;
  final VoidCallback onClear;

  /// Aksi yang valid untuk status dokumen saat ini.
  ({String type, String label, IconData icon})? get _action {
    return switch (rk.status) {
      'SCHEDULED' => (type: 'IN', label: 'Gate IN →', icon: Icons.login),
      'CHECKED_IN' => (
        type: 'VERIFY',
        label: 'Verify ✓',
        icon: Icons.verified_outlined,
      ),
      'COMPLETED' => (type: 'OUT', label: 'Gate OUT', icon: Icons.logout),
      _ => null,
    };
  }

  bool get _actionAllowed =>
      _action == null ||
      (_action!.type == 'VERIFY' ? canVerify : canGateCreate);

  /// Tombol Validasi hanya muncul saat status dokumen masih boleh divalidasi,
  /// sesuai guard `SjValidationController::startValidation`.
  bool get _validatable =>
      onValidate != null && isDocumentValidatable(rk.status);

  @override
  Widget build(BuildContext context) {
    final action = _action;
    // Status tanpa aksi gate selalu diberi penjelasan — status yang tidak
    // dikenal pun, dengan kalimat yang sama seperti fallback
    // `STATUS_GUIDE[status] ?? 'Status ini tidak memiliki aksi gate.'` di web.
    // Diam saja akan membuat operator mengira kartu gagal dimuat.
    final guide = action == null
        ? gateStatusGuide(rk.status) ?? 'Status ini tidak memiliki aksi gate.'
        : null;
    final driver = rk.driverName.isEmpty ? '-' : rk.driverName;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [AppColors.gray900, AppColors.primary950],
        ),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: _DarkTile(label: 'PO', value: rk.poTransporter),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _LightTile(label: 'Nopol', value: rk.nopol),
              ),
            ],
          ),
          const SizedBox(height: 8),
          _DarkTile(
            label: 'Driver • Status',
            value: '$driver • ${gateStatusLabel(rk.status)}',
          ),
          if (action != null) ...[
            const SizedBox(height: 12),
            if (_actionAllowed)
              _ActionButton(
                label: action.label,
                icon: action.icon,
                busy: busy,
                outbound: action.type == 'OUT',
                onPressed: () => switch (action.type) {
                  'IN' => onIn(),
                  'OUT' => onOut(),
                  _ => onVerify(),
                },
              )
            else
              _MissingPermissionHint(type: action.type),
          ],
          if (_validatable) ...[
            const SizedBox(height: 8),
            OutlinedButton.icon(
              key: const Key('gate-start-validation'),
              onPressed: busy ? null : onValidate,
              icon: const Icon(Icons.fact_check_outlined, size: 18),
              label: const Text('Mulai Validasi →'),
              style: OutlinedButton.styleFrom(
                foregroundColor: Colors.white,
                side: const BorderSide(color: AppColors.primary300),
              ),
            ),
          ],
          if (guide != null) ...[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                guide,
                style: const TextStyle(color: Colors.white70, fontSize: 12.5),
              ),
            ),
          ],
          TextButton(
            onPressed: onClear,
            child: const Text(
              'Bersihkan hasil',
              style: TextStyle(color: Colors.white70),
            ),
          ),
        ],
      ),
    );
  }
}

class _ActionButton extends StatelessWidget {
  const _ActionButton({
    required this.label,
    required this.icon,
    required this.busy,
    required this.outbound,
    required this.onPressed,
  });

  final String label;
  final IconData icon;
  final bool busy;
  final bool outbound;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    if (outbound) {
      return OutlinedButton.icon(
        onPressed: busy ? null : onPressed,
        icon: Icon(icon, size: 18),
        label: Text(label),
        style: OutlinedButton.styleFrom(
          foregroundColor: Colors.white,
          side: const BorderSide(color: Colors.white30),
        ),
      );
    }
    return FilledButton.icon(
      onPressed: busy ? null : onPressed,
      icon: busy
          ? const SizedBox(
              width: 16,
              height: 16,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: Colors.white,
              ),
            )
          : Icon(icon, size: 18),
      label: Text(label),
      style: FilledButton.styleFrom(
        backgroundColor: Colors.white,
        foregroundColor: AppColors.gray900,
      ),
    );
  }
}

class _MissingPermissionHint extends StatelessWidget {
  const _MissingPermissionHint({required this.type});

  final String type;

  @override
  Widget build(BuildContext context) {
    final needed = type == 'VERIFY' ? 'rencana_kirim.edit' : 'gate.create';
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.warningBg,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          const Icon(
            Icons.lock_outline,
            size: 18,
            color: AppColors.warningText,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'Dokumen siap diproses, tetapi akun Anda tidak punya izin '
              '$needed. Minta akses ke admin.',
              style: const TextStyle(
                color: AppColors.warningText,
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

class _DarkTile extends StatelessWidget {
  const _DarkTile({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label.toUpperCase(),
            style: const TextStyle(color: Colors.white54, fontSize: 10),
          ),
          const SizedBox(height: 2),
          Text(
            value.isEmpty ? '-' : value,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(color: Colors.white, fontSize: 13.5),
          ),
        ],
      ),
    );
  }
}

class _LightTile extends StatelessWidget {
  const _LightTile({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label.toUpperCase(),
            style: const TextStyle(color: AppColors.gray500, fontSize: 10),
          ),
          const SizedBox(height: 2),
          Text(
            value.isEmpty ? '-' : value,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: AppColors.gray900,
              fontSize: 13.5,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _ConfirmRow extends StatelessWidget {
  const _ConfirmRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(color: AppColors.gray500)),
          const SizedBox(width: 12),
          Flexible(
            child: Text(
              value.isEmpty ? '-' : value,
              textAlign: TextAlign.end,
              style: const TextStyle(fontWeight: FontWeight.w700),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}

class _HistoryCard extends StatelessWidget {
  const _HistoryCard({
    required this.items,
    required this.loading,
    required this.error,
    required this.total,
    required this.searchCtrl,
    required this.hasMore,
    required this.onRetry,
    required this.onMore,
    required this.onClearSearch,
  });

  final List<GateTransactionItem> items;
  final bool loading;
  final String? error;
  final int total;
  final TextEditingController searchCtrl;
  final bool hasMore;
  final VoidCallback onRetry;
  final VoidCallback onMore;

  /// Null berarti layar tidak menyediakan jalan keluar dari filter (mis.
  /// diuji tanpa shell), jadi tombolnya disembunyikan.
  final VoidCallback? onClearSearch;

  @override
  Widget build(BuildContext context) {
    // Kata kunci dibaca dari controller, bukan dari state terpisah: daftar
    // hanya dibangun ulang setelah hasil pencarian tiba, jadi isinya selalu
    // sama dengan yang dikirim ke server.
    final search = searchCtrl.text.trim();
    return SectionCard(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Divider(height: 1),
          const SectionHeader(
            title: 'Riwayat Gate',
            subtitle: 'Transaksi gate yang pernah tercatat',
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: searchCtrl,
                    decoration: const InputDecoration(
                      hintText: 'Cari nopol / dokumen...',
                      prefixIcon: Icon(Icons.search, size: 20),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                // Jumlah total di samping kotak cari: ia menjawab "apakah
                // daftar ini sudah lengkap", bukan dekorasi.
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
          ),
          if (error != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              child: ErrorCard(message: error!, onRetry: onRetry),
            ),
          // Spinner penuh membuat layar terasa kosong setiap kali filter
          // berubah; skeleton menunjukkan bentuk daftar yang akan datang.
          if (loading && items.isEmpty)
            const Padding(
              padding: EdgeInsets.fromLTRB(16, 0, 16, 20),
              child: SkeletonList(rows: 3),
            ),
          if (!loading && items.isEmpty && error == null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 20),
              child: EmptyState(
                // Kosong karena pencarian berbeda dari kosong karena belum ada
                // transaksi: yang pertama harus menawarkan cara keluar dari
                // filter, persis `hasSearch ? ... : ...` di `gate/page.tsx`.
                title: search.isEmpty
                    ? 'Belum ada transaksi gate'
                    : 'Tidak ada hasil untuk "$search"',
                message: search.isEmpty
                    ? 'Scan PO atau plat kendaraan di Quick Scan di atas.'
                    : 'Coba kata kunci lain atau kembalikan ke daftar penuh.',
                icon: search.isEmpty ? Icons.login : Icons.search_off,
                action: search.isEmpty || onClearSearch == null
                    ? null
                    : TextButton(
                        key: const Key('gate-history-clear-search'),
                        onPressed: onClearSearch,
                        child: const Text('Hapus pencarian'),
                      ),
              ),
            ),
          for (var i = 0; i < items.length; i++) ...[
            _HistoryRow(item: items[i]),
            if (i < items.length - 1)
              const Divider(height: 1, indent: 16, endIndent: 16),
          ],
          if (loading && items.isNotEmpty)
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

class _HistoryRow extends StatelessWidget {
  const _HistoryRow({required this.item});

  final GateTransactionItem item;

  @override
  Widget build(BuildContext context) {
    final inbound = item.gateType == 'INBOUND';
    final time = formatGateTimestamp(item.scanTime);
    final identity = [
      item.nopol,
      item.driverName,
    ].where((v) => v.isNotEmpty && v != 'null').join(' • ');
    final subtitle = [identity, ?time].where((v) => v.isNotEmpty).join('\n');

    return ListTile(
      leading: Container(
        width: 42,
        height: 42,
        decoration: BoxDecoration(
          color: inbound ? AppColors.blue50 : AppColors.violet50,
          borderRadius: BorderRadius.circular(12),
        ),
        alignment: Alignment.center,
        child: Icon(
          inbound ? Icons.login : Icons.logout,
          color: inbound ? AppColors.blue700 : AppColors.violet700,
        ),
      ),
      title: Text(
        item.poTransporter.isEmpty ? '-' : item.poTransporter,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(fontWeight: FontWeight.w700),
      ),
      subtitle: Text(
        subtitle,
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(fontSize: 12.5),
      ),
      isThreeLine: subtitle.contains('\n'),
      trailing: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          StatusPill(
            label: gateTypeLabel(item.gateType),
            tone: gateTypeTone(item.gateType),
          ),
          if (item.rkStatus.isNotEmpty) ...[
            const SizedBox(height: 4),
            // Web memakai komponen `StatusPill` yang sama untuk status
            // dokumen pada kartu hasil lookup maupun baris riwayat
            // (`gate/page.tsx`); mobile sebelumnya cuma teks abu-abu, jadi
            // operator tidak bisa memindai warnanya.
            StatusPill(
              label: gateStatusLabel(item.rkStatus),
              tone: gateStatusTone(item.rkStatus),
              dot: true,
            ),
          ],
        ],
      ),
    );
  }
}

/// Format waktu scan gate untuk tampilan daftar riwayat — `dd/MM/yyyy HH:mm:ss`,
/// sama dengan `fmtDateTime` di `gate/page.tsx` (jam ikut detik karena di gate
/// beberapa kendaraan melintas dalam satu menit yang sama).
String? formatGateTimestamp(String value) {
  if (value.isEmpty || value == 'null') {
    return null;
  }
  final parsed = DateTime.tryParse(value);
  if (parsed == null) {
    return value;
  }
  final local = parsed.toLocal();
  String two(int n) => n.toString().padLeft(2, '0');
  return '${two(local.day)}/${two(local.month)}/${local.year} '
      '${two(local.hour)}:${two(local.minute)}:${two(local.second)}';
}

/// Warna pill arah gate — `bg-blue-50 text-blue-700` (masuk) dan
/// `bg-violet-50 text-violet-700` (keluar), sama dengan badge pada tabel
/// riwayat di `gate/page.tsx`.
PillTone gateTypeTone(String type) =>
    type == 'INBOUND' ? PillTone.blue : PillTone.violet;

/// Label pill arah gate.
String gateTypeLabel(String type) => switch (type) {
  'INBOUND' => 'Masuk',
  'OUTBOUND' => 'Keluar',
  _ => '-',
};
