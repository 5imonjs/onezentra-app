import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

import 'package:onezentra_mobile/core/theme/app_theme.dart';
import 'package:onezentra_mobile/features/auth/providers/auth_provider.dart';
import 'package:onezentra_mobile/features/opname/models/opname_expired_models.dart';
import 'package:onezentra_mobile/features/opname/providers/opname_expired_provider.dart';
import 'package:onezentra_mobile/features/opname/repositories/opname_expired_repository.dart';
import 'package:onezentra_mobile/shared/widgets/app_widgets.dart';

/// Opname Expired — monitoring barang kadaluarsa dari backend.
///
/// Menampilkan daftar wave expired (produk + depo + tanggal expired + qty)
/// dengan status otomatis (Aman / Perhatian / Kritis) dan rekomendasi
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
              padding: const EdgeInsets.all(AppTheme.space4),
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
                    const AppEmptyState(
                      icon: Icons.hourglass_empty_rounded,
                      title: 'Belum ada data expired',
                      subtitle:
                          'Barang kadaluarsa akan muncul di sini setelah diterima.',
                    )
                  else
                    ..._buildWaveGroups(provider, context),
                  const SizedBox(height: AppTheme.space8),
                ],
              ),
            ),
          );

    return Scaffold(
      backgroundColor: context.colors.background,
      appBar: AppBar(
        title: const Text('Opname Expired'),
        elevation: 0,
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

    return AppCard(
      padding: const EdgeInsets.all(AppTheme.space4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Status barang expired',
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: context.colors.foreground,
                  ),
                ),
              ),
              if (provider.weekStart != null) ...[
                const SizedBox(width: AppTheme.space2),
                Text(
                  provider.weekStart!,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: context.colors.textMuted,
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: AppTheme.space3),
          Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (var status in const ['AMAN', 'PERHATIAN', 'KRITIS'])
                AppStatTile(
                  label: OpnameStatus.label(status),
                  value: summary?.countOf(status)?.count ?? 0,
                  dotColor: _statusDotColor(context, status),
                ),
              const SizedBox(height: AppTheme.space3),
            ],
          ),
        ],
      ),
    );
  }

  Color _statusDotColor(BuildContext context, String status) =>
      switch (status) {
        'AMAN' => context.colors.success,
        'PERHATIAN' => context.colors.warning,
        'KRITIS' => context.colors.danger,
        _ => context.colors.gray400,
      };

  /// Mengelompokkan wave expired per cluster (BOSnet) secara otomatis.
  List<Widget> _buildWaveGroups(
    OpnameExpiredProvider provider,
    BuildContext context,
  ) {
    var groups = <String, List<OpnameExpiredWave>>{};
    for (var wave in provider.waves) {
      groups
          .putIfAbsent(wave.clusterLabel, () => <OpnameExpiredWave>[])
          .add(wave);
    }

    var widgets = <Widget>[];
    for (var entry in groups.entries) {
      widgets.add(_buildClusterHeader(context, entry.key));
      widgets.add(const SizedBox(height: AppTheme.space2));
      for (var wave in entry.value) {
        widgets.add(_OpnameExpiredWaveCard(wave: wave));
      }
      widgets.add(const SizedBox(height: AppTheme.space4));
    }
    return widgets;
  }

  Widget _buildClusterHeader(BuildContext context, String cluster) {
    var theme = Theme.of(context);
    return Row(
      children: [
        Container(
          width: 3,
          height: 16,
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
              fontWeight: FontWeight.w700,
              color: context.colors.foreground,
            ),
          ),
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
        border: Border.all(color: context.colors.warningText),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.lock_rounded, size: 20, color: context.colors.warningText),
          const SizedBox(width: AppTheme.space3),
          Expanded(
            child: Text(
              'Anda tidak memiliki izin untuk melihat Opname Expired.',
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
        Text(
          'Memuat data expired...',
          style: Theme.of(
            context,
          ).textTheme.bodyMedium?.copyWith(color: context.colors.textMuted),
        ),
      ],
    ),
  );
}

class _OpnameExpiredWaveCard extends StatelessWidget {
  const _OpnameExpiredWaveCard({required this.wave});

  final OpnameExpiredWave wave;

  static AppBadgeVariant _variant(String status) => switch (status) {
    'AMAN' => AppBadgeVariant.success,
    'PERHATIAN' => AppBadgeVariant.warning,
    'KRITIS' => AppBadgeVariant.danger,
    _ => AppBadgeVariant.gray,
  };

  @override
  Widget build(BuildContext context) => AppCard(
    padding: const EdgeInsets.all(AppTheme.space4),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            AppBadge(
              text: OpnameStatus.label(wave.statusIni),
              variant: _variant(wave.statusIni),
            ),
            const SizedBox(width: AppTheme.space2),
            Expanded(
              child: Text(
                wave.rekomendasi ?? '-',
                style: GoogleFonts.roboto(
                  fontSize: 11,
                  height: 1.4,
                  color: context.colors.textSecondary,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: AppTheme.space3),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: context.colors.gray100,
                borderRadius: AppTheme.radiusLg,
              ),
              child: Icon(
                Icons.inventory_2_rounded,
                size: 18,
                color: context.colors.textMuted,
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
                    style: GoogleFonts.roboto(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: context.colors.foreground,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    wave.kodeBarang ?? '-',
                    style: GoogleFonts.roboto(
                      fontSize: 11,
                      color: context.colors.textMuted,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: AppTheme.space3),
        ..._metaRows(context),
      ],
    ),
  );

  List<Widget> _metaRows(BuildContext context) => [
    _waveMetaRow(context, 'Tanggal expired', _formatDate(wave.expiredDateIni)),
    _waveMetaRow(context, 'Sisa hari', _formatInt(wave.sisaHari)),
    _waveMetaRow(
      context,
      'Tanggal penerimaan',
      _formatDate(wave.tanggalPenerimaan),
    ),
    _waveMetaRow(
      context,
      'Qty (CRT/PCS)',
      'CRT ${_formatQty(wave.effectiveCrt)} / PCS ${_formatQty(wave.effectivePcs)}',
    ),
  ];

  Widget _waveMetaRow(BuildContext context, String label, String value) =>
      Padding(
        padding: const EdgeInsets.only(bottom: AppTheme.space2),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Text(
                label,
                style: GoogleFonts.roboto(
                  fontSize: 10.5,
                  color: context.colors.textMuted,
                ),
              ),
            ),
            const SizedBox(width: AppTheme.space2),
            Flexible(
              child: Text(
                value,
                textAlign: TextAlign.end,
                style: GoogleFonts.robotoMono(
                  fontSize: 10.5,
                  color: context.colors.foreground,
                ),
              ),
            ),
          ],
        ),
      );

  static String _formatQty(double? value) {
    if (value == null) {
      return '-';
    }
    return value == value.truncateToDouble()
        ? value.toInt().toString()
        : value.toString();
  }

  static String _formatInt(int? value) => value?.toString() ?? '-';

  static String _formatDate(String? raw) {
    var date = raw == null ? null : DateTime.tryParse(raw);
    if (date == null) {
      return raw ?? '-';
    }
    return '${date.day.toString().padLeft(2, '0')}/'
        '${date.month.toString().padLeft(2, '0')}/${date.year}';
  }
}
