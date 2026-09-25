import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:onezentra_mobile/features/auth/auth_provider.dart';
import 'package:onezentra_mobile/features/gate/gate_provider.dart';
import 'package:onezentra_mobile/features/gate/models/gate_models.dart';
import 'package:onezentra_mobile/features/gate/scanner_screen.dart';
import 'package:onezentra_mobile/theme/app_colors.dart';

/// Check In Point — mirror `onezentra-web/src/app/gate/page.tsx`:
/// scan PO/Nopol → lookup → Gate IN / Verify / Gate OUT + riwayat.
class GateCheckinScreen extends StatefulWidget {
  const GateCheckinScreen({super.key});

  @override
  State<GateCheckinScreen> createState() => _GateCheckinScreenState();
}

class _GateCheckinScreenState extends State<GateCheckinScreen> {
  final _scanCtrl = TextEditingController();
  final _searchCtrl = TextEditingController();
  String _debouncedSearch = '';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final gate = context.read<GateProvider>();
      gate.loadStats();
      gate.loadHistory(reset: true);
    });
    _searchCtrl.addListener(_onSearchChanged);
  }

  void _onSearchChanged() {
    final value = _searchCtrl.text.trim();
    Future.delayed(const Duration(milliseconds: 400), () {
      if (!mounted || value != _searchCtrl.text.trim()) {
        return;
      }
      if (value == _debouncedSearch) {
        return;
      }
      setState(() => _debouncedSearch = value);
      context.read<GateProvider>().loadHistory(reset: true, search: value);
    });
  }

  @override
  void dispose() {
    _scanCtrl.dispose();
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _openScanner() async {
    final code = await Navigator.of(
      context,
    ).push<String>(MaterialPageRoute(builder: (_) => const ScannerScreen()));
    if (code == null || code.trim().isEmpty || !mounted) {
      return;
    }
    _scanCtrl.text = code.trim();
    await context.read<GateProvider>().lookup(code);
  }

  Future<void> _confirmAction(String type) async {
    final gate = context.read<GateProvider>();
    final auth = context.read<AuthProvider>();
    final rk = gate.found;
    if (rk == null) {
      return;
    }
    if (type == 'IN' && !auth.hasPermission('gate.create')) {
      _deny('Anda tidak memiliki izin gate.create untuk Gate IN.');
      return;
    }
    if (type == 'OUT' && !auth.hasPermission('gate.create')) {
      _deny('Anda tidak memiliki izin gate.create untuk Gate OUT.');
      return;
    }
    if (type == 'VERIFY' && !auth.hasPermission('rencana_kirim.edit')) {
      _deny('Anda tidak memiliki izin rencana_kirim.edit untuk verifikasi.');
      return;
    }
    final title = type == 'IN'
        ? 'Catat Gate IN?'
        : type == 'OUT'
        ? 'Catat Gate OUT?'
        : 'Verifikasi Dokumen?';
    final desc = type == 'IN'
        ? 'Kendaraan masuk dicatat dan status menjadi Check In.'
        : type == 'OUT'
        ? 'Pastikan kendaraan benar-benar keluar dari area depo.'
        : 'Dokumen dinyatakan terverifikasi.';
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _ConfirmRow(label: 'PO Transporter', value: rk.poTransporter),
            _ConfirmRow(label: 'Nopol', value: rk.nopol),
            _ConfirmRow(label: 'Driver', value: rk.driverName),
            _ConfirmRow(label: 'Status', value: gateStatusLabel(rk.status)),
            const SizedBox(height: 8),
            Text(desc, style: const TextStyle(fontSize: 13)),
            const SizedBox(height: 4),
            const Text(
              'Aksi ini tersimpan permanen.',
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
            style: FilledButton.styleFrom(
              backgroundColor: type == 'OUT'
                  ? AppColors.errorText
                  : AppColors.primary600,
            ),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(
              type == 'IN'
                  ? 'Ya, Catat IN'
                  : type == 'OUT'
                  ? 'Ya, Catat OUT'
                  : 'Ya, Verifikasi',
            ),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) {
      return;
    }
    final success = type == 'IN'
        ? await gate.gateIn()
        : type == 'OUT'
        ? await gate.gateOut()
        : await gate.verify();
    if (success) {
      _scanCtrl.clear();
    }
  }

  void _deny(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    if (!auth.hasPermission('gate.view')) {
      return Scaffold(
        appBar: AppBar(title: const Text('Check In Point')),
        body: const Padding(
          padding: EdgeInsets.all(20),
          child: _DeniedCard(
            message: 'Anda tidak memiliki izin untuk melihat Check In Point.',
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(
        title: const Text('Check In Point'),
        backgroundColor: AppColors.gray900,
        foregroundColor: Colors.white,
      ),
      body: Consumer<GateProvider>(
        builder: (context, gate, _) {
          return RefreshIndicator(
            onRefresh: () async {
              await Future.wait([
                gate.loadStats(),
                gate.loadHistory(reset: true, search: _debouncedSearch),
              ]);
            },
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                _StatsRow(stats: gate.stats, loading: gate.statsLoading),
                const SizedBox(height: 14),
                _ScanCard(
                  controller: _scanCtrl,
                  busy: gate.lookupBusy,
                  onSearch: () => gate.lookup(_scanCtrl.text),
                  onScanCamera: _openScanner,
                ),
                const SizedBox(height: 12),
                if (gate.resultOk != null)
                  _ResultBanner(ok: true, message: gate.resultOk!),
                if (gate.resultError != null)
                  _ResultBanner(ok: false, message: gate.resultError!),
                if (gate.resultOk != null || gate.resultError != null)
                  const SizedBox(height: 12),
                if (gate.found != null) ...[
                  _FoundCard(
                    rk: gate.found!,
                    busy: gate.actionBusy,
                    canGateCreate: auth.hasPermission('gate.create'),
                    canVerify: auth.hasPermission('rencana_kirim.edit'),
                    onIn: () => _confirmAction('IN'),
                    onOut: () => _confirmAction('OUT'),
                    onVerify: () => _confirmAction('VERIFY'),
                    onClear: gate.clearFound,
                  ),
                  const SizedBox(height: 12),
                ],
                _HistoryCard(
                  items: gate.history,
                  loading: gate.historyLoading,
                  error: gate.historyError,
                  total: gate.totalRows,
                  searchCtrl: _searchCtrl,
                  hasMore: gate.page < gate.lastPage,
                  onRetry: () =>
                      gate.loadHistory(reset: true, search: _debouncedSearch),
                  onMore: () => gate.nextPage(_debouncedSearch),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _DeniedCard extends StatelessWidget {
  const _DeniedCard({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFFFFFBEB),
        border: Border.all(color: const Color(0xFFFDE68A)),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Text(message, style: const TextStyle(color: Color(0xFF92400E))),
    );
  }
}

class _StatsRow extends StatelessWidget {
  const _StatsRow({required this.stats, required this.loading});

  final GateStats stats;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    final items = [
      (label: 'Hari ini', value: stats.hariIni, color: AppColors.gray900),
      (label: 'Terjadwal', value: stats.terjadwal, color: AppColors.primary600),
      (label: 'Selesai', value: stats.selesai, color: Color(0xFF059669)),
      (label: 'Total', value: stats.total, color: AppColors.gray600),
    ];
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.gray900,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(
                Icons.pin_drop_outlined,
                color: AppColors.primary300,
                size: 18,
              ),
              SizedBox(width: 8),
              Text(
                'Gate hari ini',
                style: TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              for (var i = 0; i < items.length; i++) ...[
                Expanded(
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Column(
                      children: [
                        Text(
                          loading ? '…' : '${items[i].value}',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 18,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          items[i].label,
                          style: const TextStyle(
                            color: AppColors.primary200,
                            fontSize: 11,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                if (i < items.length - 1) const SizedBox(width: 8),
              ],
            ],
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
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.gray200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Quick Scan',
            style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
          ),
          const SizedBox(height: 4),
          const Text(
            'Scan barcode atau ketik PO / Nopol, lalu Enter',
            style: TextStyle(color: AppColors.gray500, fontSize: 12.5),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: controller,
                  textInputAction: TextInputAction.search,
                  onSubmitted: (_) => onSearch(),
                  decoration: InputDecoration(
                    hintText: 'PO / Nopol...',
                    prefixIcon: const Icon(Icons.search, size: 20),
                    filled: true,
                    fillColor: AppColors.gray50,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(14),
                      borderSide: const BorderSide(color: AppColors.gray200),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(14),
                      borderSide: const BorderSide(color: AppColors.gray200),
                    ),
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 12,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              SizedBox(
                height: 48,
                child: FilledButton(
                  onPressed: busy ? null : onSearch,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.gray900,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
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
              ),
              const SizedBox(width: 8),
              SizedBox(
                height: 48,
                width: 48,
                child: OutlinedButton(
                  onPressed: onScanCamera,
                  style: OutlinedButton.styleFrom(
                    padding: EdgeInsets.zero,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                  child: const Icon(Icons.qr_code_scanner),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ResultBanner extends StatelessWidget {
  const _ResultBanner({required this.ok, required this.message});

  final bool ok;
  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: ok ? const Color(0xFFECFDF5) : AppColors.errorBg,
        border: Border.all(
          color: ok ? const Color(0xFFA7F3D0) : AppColors.errorBorder,
        ),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: [
          Icon(
            ok ? Icons.check_circle_outline : Icons.error_outline,
            color: ok ? const Color(0xFF059669) : AppColors.errorText,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(message, style: const TextStyle(fontSize: 13.5)),
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
    required this.onClear,
  });

  final RencanaKirimSummary rk;
  final bool busy;
  final bool canGateCreate;
  final bool canVerify;
  final VoidCallback onIn;
  final VoidCallback onOut;
  final VoidCallback onVerify;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [AppColors.gray900, AppColors.primary950],
        ),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
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
            value: '${rk.driverName} • ${gateStatusLabel(rk.status)}',
          ),
          const SizedBox(height: 12),
          if (rk.status == 'SCHEDULED' && canGateCreate)
            SizedBox(
              width: double.infinity,
              height: 48,
              child: FilledButton(
                onPressed: busy ? null : onIn,
                style: FilledButton.styleFrom(backgroundColor: Colors.white),
                child: const Text(
                  'Gate IN →',
                  style: TextStyle(color: AppColors.gray900),
                ),
              ),
            ),
          if (rk.status == 'CHECKED_IN' && canVerify)
            SizedBox(
              width: double.infinity,
              height: 48,
              child: FilledButton(
                onPressed: busy ? null : onVerify,
                style: FilledButton.styleFrom(
                  backgroundColor: const Color(0xFF10B981),
                ),
                child: const Text('Verify ✓'),
              ),
            ),
          if (rk.status == 'COMPLETED' && canGateCreate)
            SizedBox(
              width: double.infinity,
              height: 48,
              child: OutlinedButton(
                onPressed: busy ? null : onOut,
                style: OutlinedButton.styleFrom(
                  foregroundColor: Colors.white,
                  side: const BorderSide(color: Colors.white30),
                ),
                child: const Text('Gate OUT'),
              ),
            ),
          if (gateStatusGuide(rk.status) != null)
            Container(
              width: double.infinity,
              margin: const EdgeInsets.only(top: 8),
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                gateStatusGuide(rk.status)!,
                style: const TextStyle(color: Colors.white70, fontSize: 12.5),
              ),
            ),
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
          Flexible(
            child: Text(
              value.isEmpty ? '-' : value,
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
  });

  final List<GateTransactionItem> items;
  final bool loading;
  final String? error;
  final int total;
  final TextEditingController searchCtrl;
  final bool hasMore;
  final VoidCallback onRetry;
  final VoidCallback onMore;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.gray200),
      ),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Riwayat Gate ($total)',
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: searchCtrl,
                  decoration: InputDecoration(
                    hintText: 'Cari nopol / dokumen...',
                    prefixIcon: const Icon(Icons.search, size: 20),
                    filled: true,
                    fillColor: AppColors.gray50,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: AppColors.gray200),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: AppColors.gray200),
                    ),
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 10,
                    ),
                  ),
                ),
              ],
            ),
          ),
          if (error != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              child: _ResultBanner(ok: false, message: error!),
            ),
          if (loading && items.isEmpty)
            const Padding(
              padding: EdgeInsets.all(24),
              child: CircularProgressIndicator(),
            ),
          if (!loading && items.isEmpty && error == null)
            const Padding(
              padding: EdgeInsets.fromLTRB(16, 0, 16, 20),
              child: Text(
                'Belum ada transaksi gate. Gunakan Quick Scan di atas.',
                style: TextStyle(color: AppColors.gray500),
              ),
            ),
          ...items.map(
            (e) => Column(
              children: [
                ListTile(
                  leading: Container(
                    width: 42,
                    height: 42,
                    decoration: BoxDecoration(
                      color: e.gateType == 'INBOUND'
                          ? AppColors.primary50
                          : const Color(0xFFF5F3FF),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    alignment: Alignment.center,
                    child: Icon(
                      e.gateType == 'INBOUND' ? Icons.login : Icons.logout,
                      color: e.gateType == 'INBOUND'
                          ? AppColors.primary600
                          : AppColors.primary800,
                    ),
                  ),
                  title: Text(
                    e.poTransporter.isEmpty ? '-' : e.poTransporter,
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                  subtitle: Text(
                    '${e.nopol} • ${e.driverName}\n${_fmtTime(e.scanTime)}',
                  ),
                  isThreeLine: true,
                  trailing: _GateTypePill(type: e.gateType),
                ),
                const Divider(height: 1, indent: 16, endIndent: 16),
              ],
            ),
          ),
          if (hasMore)
            Padding(
              padding: const EdgeInsets.all(12),
              child: OutlinedButton(
                onPressed: loading ? null : onMore,
                child: Text(loading ? 'Memuat...' : 'Muat lebih banyak'),
              ),
            ),
          const SizedBox(height: 6),
        ],
      ),
    );
  }

  String _fmtTime(String v) {
    if (v.isEmpty || v == 'null') {
      return '-';
    }
    final parsed = DateTime.tryParse(v);
    if (parsed == null) {
      return v;
    }
    final local = parsed.toLocal();
    String two(int n) => n.toString().padLeft(2, '0');
    return '${two(local.day)}/${two(local.month)}/${local.year} ${two(local.hour)}:${two(local.minute)}';
  }
}

class _GateTypePill extends StatelessWidget {
  const _GateTypePill({required this.type});

  final String type;

  @override
  Widget build(BuildContext context) {
    final inbound = type == 'INBOUND';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: inbound ? AppColors.primary50 : const Color(0xFFF5F3FF),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(
          color: inbound ? AppColors.primary200 : AppColors.primary100,
        ),
      ),
      child: Text(
        type.isEmpty ? '-' : type,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w800,
          color: inbound ? AppColors.primary700 : AppColors.primary800,
        ),
      ),
    );
  }
}
