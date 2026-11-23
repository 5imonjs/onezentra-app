import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'package:onezentra_mobile/core/theme/app_theme.dart';
import 'package:onezentra_mobile/features/auth/providers/auth_provider.dart';
import 'package:onezentra_mobile/features/opname/models/opname_expired_models.dart';
import 'package:onezentra_mobile/features/opname/providers/opname_expired_provider.dart';
import 'package:onezentra_mobile/features/opname/repositories/opname_expired_repository.dart';
import 'package:onezentra_mobile/features/opname/ui/opname_ui.dart';
import 'package:onezentra_mobile/shared/widgets/app_widgets.dart';

/// Urutan level risiko: yang paling mendesak lebih dulu.
const List<String> _statusOrder = ['EXPIRED', 'KRITIS', 'PERHATIAN', 'AMAN'];

Color _statusColor(BuildContext context, String status) =>
    opToneForStatus(status).solid(context.colors);

String _formatQty(double? value) {
  if (value == null) {
    return '-';
  }
  return value == value.truncateToDouble()
      ? value.toInt().toString()
      : value.toString();
}

String _formatSisaHari(int? value) {
  if (value == null) {
    return '-';
  }
  if (value < 0) {
    return 'Lewat ${-value} hari';
  }
  if (value == 0) {
    return 'Hari ini';
  }
  return '$value hari';
}

String _formatDate(String? raw) {
  var date = raw == null ? null : DateTime.tryParse(raw);
  if (date == null) {
    return raw ?? '-';
  }
  return '${date.day.toString().padLeft(2, '0')}/'
      '${date.month.toString().padLeft(2, '0')}/${date.year}';
}

int _mixValue(Map<String, dynamic>? mix, String key) {
  var value = mix?[key];
  if (value is num) {
    return value.toInt();
  }
  return int.tryParse(value?.toString() ?? '') ?? 0;
}

String _sourceLabel(Map<String, dynamic>? mix) {
  var sj = _mixValue(mix, 'sj');
  var import = _mixValue(mix, 'import');
  var legacy = _mixValue(mix, 'legacy');
  var kinds = [sj > 0, import > 0, legacy > 0].where((value) => value).length;
  if (kinds > 1) {
    return 'Campuran';
  }
  if (legacy > 0) {
    return 'Data Awal';
  }
  if (import > 0) {
    return 'Stok Manual';
  }
  if (sj > 0) {
    return 'SJ (sistem)';
  }
  return '-';
}

/// Opname Expired — monitoring barang kadaluarsa dari backend.
///
/// Menampilkan daftar wave expired (produk + depo + tanggal expired + qty)
/// dengan status otomatis (Expired / Kritis / Perhatian / Aman) dan rekomendasi
/// operasional. Read-only: verifikasi & submit sesi opname tetap melalui
/// alur backend (opname-sessions) yang sudah berjalan.
class OpnameExpiredPage extends StatefulWidget {
  const OpnameExpiredPage({super.key, this.repository});

  final OpnameExpiredRepository? repository;

  @override
  State<OpnameExpiredPage> createState() => _OpnameExpiredPageState();
}

class _OpnameExpiredPageState extends State<OpnameExpiredPage> {
  late final OpnameExpiredProvider _provider = OpnameExpiredProvider(
    repository: widget.repository,
  );

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
          context.read<AuthProvider>().user?.hasPermission('opname.view') ??
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
      ChangeNotifierProvider<OpnameExpiredProvider>.value(
        value: _provider,
        child: Builder(builder: _buildPage),
      );

  Widget _buildPage(BuildContext context) {
    var canView =
        context.watch<AuthProvider>().user?.hasPermission('opname.view') ??
        false;
    var provider = context.watch<OpnameExpiredProvider>();

    var content = !canView
        ? _buildNoAccess()
        : RefreshIndicator(
            onRefresh: provider.load,
            color: AppTheme.primary600,
            child: SingleChildScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(
                AppTheme.space4,
                AppTheme.space3,
                AppTheme.space4,
                AppTheme.space8,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _buildSummary(provider, context),
                  const SizedBox(height: AppTheme.space4),
                  if (provider.error != null)
                    AppErrorDisplay(
                      message: provider.error!,
                      onRetry: provider.load,
                      retryText: 'Coba Lagi',
                    )
                  else if (provider.isLoading && provider.waves.isEmpty)
                    const _OpnameExpiredLoading()
                  else if (provider.waves.isEmpty)
                    provider.status == null
                        ? const AppEmptyState(
                            icon: Icons.hourglass_empty_rounded,
                            title: 'Belum ada data expired',
                            subtitle:
                                'Generate wave mingguan di web, lalu batch mendekati/melewati expired tampil di sini.',
                          )
                        : AppEmptyState(
                            icon: Icons.filter_alt_off_rounded,
                            title:
                                'Tidak ada batch ${OpnameStatus.label(provider.status)}',
                            subtitle:
                                'Ganti filter status atau muat ulang data minggu ini.',
                            action: TextButton(
                              onPressed: () => provider.setStatus(null),
                              child: const Text('Tampilkan semua'),
                            ),
                          )
                  else
                    ..._buildWaveGroups(provider.waves, context),
                ],
              ),
            ),
          );

    return Scaffold(
      backgroundColor: context.colors.background,
      appBar: AppBar(
        title: const Text('Opname Expired'),
        actions: [
          IconButton(
            onPressed: () => provider.load(),
            tooltip: 'Muat ulang',
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: SafeArea(child: content),
    );
  }

  Widget _buildSummary(OpnameExpiredProvider provider, BuildContext context) {
    var theme = Theme.of(context);
    var summary = provider.meta?.statusSummary;
    var total = summary?.totalCount ?? 0;
    var risk = summary?.riskCount ?? 0;
    var weekLabel = provider.weekStart == null
        ? null
        : 'Minggu ${_formatDate(provider.weekStart)}';

    return AppCard(
      padding: const EdgeInsets.all(AppTheme.space4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: context.colors.primaryWell,
                  borderRadius: AppTheme.radiusLg,
                ),
                child: Icon(
                  Icons.monitor_heart_rounded,
                  size: 22,
                  color: context.colors.primaryWellText,
                ),
              ),
              const SizedBox(width: AppTheme.space3),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Ringkasan Opname Expired',
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontSize: 15.5,
                        fontWeight: FontWeight.w700,
                        color: context.colors.foreground,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      '$total batch · $risk berisiko'
                      '${weekLabel == null ? '' : ' · $weekLabel'}',
                      style: OpType.secondary(
                        context,
                      ).copyWith(color: context.colors.textMuted),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: AppTheme.space4),
          LayoutBuilder(
            builder: (context, constraints) {
              var tileWidth = (constraints.maxWidth - AppTheme.space2) / 2;
              return Wrap(
                spacing: AppTheme.space2,
                runSpacing: AppTheme.space2,
                children: [
                  for (var status in _statusOrder)
                    SizedBox(
                      width: tileWidth,
                      child: OpStat(
                        label: OpnameStatus.label(status),
                        value: '${summary?.countOf(status)?.count ?? 0}',
                        tone: opToneForStatus(status),
                        caption:
                            '${_formatQty(summary?.countOf(status)?.qtyCrt ?? 0)} CRT',
                      ),
                    ),
                ],
              );
            },
          ),
          if (summary != null && summary.totalCount > 0) ...[
            const SizedBox(height: AppTheme.space4),
            Divider(height: 1, color: context.colors.border),
            const SizedBox(height: AppTheme.space3),
            const OpSectionLabel('Filter status'),
            const SizedBox(height: AppTheme.space2),
            Wrap(
              spacing: AppTheme.space2,
              runSpacing: AppTheme.space2,
              children: [
                _buildStatusFilterChip(
                  context,
                  label: 'Semua',
                  status: null,
                  count: summary.totalCount,
                  selected: provider.status == null,
                  onTap: () {
                    provider.setStatus(null);
                  },
                ),
                for (var status in _statusOrder)
                  _buildStatusFilterChip(
                    context,
                    label: OpnameStatus.label(status),
                    status: status,
                    count: summary.countOf(status)?.count ?? 0,
                    selected: provider.status == status,
                    onTap: () {
                      provider.setStatus(status);
                    },
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildStatusFilterChip(
    BuildContext context, {
    required String label,
    required String? status,
    required int count,
    required bool selected,
    required VoidCallback onTap,
  }) {
    var c = context.colors;
    var tone = status == null ? OpTone.primary : opToneForStatus(status);
    var solid = tone.solid(c);
    return InkWell(
      key: ValueKey('opname-status-filter-${status ?? 'ALL'}'),
      onTap: onTap,
      borderRadius: AppTheme.radiusFull,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: selected ? solid.withValues(alpha: 0.14) : c.surfaceHover,
          borderRadius: AppTheme.radiusFull,
          border: Border.all(
            color: selected ? solid.withValues(alpha: 0.55) : c.border,
            width: selected ? 1.5 : 1,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (status != null) ...[
              Container(
                width: 7,
                height: 7,
                decoration: BoxDecoration(color: solid, shape: BoxShape.circle),
              ),
              const SizedBox(width: 6),
            ],
            Text(
              label,
              style: OpType.secondary(context).copyWith(
                fontSize: 12.5,
                fontWeight: FontWeight.w700,
                color: selected ? c.foreground : c.textSecondary,
              ),
            ),
            const SizedBox(width: 6),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
              decoration: BoxDecoration(
                color: selected
                    ? solid.withValues(alpha: 0.2)
                    : c.foreground.withValues(alpha: 0.06),
                borderRadius: AppTheme.radiusFull,
              ),
              child: Text(
                '$count',
                style: OpType.muted(context).copyWith(
                  fontSize: 11.5,
                  fontWeight: FontWeight.w800,
                  color: selected ? c.foreground : c.textMuted,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Mengelompokkan wave expired per cluster (BOSnet) secara otomatis.
  List<Widget> _buildWaveGroups(
    List<OpnameExpiredWave> waves,
    BuildContext context,
  ) {
    var groups = <String, List<OpnameExpiredWave>>{};
    for (var wave in waves) {
      groups
          .putIfAbsent(wave.clusterLabel, () => <OpnameExpiredWave>[])
          .add(wave);
    }

    var widgets = <Widget>[];
    for (var entry in groups.entries) {
      widgets.add(_buildClusterHeader(context, entry.key, entry.value.length));
      widgets.add(const SizedBox(height: AppTheme.space3));
      for (var wave in entry.value) {
        widgets.add(_OpnameExpiredWaveCard(wave: wave));
        widgets.add(const SizedBox(height: AppTheme.space3));
      }
      widgets.add(const SizedBox(height: AppTheme.space2));
    }
    return widgets;
  }

  Widget _buildClusterHeader(BuildContext context, String cluster, int count) {
    var theme = Theme.of(context);
    return Row(
      children: [
        Container(
          width: 4,
          height: 18,
          decoration: BoxDecoration(
            color: context.colors.primaryWell,
            borderRadius: BorderRadius.circular(2),
          ),
        ),
        const SizedBox(width: AppTheme.space2),
        Expanded(
          child: Text(
            cluster,
            style: theme.textTheme.titleSmall?.copyWith(
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: context.colors.foreground,
            ),
          ),
        ),
        Text(
          '$count batch',
          style: OpType.muted(context).copyWith(fontWeight: FontWeight.w600),
        ),
      ],
    );
  }

  Widget _buildNoAccess() => SingleChildScrollView(
    padding: const EdgeInsets.all(AppTheme.space5),
    child: Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AppTheme.space5),
      decoration: BoxDecoration(
        color: context.colors.warningWell,
        borderRadius: AppTheme.radiusXl,
        border: Border.all(color: context.colors.warning),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.lock_rounded, size: 22, color: context.colors.warningText),
          const SizedBox(width: AppTheme.space3),
          Expanded(
            child: Text(
              'Anda tidak memiliki izin untuk melihat Opname Expired.',
              style: OpType.body(
                context,
              ).copyWith(color: context.colors.warningText),
            ),
          ),
        ],
      ),
    ),
  );
}

class _OpnameExpiredLoading extends StatelessWidget {
  const _OpnameExpiredLoading();

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
        Text('Memuat Opname Expired...', style: OpType.secondary(context)),
      ],
    ),
  );
}

class _OpnameExpiredWaveCard extends StatelessWidget {
  const _OpnameExpiredWaveCard({required this.wave});

  final OpnameExpiredWave wave;

  @override
  Widget build(BuildContext context) {
    var c = context.colors;
    var tone = opToneForStatus(wave.statusIni);
    return AppCard(
      padding: const EdgeInsets.all(AppTheme.space4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              OpBadge(
                text: OpnameStatus.label(wave.statusIni),
                tone: tone,
                icon: opIconForStatus(wave.statusIni),
              ),
              const SizedBox(width: AppTheme.space2),
              Expanded(
                child: Text(
                  wave.rekomendasi ?? '-',
                  style: OpType.secondary(context),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppTheme.space3),
          Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: tone.solid(c).withValues(alpha: 0.12),
                  borderRadius: AppTheme.radiusLg,
                ),
                child: Icon(
                  Icons.inventory_2_rounded,
                  size: 20,
                  color: tone.solid(c),
                ),
              ),
              const SizedBox(width: AppTheme.space3),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      wave.namaBarang ?? wave.kodeBarang ?? '-',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: OpType.title(context),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      wave.kodeBarang ?? '-',
                      style: OpType.code(context).copyWith(
                        color: c.textMuted,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: AppTheme.space3),
          Divider(height: 1, color: c.border),
          const SizedBox(height: AppTheme.space2),
          ..._metaRows(context),
        ],
      ),
    );
  }

  List<Widget> _metaRows(BuildContext context) {
    var c = context.colors;
    var rows = <(String, String, Color?)>[
      ('Depo', wave.namaDepo ?? wave.kodeDepo ?? '-', null),
      ('Sumber', _sourceLabel(wave.sourceMix), null),
      ('Tanggal expired', _formatDate(wave.expiredDateIni), null),
      (
        'Sisa hari',
        _formatSisaHari(wave.sisaHari),
        _statusColor(context, wave.statusIni),
      ),
      ('Tanggal penerimaan', _formatDate(wave.tanggalPenerimaan), null),
      (
        'Qty (CRT/PCS)',
        'CRT ${_formatQty(wave.effectiveCrt)} / PCS ${_formatQty(wave.effectivePcs)}',
        null,
      ),
    ];
    if ((wave.qtyKoreksiCrt ?? 0) != 0 || (wave.qtyKoreksiPcs ?? 0) != 0) {
      rows.add((
        'Koreksi',
        'CRT ${_formatQty(wave.qtyKoreksiCrt)} / PCS ${_formatQty(wave.qtyKoreksiPcs)}',
        c.info,
      ));
    }
    return [
      for (final row in rows)
        Padding(
          padding: const EdgeInsets.only(bottom: AppTheme.space2),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  row.$1,
                  style: OpType.secondary(
                    context,
                  ).copyWith(color: c.textMuted, fontWeight: FontWeight.w500),
                ),
              ),
              const SizedBox(width: AppTheme.space3),
              Flexible(
                child: Text(
                  row.$2,
                  textAlign: TextAlign.end,
                  style: OpType.body(context).copyWith(
                    color: row.$3 ?? c.foreground,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
        ),
    ];
  }
}
