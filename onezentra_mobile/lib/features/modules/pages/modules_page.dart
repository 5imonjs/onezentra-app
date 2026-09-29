import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import 'package:onezentra_mobile/core/theme/app_theme.dart';
import 'package:onezentra_mobile/features/auth/providers/auth_provider.dart';
import 'package:onezentra_mobile/shared/widgets/app_widgets.dart';

/// Modules Page - Grid of all available modules
class ModulesPage extends StatelessWidget {
  const ModulesPage({super.key});

  @override
  Widget build(BuildContext context) {
    var theme = Theme.of(context);

    var modules = [
      _Module('Check In Point', 'Pemeriksaan masuk/keluar', Icons.door_front_door_rounded, AppTheme.primary700, ['gate.view'], route: '/gate'),
      _Module('Penerimaan', 'Terima & kelola barang masuk', Icons.inventory_2_rounded, AppTheme.primary600, ['penerimaan.view']),
      _Module('Rencana Kirim', 'Jadwalkan & kelola pengiriman', Icons.schedule_rounded, AppTheme.accent500, ['rencana_kirim.view']),
      _Module('Validasi SJ', 'Validasi Surat Jalan', Icons.verified_rounded, AppTheme.success, ['sj_validation.view']),
      _Module('Opname Expired', 'Opname barang expired', Icons.fact_check_rounded, AppTheme.warning, ['opname.view']),
      _Module('Biaya THL', 'Pengajuan biaya THL', Icons.receipt_long_rounded, AppTheme.info, ['biaya_thl.view']),
      _Module('Biaya Retribusi', 'Pengajuan biaya retribusi', Icons.money_rounded, AppTheme.danger, ['biaya_retribusi.view']),
      _Module('Approval', 'Kelola approval workflow', Icons.approval_rounded, AppTheme.primary800, ['approval.view']),
      _Module('NPN', 'Kelola Nomor Polisi Nasional', Icons.settings_rounded, AppTheme.gray600, ['npn.view']),
      _Module('Standar Umur', 'Standar umur produk', Icons.calendar_today_rounded, AppTheme.gray700, ['standar_umur.view']),
      _Module('Standarisasi', 'Standarisasi tumpukan', Icons.layers_rounded, AppTheme.gray800, ['standarisasi.view']),
      _Module('Dock Management', 'Kelola dok & jadwal', Icons.dock_rounded, AppTheme.gray900, ['receiving.view']),
    ];

    // Same rule as the web sidebar: a module whose permission the role lacks
    // is never rendered.
    var user = context.watch<AuthProvider>().user;
    var visibleModules = modules
        .where(
          (module) =>
              module.permissions.isEmpty ||
              (user?.hasAnyPermission(module.permissions) ?? false),
        )
        .toList();

    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        title: const Text('Semua Modul'),
        elevation: 0,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(AppTheme.space6),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Pilih modul untuk memulai',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: AppTheme.gray500,
              ),
            ),
            const SizedBox(height: AppTheme.space6),
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                crossAxisSpacing: AppTheme.space4,
                mainAxisSpacing: AppTheme.space4,
                childAspectRatio: 1.1,
              ),
              itemCount: visibleModules.length,
              itemBuilder: (context, index) => _buildModuleCard(context, theme, visibleModules[index]),
            ),
            const SizedBox(height: AppTheme.space8),
          ],
        ),
      ),
    );
  }

  Widget _buildModuleCard(BuildContext context, ThemeData theme, _Module module) => AppCard(
      padding: const EdgeInsets.all(AppTheme.space5),
      onTap: () {
        var route = module.route;
        if (route != null) {
          context.go(route);
          return;
        }
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('${module.title} - Coming soon')),
        );
      },
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: module.color.withValues(alpha: 0.15),
              borderRadius: AppTheme.radiusLg,
            ),
            child: Icon(
              module.icon,
              size: 24,
              color: module.color,
            ),
          ),
          const SizedBox(height: AppTheme.space4),
          Text(
            module.title,
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w600,
              color: AppTheme.foreground,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 4),
          Text(
            module.description,
            style: theme.textTheme.bodySmall?.copyWith(
              color: AppTheme.gray500,
            ),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
          const Spacer(),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppTheme.space3,
                  vertical: AppTheme.space1,
                ),
                decoration: BoxDecoration(
                  color: module.color.withValues(alpha: 0.1),
                  borderRadius: AppTheme.radiusFull,
                ),
                child: Text(
                  'Buka',
                  style: theme.textTheme.labelSmall?.copyWith(
                    fontWeight: FontWeight.w600,
                    color: module.color,
                    fontSize: 11,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
}

class _Module {

  _Module(
    this.title,
    this.description,
    this.icon,
    this.color,
    this.permissions, {
    this.route,
  });
  final String title;
  final String description;
  final IconData icon;
  final Color color;
  final List<String> permissions;

  /// When set, tapping the card navigates to this route instead of showing
  /// a "Coming soon" snackbar.
  final String? route;
}