import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

import 'package:onezentra_mobile/core/theme/app_theme.dart';
import 'package:onezentra_mobile/features/auth/providers/auth_provider.dart';
import 'package:onezentra_mobile/features/gate/models/gate_models.dart';
import 'package:onezentra_mobile/features/gate/providers/gate_provider.dart';
import 'package:onezentra_mobile/features/gate/repositories/gate_repository.dart';
import 'package:onezentra_mobile/shared/widgets/app_widgets.dart';

/// Riwayat Gate — daftar transaksi gate yang bisa berdiri sendiri atau
/// ditanam sebagai tab di halaman Riwayat terpadu.
///
/// Kolom pencarian dan daftar transaksi tetap di kartu terpisah agar tata
/// letak lega: kartu "Pencarian" di atas, kartu "Transaksi" di bawah.
class GateHistoryPage extends StatefulWidget {
  const GateHistoryPage({super.key, this.repository, this.embedded = false});

  /// Injectable so tests can run the screen against a fake repository.
  final GateRepository? repository;

  /// When true the page returns only its body, without its own AppBar, so it
  /// can live inside the unified Riwayat tabs.
  final bool embedded;

  @override
  State<GateHistoryPage> createState() => _GateHistoryPageState();
}

class _GateHistoryPageState extends State<GateHistoryPage> {
  late final GateProvider _provider = GateProvider(
    repository: widget.repository,
  );
  final _searchController = TextEditingController();

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
          context.read<AuthProvider>().user?.hasPermission('gate.view') ??
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

  @override
  Widget build(BuildContext context) =>
      ChangeNotifierProvider<GateProvider>.value(
        value: _provider,
        child: Builder(builder: _buildPage),
      );

  Widget _buildPage(BuildContext context) {
    var user = context.watch<AuthProvider>().user;
    var canView = user?.hasPermission('gate.view') ?? false;
    var gate = context.watch<GateProvider>();

    Widget content = !canView
        ? _buildNoAccess()
        : RefreshIndicator(
            onRefresh: gate.refresh,
            color: AppTheme.primary600,
            child: SingleChildScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(AppTheme.space4),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _buildSearchCard(gate),
                  const SizedBox(height: AppTheme.space4),
                  _buildListCard(gate),
                  const SizedBox(height: AppTheme.space8),
                ],
              ),
            ),
          );

    if (widget.embedded) {
      return content;
    }

    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        title: const Text('Riwayat Gate'),
        elevation: 0,
        actions: [
          IconButton(
            onPressed: canView && !gate.isLoading ? () => gate.refresh() : null,
            tooltip: 'Muat ulang',
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: SafeArea(child: content),
    );
  }

  Widget _buildNoAccess() => SingleChildScrollView(
    padding: const EdgeInsets.all(AppTheme.space5),
    child: Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AppTheme.space5),
      decoration: BoxDecoration(
        color: AppTheme.warningWell,
        borderRadius: AppTheme.radiusXl,
        border: Border.all(color: AppTheme.warningText),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.lock_rounded, size: 20, color: AppTheme.warningText),
          const SizedBox(width: AppTheme.space3),
          Expanded(
            child: Text(
              'Anda tidak memiliki izin untuk melihat Riwayat Gate.',
              style: GoogleFonts.roboto(
                fontSize: 13,
                height: 1.4,
                color: AppTheme.warningText,
              ),
            ),
          ),
        ],
      ),
    ),
  );

  /// Kartu pencarian — terpisah dari kartu daftar.
  Widget _buildSearchCard(GateProvider gate) => AppCard(
    padding: const EdgeInsets.all(AppTheme.space5),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            _iconBox(
              36,
              AppTheme.primary50,
              Icons.search_rounded,
              iconColor: AppTheme.primary600,
            ),
            const SizedBox(width: AppTheme.space3),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Pencarian',
                    style: GoogleFonts.roboto(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: AppTheme.foreground,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'Nopol / PO / nama driver',
                    style: GoogleFonts.roboto(
                      fontSize: 11,
                      color: Theme.of(context).extension<ThemeColors>()?.textMuted ?? AppTheme.gray400,
                    ),
                  ),
                ],
              ),
            ),
            if (gate.search.isNotEmpty)
              TextButton(
                onPressed: () {
                  _searchController.clear();
                  gate.setSearch('');
                },
                child: const Text('Bersihkan'),
              ),
          ],
        ),
        const SizedBox(height: AppTheme.space4),
        AppTextField(
          controller: _searchController,
          hint: 'Cari nopol / PO / driver...',
          prefixIcon: Icons.search_rounded,
          onChanged: gate.setSearch,
        ),
      ],
    ),
  );

  /// Kartu daftar transaksi + paginasi.
  Widget _buildListCard(GateProvider gate) => AppCard(
    padding: const EdgeInsets.all(AppTheme.space5),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            _iconBox(
              36,
              AppTheme.primary50,
              Icons.history_rounded,
              iconColor: AppTheme.primary600,
            ),
            const SizedBox(width: AppTheme.space3),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Transaksi',
                    style: GoogleFonts.roboto(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: AppTheme.foreground,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '${gate.total} transaksi tercatat',
                    style: GoogleFonts.roboto(
                      fontSize: 11,
                      color: Theme.of(context).extension<ThemeColors>()?.textMuted ?? AppTheme.gray400,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: AppTheme.space4),
        ..._historyBody(gate),
      ],
    ),
  );

  List<Widget> _historyBody(GateProvider gate) {
    var listError = gate.listError;
    if (listError != null) {
      return [
        SizedBox(
          width: double.infinity,
          child: AppErrorDisplay(message: listError, onRetry: gate.loadItems),
        ),
      ];
    }

    if (gate.isLoading && gate.items.isEmpty) {
      return [
        Column(
          children: List.generate(
            3,
            (_) => Container(
              height: 64,
              margin: const EdgeInsets.only(bottom: AppTheme.space3),
              decoration: const BoxDecoration(
                color: AppTheme.gray100,
                borderRadius: AppTheme.radiusLg,
              ),
            ),
          ),
        ),
      ];
    }

    if (gate.items.isEmpty) {
      return [
        SizedBox(
          width: double.infinity,
          child: AppEmptyState(
            icon: Icons.door_front_door_rounded,
            title: gate.search.isNotEmpty
                ? 'Tidak ada hasil'
                : 'Belum ada transaksi gate',
            subtitle: gate.search.isNotEmpty
                ? 'Cari dengan kata kunci lain.'
                : 'Transaksi muncul setelah Gate IN pertama tercatat.',
          ),
        ),
      ];
    }

    var items = gate.items;
    return [
      Column(
        children: [
          for (var i = 0; i < items.length; i++) ...[
            _historyTile(items[i]),
            if (i != items.length - 1)
              const Divider(height: 1, color: AppTheme.gray100, indent: 46),
          ],
        ],
      ),
      if (gate.lastPage > 1)
        Padding(
          padding: const EdgeInsets.only(top: AppTheme.space4),
          child: Column(
            children: [
              const Divider(height: 1, color: AppTheme.gray100),
              const SizedBox(height: AppTheme.space3),
              Row(
                children: [
                  Expanded(
                    child: AppSecondaryButton(
                      text: 'Sebelumnya',
                      height: 42,
                      isLoading: gate.isLoading,
                      onPressed: gate.canGoBack && !gate.isLoading
                          ? () => gate.goToPage(gate.currentPage - 1)
                          : null,
                    ),
                  ),
                  const SizedBox(width: AppTheme.space2),
                  Text(
                    'Halaman ${gate.currentPage}/${gate.lastPage}',
                    style: GoogleFonts.roboto(
                      fontSize: 11.5,
                      color: Theme.of(context).extension<ThemeColors>()?.textMuted ?? AppTheme.gray500,
                    ),
                  ),
                  const SizedBox(width: AppTheme.space2),
                  Expanded(
                    child: AppSecondaryButton(
                      text: 'Selanjutnya',
                      height: 42,
                      isLoading: gate.isLoading,
                      onPressed: gate.canGoForward && !gate.isLoading
                          ? () => gate.goToPage(gate.currentPage + 1)
                          : null,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
    ];
  }

  Widget _historyTile(GateTransaction item) {
    var rk = item.rencanaKirim;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppTheme.space3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _iconBox(
            36,
            AppTheme.gray100,
            Icons.local_shipping_rounded,
            iconColor: AppTheme.gray500,
          ),
          const SizedBox(width: AppTheme.space3),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        item.poTransporter ?? rk?.poTransporter ?? '-',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.robotoMono(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: AppTheme.foreground,
                        ),
                      ),
                    ),
                    const SizedBox(width: AppTheme.space2),
                    AppBadge(text: item.gateType),
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  '${item.nopol ?? '-'} • ${item.driverName ?? '-'}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.roboto(
                    fontSize: 11,
                    color: Theme.of(context).extension<ThemeColors>()?.textMuted ?? AppTheme.gray500,
                  ),
                ),
                const SizedBox(height: 6),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        _formatDateTime(item.scanTime),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.robotoMono(
                          fontSize: 11,
                          color: Theme.of(context).extension<ThemeColors>()?.textMuted ?? AppTheme.gray400,
                        ),
                      ),
                    ),
                    const SizedBox(width: AppTheme.space2),
                    AppBadge(
                      text: GateStatus.label(item.documentStatus),
                      variant: _statusVariant(item.documentStatus),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _iconBox(
    double size,
    Color background,
    IconData icon, {
    Color iconColor = Colors.white,
  }) => Container(
    width: size,
    height: size,
    decoration: BoxDecoration(
      color: background,
      borderRadius: AppTheme.radiusLg,
    ),
    child: Icon(icon, size: size * 0.5, color: iconColor),
  );

  static String _formatDateTime(DateTime? time) {
    if (time == null) {
      return '—';
    }
    String two(int value) => value.toString().padLeft(2, '0');
    return '${two(time.day)}/${two(time.month)}/${time.year} '
        '${two(time.hour)}:${two(time.minute)}:${two(time.second)}';
  }

  static AppBadgeVariant _statusVariant(String status) => switch (status) {
    'SCHEDULED' => AppBadgeVariant.info,
    'CHECKED_IN' => AppBadgeVariant.primary,
    'VERIFIED' => AppBadgeVariant.success,
    'IN_PROGRESS' => AppBadgeVariant.warning,
    'COMPLETED' => AppBadgeVariant.success,
    'CANCELLED' => AppBadgeVariant.danger,
    _ => AppBadgeVariant.gray,
  };
}
