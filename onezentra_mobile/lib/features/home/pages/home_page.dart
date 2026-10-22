import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

import 'package:onezentra_mobile/core/theme/app_theme.dart';
import 'package:onezentra_mobile/features/auth/providers/auth_provider.dart';
import 'package:onezentra_mobile/shared/widgets/app_widgets.dart';

/// Home Page - the only landing after login.
///
/// Operational menus: Check In Point, Riwayat Gate, Validasi SJ, Bongkar,
/// and Hasil Penerimaan. Each card is hidden when the role lacks its
/// permission — same rule as the web sidebar.
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

    var menus = [
      const _HomeMenu(
        'Check In Point',
        'Scan PO / Nopol — catat Gate IN',
        Icons.door_front_door_rounded,
        AppTheme.primary300,
        ['gate.view'],
        '/gate',
      ),
      const _HomeMenu(
        'Riwayat Gate',
        'Cari & telusuri transaksi gate',
        Icons.history_rounded,
        AppTheme.info,
        ['gate.view'],
        '/gate/riwayat',
      ),
      const _HomeMenu(
        'Validasi SJ',
        'Scan PO — validasi produk per item',
        Icons.verified_rounded,
        AppTheme.success,
        ['sj_validation.view'],
        '/validasi-sj',
      ),
      const _HomeMenu(
        'Bongkar',
        'Scan PO — bongkar dan pindai produk',
        Icons.forklift,
        AppTheme.accent500,
        ['receiving.view'],
        '/bongkar',
      ),
      const _HomeMenu(
        'Hasil Penerimaan',
        'Riwayat penerimaan barang yang sudah selesai',
        Icons.inventory_2_rounded,
        AppTheme.primary400,
        ['receiving.view'],
        '/hasil-penerimaan',
      ),
    ];

    var visible = menus
        .where(
          (menu) =>
              menu.permissions.isEmpty ||
              (user?.hasAnyPermission(menu.permissions) ?? false),
        )
        .toList();

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
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(AppTheme.space6),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 960),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 52,
                        height: 52,
                        decoration: const BoxDecoration(
                          color: AppTheme.primary100,
                          borderRadius: AppTheme.radiusXl,
                        ),
                        child: const Icon(
                          Icons.warehouse_rounded,
                          size: 26,
                          color: AppTheme.primary600,
                        ),
                      ),
                      const SizedBox(width: AppTheme.space4),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Halo,',
                              style: theme.textTheme.bodyMedium?.copyWith(
                                color: AppTheme.gray500,
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
                            if (user?.kodeDepo != null)
                              Text(
                                'Depo ${user!.kodeDepo!}',
                                style: theme.textTheme.bodySmall?.copyWith(
                                  height: 1.4,
                                  color: AppTheme.gray500,
                                ),
                              ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: AppTheme.space6),
                  if (auth.refreshFailed && visible.isNotEmpty) ...[
                    _buildRefreshBanner(theme, auth),
                    const SizedBox(height: AppTheme.space4),
                  ],
                  Semantics(
                    header: true,
                    child: Text(
                      'Pilih pekerjaan',
                      style: theme.textTheme.titleLarge?.copyWith(
                        fontSize: 16,
                        height: 1.3,
                        fontWeight: FontWeight.w700,
                        color: AppTheme.foreground,
                      ),
                    ),
                  ),
                  const SizedBox(height: AppTheme.space4),
                  if (visible.isEmpty &&
                      user != null &&
                      user.permissions == null &&
                      !auth.refreshFailed)
                    _buildPermissionLoading(theme)
                  else if (visible.isEmpty)
                    _buildEmptyMenu(theme, auth)
                  else
                    // Let the cards keep their natural height. A fixed grid
                    // aspect ratio made tablet/desktop cards hundreds of pixels
                    // tall, with the label stranded at the top and the icon in
                    // the middle.
                    LayoutBuilder(
                      builder: (context, constraints) {
                        const gap = AppTheme.space4;
                        var columns = (constraints.maxWidth / 300)
                            .floor()
                            .clamp(1, 4)
                            .toInt();
                        var cardWidth =
                            (constraints.maxWidth - gap * (columns - 1)) /
                            columns;

                        return Wrap(
                          spacing: gap,
                          runSpacing: gap,
                          children: [
                            for (var i = 0; i < visible.length; i++)
                              SizedBox(
                                width: cardWidth,
                                child: _menuCard(
                                  context,
                                  theme,
                                  visible[i],
                                  number: i + 1,
                                ),
                              ),
                          ],
                        );
                      },
                    ),
                  const SizedBox(height: AppTheme.space8),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

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

  Widget _menuCard(
    BuildContext context,
    ThemeData theme,
    _HomeMenu menu, {
    required int number,
  }) => AppCard(
    padding: const EdgeInsets.all(AppTheme.space5),
    border: Border.all(color: AppTheme.gray400),
    onTap: () => context.push(menu.route),
    child: Row(
      children: [
        Container(
          width: 56,
          height: 56,
          decoration: BoxDecoration(
            color: menu.color.withValues(alpha: 0.15),
            borderRadius: AppTheme.radiusXl,
          ),
          child: Icon(menu.icon, size: 28, color: menu.color),
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
    this.route,
  );
  final String title;
  final String description;
  final IconData icon;
  final Color color;
  final List<String> permissions;

  /// Pushed (not `go`) so the system back button returns here.
  final String route;
}
