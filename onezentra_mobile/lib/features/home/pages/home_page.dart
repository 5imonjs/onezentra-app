import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

import 'package:onezentra_mobile/core/theme/app_theme.dart';
import 'package:onezentra_mobile/core/theme/theme_provider.dart';
import 'package:onezentra_mobile/features/auth/models/auth_models.dart';
import 'package:onezentra_mobile/features/auth/providers/auth_provider.dart';
import 'package:onezentra_mobile/shared/widgets/app_widgets.dart';

/// Home Page - the only landing after login.
///
/// The main menu follows the field workflow: Check In Point → Validasi SJ →
/// Check Out Point. All activity history lives behind one Riwayat entry, so
/// operators never have to guess which history page holds a record. Each card
/// is hidden when the role lacks its permission — same rule as the web
/// sidebar.
class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  @override
  void initState() {
    super.initState();
    // Fresh login lands here: pull the latest profile + permissions so a
    // role edited on web applies without forcing logout + login. Resume
    // refreshes are owned by the app-level lifecycle observer; keeping that
    // out of this widget avoids two identical `/user` requests per resume.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) {
        return;
      }
      context.read<AuthProvider>().refreshUser();
    });
  }

  @override
  Widget build(BuildContext context) {
    var theme = Theme.of(context);
    var auth = context.watch<AuthProvider>();
    var user = auth.user;

    var workflowMenus = [
      const _HomeMenu(
        'Check In Point',
        'Catat Gate IN — scan PO / Nopol',
        Icons.door_front_door_rounded,
        AppTheme.primary300,
        ['gate.view'],
        '/gate',
        step: 1,
      ),
      const _HomeMenu(
        'Validasi SJ',
        'Validasi qty, expired, dan kondisi barang',
        Icons.verified_rounded,
        AppTheme.success,
        ['sj_validation.view'],
        '/validasi-sj',
        step: 2,
      ),
      const _HomeMenu(
        'Check Out Point',
        'Bongkar & selesaikan penerimaan',
        Icons.forklift,
        AppTheme.accent500,
        ['receiving.view'],
        '/bongkar',
        step: 3,
      ),
    ];

    var historyMenus = [
      const _HomeMenu(
        'Riwayat',
        'Gate, validasi, dan penerimaan dalam satu tempat',
        Icons.history_rounded,
        AppTheme.info,
        ['gate.view', 'sj_validation.view', 'receiving.view'],
        '/riwayat',
      ),
    ];

    var visibleWorkflow = workflowMenus
        .where(
          (menu) =>
              menu.permissions.isEmpty ||
              (user?.hasAnyPermission(menu.permissions) ?? false),
        )
        .toList();
    var visibleHistory = historyMenus
        .where(
          (menu) =>
              menu.permissions.isEmpty ||
              (user?.hasAnyPermission(menu.permissions) ?? false),
        )
        .toList();
    var hasMenu = visibleWorkflow.isNotEmpty || visibleHistory.isNotEmpty;

    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        title: const Text('ONEZENTRA'),
        elevation: 0,
        automaticallyImplyLeading: false,
        bottom: auth.isRefreshing
            ? const PreferredSize(
                preferredSize: Size.fromHeight(2),
                child: LinearProgressIndicator(
                  minHeight: 2,
                  semanticsLabel: 'Memperbarui izin',
                ),
              )
            : null,
        actions: [
          Builder(
            builder: (context) {
              ThemeProvider? tp;
              try {
                tp = context.watch<ThemeProvider>();
              } catch (_) {
                tp = null;
              }
              return IconButton(
                icon: Icon(tp?.isDark == true ? Icons.light_mode_rounded : Icons.dark_mode_rounded),
                tooltip: tp?.isDark == true ? 'Tema terang' : 'Tema gelap',
                 onPressed: tp == null
                    ? null
                    : () => tp!.setMode(tp.isDark ? ThemeMode.light : ThemeMode.dark),
              );
            },
          ),
          IconButton(
            icon: auth.isLoading
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.logout_rounded),
            tooltip: 'Keluar',
            onPressed: auth.isLoading ? null : _confirmLogout,
          ),
        ],
      ),
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            // Adaptive horizontal padding: tight on phones, airier on
            // tablets and desktop windows (same ramp as workflow pages).
            var horizontalPadding = constraints.maxWidth >= 900
                ? AppTheme.space8
                : constraints.maxWidth >= 600
                ? AppTheme.space6
                : AppTheme.space4;

            return SingleChildScrollView(
              padding: EdgeInsets.fromLTRB(
                horizontalPadding,
                AppTheme.space5,
                horizontalPadding,
                AppTheme.space8,
              ),
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 960),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _buildHeroHeader(theme, user),
                      const SizedBox(height: AppTheme.space6),
                      if (auth.refreshFailed && hasMenu) ...[
                        _buildRefreshBanner(theme, auth),
                        const SizedBox(height: AppTheme.space4),
                      ],
                      if (!hasMenu)
                        user != null &&
                                user.permissions == null &&
                                !auth.refreshFailed
                            ? _buildPermissionLoading(theme)
                            : _buildEmptyMenu(theme, auth)
                      else ...[
                        if (visibleWorkflow.isNotEmpty) ...[
                          _sectionHeader(
                            theme,
                            'Alur kerja',
                            'Kerjakan berurutan dari Gate IN sampai Check Out.',
                          ),
                          const SizedBox(height: AppTheme.space4),
                          _menuGrid(
                            context,
                            theme,
                            visibleWorkflow,
                            numbered: true,
                          ),
                        ],
                        if (visibleHistory.isNotEmpty) ...[
                          if (visibleWorkflow.isNotEmpty)
                            const SizedBox(height: AppTheme.space6),
                          _sectionHeader(
                            theme,
                            'Catatan aktivitas',
                            'Riwayat gate, validasi, dan penerimaan dalam satu tempat.',
                          ),
                          const SizedBox(height: AppTheme.space4),
                          _menuCard(context, theme, visibleHistory.first),
                        ],
                      ],
                      const SizedBox(height: AppTheme.space8),
                    ],
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }

  /// Aurora hero: greeting + identitas depo di atas panel bergradasi.
  /// Panel selalu gelap (ink ramp) seperti hero halaman workflow lain.
  Widget _buildHeroHeader(ThemeData theme, User? user) => Container(
    width: double.infinity,
    padding: const EdgeInsets.all(AppTheme.space5),
    decoration: BoxDecoration(
      gradient: const LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [AppTheme.primary950, AppTheme.ink900, AppTheme.ink800],
      ),
      borderRadius: AppTheme.radius2xl,
      border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      boxShadow: [
        BoxShadow(
          color: AppTheme.ink900.withValues(alpha: 0.35),
          blurRadius: 24,
          offset: const Offset(0, 10),
        ),
      ],
    ),
    child: Row(
      children: [
        Container(
          width: 52,
          height: 52,
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [AppTheme.primary500, AppTheme.primary700],
            ),
            borderRadius: AppTheme.radiusXl,
          ),
          child: const Icon(
            Icons.warehouse_rounded,
            size: 26,
            color: Colors.white,
          ),
        ),
        const SizedBox(width: AppTheme.space4),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Halo,',
                style: GoogleFonts.roboto(
                  fontSize: 12,
                  height: 1.2,
                  color: AppTheme.gray400,
                ),
              ),
              Text(
                user?.fullName ?? 'Pengguna',
                style: theme.textTheme.headlineMedium?.copyWith(
                  fontSize: 20,
                  height: 1.2,
                  fontWeight: FontWeight.w700,
                  color: AppTheme.foreground,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              if (user?.kodeDepo != null) ...[
                const SizedBox(height: AppTheme.space2),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppTheme.space3,
                    vertical: 3,
                  ),
                  decoration: BoxDecoration(
                    color: AppTheme.primary500.withValues(alpha: 0.18),
                    borderRadius: AppTheme.radiusFull,
                    border: Border.all(
                      color: AppTheme.primary500.withValues(alpha: 0.35),
                    ),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(
                        Icons.store_rounded,
                        size: 12,
                        color: AppTheme.primary200,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        'Depo ${user!.kodeDepo!}',
                        style: GoogleFonts.roboto(
                          fontSize: 11,
                          height: 1.2,
                          fontWeight: FontWeight.w600,
                          color: AppTheme.primary200,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    ),
  );

  Future<void> _confirmLogout() async {
    var confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: AppTheme.surfaceCard,
        title: Text(
          'Keluar dari akun?',
          style: GoogleFonts.roboto(fontSize: 16, fontWeight: FontWeight.w700),
        ),
        content: Text(
          'Anda perlu login kembali untuk mengakses menu.',
          style: GoogleFonts.roboto(
            fontSize: 13,
            height: 1.4,
            color: AppTheme.gray600,
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Batal'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            style: FilledButton.styleFrom(
              backgroundColor: AppTheme.danger,
              foregroundColor: Colors.white,
            ),
            child: const Text('Keluar'),
          ),
        ],
      ),
    );

    if (!(confirmed ?? false) || !mounted) {
      return;
    }

    await context.read<AuthProvider>().logout();
    if (!mounted) {
      return;
    }
    context.go('/login');
  }

  Widget _buildPermissionLoading(ThemeData theme) => Container(
    width: double.infinity,
    padding: const EdgeInsets.all(AppTheme.space5),
    decoration: BoxDecoration(
      color: AppTheme.surfaceCard,
      borderRadius: AppTheme.radiusXl,
      border: Border.all(color: AppTheme.gray400),
    ),
    child: Row(
      children: [
        const SizedBox(
          width: 18,
          height: 18,
          child: CircularProgressIndicator(
            strokeWidth: 2,
            semanticsLabel: 'Memuat izin',
          ),
        ),
        const SizedBox(width: AppTheme.space3),
        Expanded(
          child: Text(
            'Memuat izin...',
            style: theme.textTheme.bodyMedium?.copyWith(
              height: 1.4,
              color: AppTheme.gray500,
            ),
          ),
        ),
      ],
    ),
  );

  Widget _buildEmptyMenu(ThemeData theme, AuthProvider auth) {
    var permissionsUnknown = auth.user?.permissions == null;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AppTheme.space5),
      decoration: BoxDecoration(
        color: AppTheme.warningWell,
        borderRadius: AppTheme.radiusXl,
        border: Border.all(color: AppTheme.warningText),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            permissionsUnknown
                ? 'Izin belum dapat dimuat. Periksa koneksi lalu coba lagi.'
                : 'Tidak ada menu untuk peran Anda. Hubungi admin.',
            style: GoogleFonts.roboto(
              fontSize: 13,
              height: 1.4,
              color: AppTheme.warningText,
            ),
          ),
          const SizedBox(height: AppTheme.space3),
          OutlinedButton.icon(
            onPressed: auth.isRefreshing ? null : () => auth.refreshUser(),
            style: OutlinedButton.styleFrom(
              foregroundColor: AppTheme.warningText,
              side: BorderSide(
                color: AppTheme.warningText.withValues(alpha: 0.6),
              ),
            ),
            icon: const Icon(Icons.refresh_rounded, size: 18),
            label: const Text('Muat ulang'),
          ),
        ],
      ),
    );
  }

  Widget _buildRefreshBanner(ThemeData theme, AuthProvider auth) => Container(
    width: double.infinity,
    padding: const EdgeInsets.all(AppTheme.space4),
    decoration: BoxDecoration(
      color: AppTheme.warningWell,
      borderRadius: AppTheme.radiusLg,
      border: Border.all(color: AppTheme.warning),
    ),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.only(top: 1),
          child: Icon(
            Icons.cloud_off_rounded,
            size: 18,
            color: AppTheme.warningText,
          ),
        ),
        const SizedBox(width: AppTheme.space2),
        Expanded(
          child: Text(
            'Gagal memperbarui izin. Data lama ditampilkan.',
            style: theme.textTheme.bodySmall?.copyWith(
              color: AppTheme.warningText,
              height: 1.4,
            ),
          ),
        ),
        const SizedBox(width: AppTheme.space2),
        TextButton(
          onPressed: auth.isRefreshing ? null : () => auth.refreshUser(),
          style: TextButton.styleFrom(foregroundColor: AppTheme.warningText),
          child: const Text('Coba lagi'),
        ),
      ],
    ),
  );

  Widget _sectionHeader(ThemeData theme, String title, String subtitle) => Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      // Aksen bar kecil — menandai awal setiap section dengan konsisten.
      Container(
        width: 3,
        height: 34,
        margin: const EdgeInsets.only(right: AppTheme.space3),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [AppTheme.primary400, AppTheme.accent400],
          ),
          borderRadius: BorderRadius.circular(2),
        ),
      ),
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Semantics(
              header: true,
              child: Text(
                title,
                style: theme.textTheme.titleLarge?.copyWith(
                  fontSize: 16,
                  height: 1.3,
                  fontWeight: FontWeight.w700,
                  color: AppTheme.foreground,
                ),
              ),
            ),
            const SizedBox(height: 3),
            Text(
              subtitle,
              style: theme.textTheme.bodySmall?.copyWith(
                fontSize: 12,
                height: 1.4,
                color: AppTheme.gray500,
              ),
            ),
          ],
        ),
      ),
    ],
  );

  Widget _menuGrid(
    BuildContext context,
    ThemeData theme,
    List<_HomeMenu> menus, {
    required bool numbered,
  }) => LayoutBuilder(
    builder: (context, constraints) {
      const gap = AppTheme.space4;
      var columns = (constraints.maxWidth / 300).floor().clamp(1, 4).toInt();
      var cardWidth = (constraints.maxWidth - gap * (columns - 1)) / columns;

      return Wrap(
        spacing: gap,
        runSpacing: gap,
        children: [
          for (var menu in menus)
            SizedBox(
              width: cardWidth,
              child: _menuCard(
                context,
                theme,
                menu,
                number: numbered ? menu.step : null,
              ),
            ),
        ],
      );
    },
  );

  Widget _menuCard(
    BuildContext context,
    ThemeData theme,
    _HomeMenu menu, {
    int? number,
  }) => AppCard(
    padding: const EdgeInsets.all(AppTheme.space5),
    // Subtle stage tint: blends a hint of the step colour into the card so
    // the workflow reads as a colored sequence without breaking the theme.
    color: Color.lerp(AppTheme.surfaceCard, menu.color, 0.05),
    border: Border.all(color: AppTheme.gray400),
    onTap: () => context.push(menu.route),
    child: Row(
      children: [
        Stack(
          clipBehavior: Clip.none,
          children: [
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    menu.color.withValues(alpha: 0.22),
                    menu.color.withValues(alpha: 0.08),
                  ],
                ),
                borderRadius: AppTheme.radiusXl,
                border: Border.all(color: menu.color.withValues(alpha: 0.25)),
              ),
              child: Icon(menu.icon, size: 28, color: menu.color),
            ),
            if (number != null)
              Positioned(
                left: -6,
                top: -6,
                child: Container(
                  width: 22,
                  height: 22,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: menu.color,
                    shape: BoxShape.circle,
                    border: Border.all(color: AppTheme.background, width: 2),
                  ),
                  child: Text(
                    '$number',
                    style: GoogleFonts.roboto(
                      fontSize: 10,
                      height: 1,
                      fontWeight: FontWeight.w700,
                      color: AppTheme.ink900,
                    ),
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(width: AppTheme.space4),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                menu.title,
                style: theme.textTheme.titleMedium?.copyWith(
                  fontSize: 15,
                  height: 1.3,
                  letterSpacing: 0,
                  fontWeight: FontWeight.w700,
                  color: AppTheme.foreground,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                menu.description,
                style: theme.textTheme.bodySmall?.copyWith(
                  fontSize: 13,
                  height: 1.4,
                  color: AppTheme.gray500,
                ),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
        const SizedBox(width: AppTheme.space3),
        Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            color: menu.color.withValues(alpha: 0.1),
            borderRadius: AppTheme.radiusFull,
          ),
          child: Icon(Icons.arrow_forward_rounded, size: 18, color: menu.color),
        ),
      ],
    ),
  );
}

class _HomeMenu {
  const _HomeMenu(
    this.title,
    this.description,
    this.icon,
    this.color,
    this.permissions,
    this.route, {
    this.step,
  });
  final String title;
  final String description;
  final IconData icon;
  final Color color;
  final List<String> permissions;
  final int? step;

  /// Pushed (not `go`) so the system back button returns here.
  final String route;
}
