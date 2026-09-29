import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import 'package:onezentra_mobile/core/theme/app_theme.dart';
import 'package:onezentra_mobile/shared/widgets/app_widgets.dart';
import 'package:onezentra_mobile/features/auth/providers/auth_provider.dart';

/// Dashboard Page - Main landing after login
class DashboardPage extends StatefulWidget {
  const DashboardPage({super.key});

  @override
  State<DashboardPage> createState() => _DashboardPageState();
}

class _DashboardPageState extends State<DashboardPage> with TickerProviderStateMixin {
  late AnimationController _animationController;
  late Animation<double> _fadeAnimation;
  late Animation<Offset> _slideAnimation;

  @override
  void initState() {
    super.initState();
    _animationController = AnimationController(
      duration: const Duration(milliseconds: 600),
      vsync: this,
    );
    _fadeAnimation = Tween<double>(begin: 0, end: 1).animate(
      CurvedAnimation(parent: _animationController, curve: Curves.easeOut),
    );
    _slideAnimation = Tween<Offset>(begin: const Offset(0, 0.2), end: Offset.zero).animate(
      CurvedAnimation(parent: _animationController, curve: Curves.easeOutCubic),
    );
    _animationController.forward();
  }

  @override
  void dispose() {
    _animationController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    var theme = Theme.of(context);
    var authProvider = context.watch<AuthProvider>();
    var user = authProvider.user;

    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        title: const Text('Dashboard'),
        elevation: 0,
        actions: [
          IconButton(
            icon: const Icon(Icons.notifications_outlined),
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Notifikasi - Coming soon')),
              );
            },
          ),
          IconButton(
            icon: const Icon(Icons.person_outline),
            onPressed: () {
              Navigator.of(context).pushNamed('/profile');
            },
          ),
        ],
      ),
      body: FadeTransition(
        opacity: _fadeAnimation,
        child: SlideTransition(
          position: _slideAnimation,
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(AppTheme.space6),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildWelcomeSection(theme, user),
                const SizedBox(height: AppTheme.space8),
                _buildStatsCards(theme),
                const SizedBox(height: AppTheme.space8),
                _buildQuickActions(theme),
                const SizedBox(height: AppTheme.space8),
                _buildRecentActivity(theme),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildWelcomeSection(ThemeData theme, user) => AppCard(
      padding: const EdgeInsets.all(AppTheme.space6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 56,
                height: 56,
                decoration: const BoxDecoration(
                  color: AppTheme.primary100,
                  borderRadius: AppTheme.radiusXl,
                ),
                child: const Icon(
                  Icons.warehouse_rounded,
                  size: 28,
                  color: AppTheme.primary600,
                ),
              ),
              const SizedBox(width: AppTheme.space4),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Selamat Datang,',
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: AppTheme.gray500,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      user?.fullName ?? 'User',
                      style: theme.textTheme.headlineSmall?.copyWith(
                        fontWeight: FontWeight.w700,
                        color: AppTheme.foreground,
                      ),
                    ),
                    const SizedBox(height: 4),
                    FittedBox(
                      fit: BoxFit.scaleDown,
                      alignment: Alignment.centerLeft,
                      child: AppBadge(
                        text: user?.roleDisplayName ?? 'Staff',
                        variant: AppBadgeVariant.primary,
                        icon: Icons.badge_rounded,
                      ),
                    ),
                  ],
                ),
              ),
              if (user?.kodeDepo != null) ...[
                const SizedBox(width: AppTheme.space4),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      'Depo',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: AppTheme.gray500,
                      ),
                    ),
                    Text(
                      user!.kodeDepo!,
                      style: theme.textTheme.labelLarge?.copyWith(
                        fontWeight: FontWeight.w600,
                        color: AppTheme.foreground,
                      ),
                    ),
                    if (user.namaDepo != null)
                      Text(
                        user.namaDepo!,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: AppTheme.gray500,
                        ),
                      ),
                  ],
                ),
              ],
            ],
          ),
          if (user?.kodeDepo != null) ...[
            const SizedBox(height: AppTheme.space4),
            const Divider(height: 1, color: AppTheme.gray100),
            const SizedBox(height: AppTheme.space4),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  'Depo',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: AppTheme.gray500,
                  ),
                ),
                Text(
                  user!.kodeDepo!,
                  style: theme.textTheme.labelLarge?.copyWith(
                    fontWeight: FontWeight.w600,
                    color: AppTheme.foreground,
                  ),
                ),
                if (user.namaDepo != null)
                  Text(
                    user.namaDepo!,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: AppTheme.gray500,
                    ),
                  ),
              ],
            ),
          ],
        ],
      ),
    );

  Widget _buildStatsCards(ThemeData theme) {
    var stats = [
      _StatItem('Penerimaan', '12', 'Hari Ini', Icons.inventory_2_rounded, AppTheme.primary600),
      _StatItem('Pengiriman', '8', 'Hari Ini', Icons.local_shipping_rounded, AppTheme.accent500),
      _StatItem('Opname', '3', 'Aktif', Icons.assignment_rounded, AppTheme.warning),
      _StatItem('Pending', '5', 'Approval', Icons.pending_rounded, AppTheme.danger),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Ringkasan Hari Ini',
          style: theme.textTheme.headlineSmall?.copyWith(
            fontWeight: FontWeight.w700,
            color: AppTheme.foreground,
          ),
        ),
        const SizedBox(height: AppTheme.space4),
        Row(
          children: [
            Expanded(child: _buildStatCard(theme, stats[0])),
            const SizedBox(width: AppTheme.space4),
            Expanded(child: _buildStatCard(theme, stats[1])),
          ],
        ),
        const SizedBox(height: AppTheme.space4),
        Row(
          children: [
            Expanded(child: _buildStatCard(theme, stats[2])),
            const SizedBox(width: AppTheme.space4),
            Expanded(child: _buildStatCard(theme, stats[3])),
          ],
        ),
      ],
    );
  }

  Widget _buildStatCard(ThemeData theme, _StatItem stat) => AppCard(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      onTap: () => ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('${stat.title} - Coming soon')),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Container(
                width: 18,
                height: 18,
                decoration: BoxDecoration(
                  color: stat.color.withValues(alpha: 0.15),
                  borderRadius: AppTheme.radiusLg,
                ),
                child: Icon(
                  stat.icon,
                  size: 9,
                  color: stat.color,
                ),
              ),
              const Spacer(),
              Flexible(
                child: AppBadge(
                  text: stat.subtitle,
                  variant: AppBadgeVariant.gray,
                ),
              ),
            ],
          ),
          const SizedBox(height: 2),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              stat.value,
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w700,
                color: AppTheme.foreground,
              ),
            ),
          ),
          const SizedBox(height: 1),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              stat.title,
              style: theme.textTheme.bodySmall?.copyWith(
                color: AppTheme.gray500,
                fontSize: 9,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );

  Widget _buildQuickActions(ThemeData theme) {
    var actions = [
      _ActionItem(
        'Check In Point',
        Icons.door_front_door_rounded,
        AppTheme.primary700,
        () => context.go('/gate'),
        ['gate.view'],
      ),
      _ActionItem('Penerimaan Baru', Icons.add_box_rounded, AppTheme.primary600, () {}, ['penerimaan.view']),
      _ActionItem('Rencana Kirim', Icons.schedule_rounded, AppTheme.accent500, () {}, ['rencana_kirim.view']),
      _ActionItem('Validasi SJ', Icons.verified_rounded, AppTheme.success, () {}, ['sj_validation.view']),
      _ActionItem('Opname', Icons.fact_check_rounded, AppTheme.warning, () {}, ['opname.view']),
      _ActionItem('Biaya THL', Icons.receipt_long_rounded, AppTheme.info, () {}, ['biaya_thl.view']),
    ];

    // Same rule as the web sidebar: an action the role cannot use is hidden.
    var user = context.watch<AuthProvider>().user;
    var visibleActions = actions
        .where(
          (action) =>
              action.permissions.isEmpty ||
              (user?.hasAnyPermission(action.permissions) ?? false),
        )
        .toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Flexible(
              child: Text(
                'Aksi Cepat',
                style: theme.textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: AppTheme.foreground,
                ),
                overflow: TextOverflow.ellipsis,
              ),
            ),
            const SizedBox(width: AppTheme.space3),
            AppTextButton(
              text: 'Lihat Semua',
              onPressed: () {},
            ),
          ],
        ),
        const SizedBox(height: AppTheme.space4),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          physics: const NeverScrollableScrollPhysics(),
          child: Row(
            children: [
              for (var (index, action) in visibleActions.indexed) ...[
                if (index > 0) const SizedBox(width: AppTheme.space4),
                _buildActionCard(theme, action),
              ],
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildActionCard(ThemeData theme, _ActionItem action) => SizedBox(
      width: 100,
      child: AppCard(
        padding: const EdgeInsets.all(AppTheme.space4),
        onTap: action.onTap,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: action.color.withValues(alpha: 0.15),
                borderRadius: AppTheme.radiusLg,
              ),
              child: Icon(
                action.icon,
                size: 24,
                color: action.color,
              ),
            ),
            const SizedBox(height: AppTheme.space3),
            Text(
              action.title,
              style: theme.textTheme.labelMedium?.copyWith(
                fontWeight: FontWeight.w600,
                color: AppTheme.foreground,
                fontSize: 12,
              ),
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );

  Widget _buildRecentActivity(ThemeData theme) {
    var activities = [
      _ActivityItem('Penerimaan PO-2024-001', 'Diterima 50 items', '2 jam lalu', Icons.inventory_2_rounded, AppTheme.success),
      _ActivityItem('Pengiriman RK-2024-015', 'Dikirim ke Depo B', '4 jam lalu', Icons.local_shipping_rounded, AppTheme.primary600),
      _ActivityItem('Opname Wave-03', 'Selesai validasi', '1 hari lalu', Icons.assignment_rounded, AppTheme.accent500),
      _ActivityItem('Biaya THL #THL-042', 'Menunggu approval', '1 hari lalu', Icons.receipt_long_rounded, AppTheme.warning),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Flexible(
              child: Text(
                'Aktivitas Terbaru',
                style: theme.textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: AppTheme.foreground,
                ),
                overflow: TextOverflow.ellipsis,
              ),
            ),
            const SizedBox(width: AppTheme.space3),
            AppTextButton(
              text: 'Lihat Semua',
              onPressed: () {},
            ),
          ],
        ),
        const SizedBox(height: AppTheme.space4),
        ListView.separated(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: activities.length,
          separatorBuilder: (context, index) => const Divider(
            height: 1,
            color: AppTheme.gray100,
            indent: 56,
          ),
          itemBuilder: (context, index) => _buildActivityTile(theme, activities[index]),
        ),
      ],
    );
  }

  Widget _buildActivityTile(ThemeData theme, _ActivityItem activity) => ListTile(
      contentPadding: EdgeInsets.zero,
      leading: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          color: activity.color.withValues(alpha: 0.15),
          borderRadius: AppTheme.radiusLg,
        ),
        child: Icon(
          activity.icon,
          size: 20,
          color: activity.color,
        ),
      ),
      title: Text(
        activity.title,
        style: theme.textTheme.bodyMedium?.copyWith(
          fontWeight: FontWeight.w600,
          color: AppTheme.foreground,
        ),
      ),
      subtitle: Text(
        activity.subtitle,
        style: theme.textTheme.bodySmall?.copyWith(
          color: AppTheme.gray500,
        ),
      ),
      trailing: Text(
        activity.time,
        style: theme.textTheme.labelSmall?.copyWith(
          color: AppTheme.gray400,
        ),
      ),
      onTap: () {},
    );
}

class _StatItem {

  _StatItem(this.title, this.value, this.subtitle, this.icon, this.color);
  final String title;
  final String value;
  final String subtitle;
  final IconData icon;
  final Color color;
}

class _ActionItem {

  _ActionItem(
    this.title,
    this.icon,
    this.color,
    this.onTap, [
    this.permissions = const [],
  ]);
  final String title;
  final IconData icon;
  final Color color;
  final VoidCallback onTap;

  /// Hidden when the role lacks every slug — same rule as the web menu.
  final List<String> permissions;
}

class _ActivityItem {

  _ActivityItem(this.title, this.subtitle, this.time, this.icon, this.color);
  final String title;
  final String subtitle;
  final String time;
  final IconData icon;
  final Color color;
}