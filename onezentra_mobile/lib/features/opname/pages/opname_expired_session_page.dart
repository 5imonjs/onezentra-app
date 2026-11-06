import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

import 'package:onezentra_mobile/core/theme/app_theme.dart';
import 'package:onezentra_mobile/features/auth/providers/auth_provider.dart';
import 'package:onezentra_mobile/features/opname/models/opname_expired_session_models.dart';
import 'package:onezentra_mobile/features/opname/providers/opname_expired_session_provider.dart';
import 'package:onezentra_mobile/features/opname/repositories/opname_expired_session_repository.dart';
import 'package:onezentra_mobile/shared/widgets/app_widgets.dart';

AppBadgeVariant _sessionBadgeVariant(String status) => switch (status) {
  'OPEN' => AppBadgeVariant.info,
  'IN_PROGRESS' => AppBadgeVariant.primary,
  'PENDING_APPROVAL' => AppBadgeVariant.warning,
  'APPROVED' => AppBadgeVariant.success,
  'COMPLETED' => AppBadgeVariant.success,
  'REVISI' => AppBadgeVariant.warning,
  'CANCELLED' => AppBadgeVariant.gray,
  _ => AppBadgeVariant.gray,
};

/// Sesi Opname Expired — alur kerja lapangan (aturan A2).
///
/// Halaman sederhana: daftar sesi → buka detail → mulai sesi → hitung fisik
/// per item → kirim untuk persetujuan → setujui/revisi. Tanpa boilerplate
/// berlebih; aksi berat diarahkan ke backend (opname-sessions).
class OpnameExpiredSessionPage extends StatefulWidget {
  const OpnameExpiredSessionPage({super.key, this.repository});

  final OpnameExpiredSessionRepository? repository;

  @override
  State<OpnameExpiredSessionPage> createState() =>
      _OpnameExpiredSessionPageState();
}

class _OpnameExpiredSessionPageState extends State<OpnameExpiredSessionPage> {
  late final OpnameExpiredSessionProvider _provider =
      OpnameExpiredSessionProvider(repository: widget.repository);

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
          context.read<AuthProvider>().user?.hasPermission(
            'opname.session.view',
          ) ??
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
      ChangeNotifierProvider<OpnameExpiredSessionProvider>.value(
        value: _provider,
        child: Builder(builder: _buildPage),
      );

  Widget _buildPage(BuildContext context) {
    var canView =
        context.watch<AuthProvider>().user?.hasPermission(
          'opname.session.view',
        ) ??
        false;
    var provider = context.watch<OpnameExpiredSessionProvider>();

    var content = !canView
        ? _buildNoAccess()
        : RefreshIndicator(
            onRefresh: provider.load,
            color: AppTheme.primary600,
            child: provider.selected != null
                ? _buildSessionDetail(provider, context)
                : provider.isLoading && provider.sessions.isEmpty
                ? const _OpnameSessionLoading()
                : provider.error != null
                ? AppErrorDisplay(
                    message: provider.error!,
                    onRetry: provider.load,
                    retryText: 'Coba Lagi',
                  )
                : provider.sessions.isEmpty
                ? const AppEmptyState(
                    icon: Icons.hourglass_empty_rounded,
                    title: 'Belum ada sesi opname',
                    subtitle:
                        'Sesi opname akan dibuat saat ada barang kadaluarsa yang perlu dicek.',
                  )
                : ListView.separated(
                    itemCount: provider.sessions.length,
                    separatorBuilder: (child, index) =>
                        const SizedBox(height: AppTheme.space3),
                    padding: const EdgeInsets.all(AppTheme.space4),
                    itemBuilder: (_, index) => _OpnameSessionTile(
                      session: provider.sessions[index],
                      onTap: () => provider.show(provider.sessions[index].id),
                    ),
                  ),
          );

    return Scaffold(
      backgroundColor: context.colors.background,
      appBar: AppBar(
        title: const Text('Sesi Opname Expired'),
        elevation: 0,
        actions: [
          IconButton(
            onPressed: provider.load,
            tooltip: 'Muat ulang',
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: SafeArea(child: content),
    );
  }

  Widget _buildSessionDetail(
    OpnameExpiredSessionProvider provider,
    BuildContext context,
  ) {
    var session = provider.selected!;
    return RefreshIndicator(
      onRefresh: () => provider.show(session.id),
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(AppTheme.space4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildSessionMetaCard(session, context, provider),
            const SizedBox(height: AppTheme.space4),
            ...session.items.map(
              (item) => _OpnameSessionItemTile(
                key: ValueKey<int>(item.id),
                item: item,
                onCount: session.acceptsCounting
                    ? () => _showVerifySheet(context, session, item)
                    : null,
              ),
            ),
            const SizedBox(height: AppTheme.space8),
          ],
        ),
      ),
    );
  }

  Widget _buildSessionMetaCard(
    OpnameExpiredSession session,
    BuildContext context,
    OpnameExpiredSessionProvider provider,
  ) => AppCard(
    padding: const EdgeInsets.all(AppTheme.space4),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            AppBadge(
              text: OpnameSessionStatus.label(session.status),
              variant: _sessionBadgeVariant(session.status),
            ),
            const SizedBox(width: AppTheme.space2),
            Expanded(
              child: Text(
                'Sesi minggu ${session.weekStart ?? '-'}',
                style: GoogleFonts.roboto(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: context.colors.foreground,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: AppTheme.space2),
        Text(
          session.namaDepo ?? session.kodeDepo ?? '-',
          style: GoogleFonts.roboto(
            fontSize: 12,
            color: context.colors.textSecondary,
          ),
        ),
        const SizedBox(height: AppTheme.space2),
        Text(
          '${session.items.length} item verifikasi',
          style: GoogleFonts.roboto(
            fontSize: 12,
            color: context.colors.textSecondary,
          ),
        ),
        const SizedBox(height: AppTheme.space3),
        ..._buildSessionActions(session, provider, context),
      ],
    ),
  );

  List<Widget> _buildSessionActions(
    OpnameExpiredSession session,
    OpnameExpiredSessionProvider provider,
    BuildContext context,
  ) {
    if (session.isOpen) {
      return [
        AppPrimaryButton(
          text: 'Mulai Sesi',
          onPressed: () => provider.start(session.id),
          isLoading: provider.isLoading,
        ),
        const SizedBox(height: AppTheme.space3),
        AppSecondaryButton(
          text: 'Batalkan Sesi',
          onPressed: () => provider.cancel(session.id),
          isLoading: provider.isLoading,
          isFullWidth: false,
          width: 180,
          height: 44,
        ),
      ];
    }

    if (session.acceptsCounting) {
      var allVerified =
          session.items.isNotEmpty && session.items.every((i) => i.isVerified);
      if (allVerified) {
        return [
          AppPrimaryButton(
            text: 'Kirim Sesi untuk Persetujuan',
            onPressed: () => provider.submit(session.id),
            isLoading: provider.isLoading,
          ),
        ];
      }
      return const <Widget>[];
    }

    if (session.isPendingApproval) {
      return [
        AppPrimaryButton(
          text: 'Setujui Sesi',
          onPressed: () => provider.approve(session.id),
          isLoading: provider.isLoading,
        ),
        const SizedBox(height: AppTheme.space3),
        AppSecondaryButton(
          text: 'Revisi Sesi',
          onPressed: () => _confirmRevise(context, session),
          isLoading: provider.isLoading,
          isFullWidth: false,
          width: 180,
          height: 44,
        ),
      ];
    }

    return const <Widget>[];
  }

  Future<void> _confirmRevise(
    BuildContext context,
    OpnameExpiredSession session,
  ) async {
    var controller = TextEditingController();
    var confirmed = false;
    var result = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Revisi Sesi'),
        content: TextField(
          controller: controller,
          decoration: const InputDecoration(
            labelText: 'Alasan revisi (min. 5 karakter)',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Batal'),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Revisi'),
          ),
        ],
      ),
    );

    confirmed = result ?? false;
    if (confirmed) {
      var reason = controller.text.trim();
      if (reason.length >= 5) {
        await _provider.revise(session.id, reason);
      }
    }
  }

  Future<void> _showVerifySheet(
    BuildContext context,
    OpnameExpiredSession session,
    OpnameExpiredSessionItem item,
  ) async {
    var qtyCrtController = TextEditingController(
      text: item.qtyFisikCrt?.toString() ?? '',
    );
    var qtyPcsController = TextEditingController(
      text: item.qtyFisikPcs?.toString() ?? '',
    );
    var disposition = item.disposition ?? 'LANJUT';
    var identifiedVia = item.verifiedVia ?? 'scan';

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (sheetContext) => StatefulBuilder(
        builder: (context, setState) {
          var qtyCrt =
              double.tryParse(qtyCrtController.text.replaceAll(',', '.')) ?? 0;
          var qtyPcs =
              double.tryParse(qtyPcsController.text.replaceAll(',', '.')) ?? 0;
          var hasBarang = qtyCrt > 0 || qtyPcs > 0;

          return Padding(
            padding: EdgeInsets.only(
              bottom: MediaQuery.of(context).viewInsets.bottom,
            ),
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'Hitung Fisik',
                    style: GoogleFonts.roboto(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      color: context.colors.foreground,
                    ),
                  ),
                  const SizedBox(height: AppTheme.space2),
                  Text(
                    item.namaBarang ?? item.kodeBarang ?? 'Item ${item.id}',
                    style: GoogleFonts.roboto(
                      fontSize: 12,
                      color: context.colors.textSecondary,
                    ),
                  ),
                  const SizedBox(height: AppTheme.space3),
                  AppTextField(
                    controller: qtyCrtController,
                    label: 'Qty Fisik (CRT)',
                    keyboardType: const TextInputType.numberWithOptions(
                      decimal: true,
                    ),
                  ),
                  const SizedBox(height: AppTheme.space2),
                  AppTextField(
                    controller: qtyPcsController,
                    label: 'Qty Fisik (PCS)',
                    keyboardType: const TextInputType.numberWithOptions(
                      decimal: true,
                    ),
                  ),
                  if (hasBarang) ...[
                    const SizedBox(height: AppTheme.space3),
                    DropdownButtonFormField<String>(
                      initialValue: disposition,
                      decoration: const InputDecoration(
                        labelText: 'Disposisi',
                        border: OutlineInputBorder(),
                      ),
                      items: const [
                        DropdownMenuItem(
                          value: 'LANJUT',
                          child: Text('LANJUT'),
                        ),
                        DropdownMenuItem(value: 'RETUR', child: Text('RETUR')),
                        DropdownMenuItem(
                          value: 'DISPOSAL',
                          child: Text('DISPOSAL'),
                        ),
                      ],
                      onChanged: (value) =>
                          setState(() => disposition = value ?? 'LANJUT'),
                    ),
                  ],
                  const SizedBox(height: AppTheme.space3),
                  DropdownButtonFormField<String>(
                    initialValue: identifiedVia,
                    decoration: const InputDecoration(
                      labelText: 'Dikenali via',
                      border: OutlineInputBorder(),
                    ),
                    items: const [
                      DropdownMenuItem(value: 'scan', child: Text('Scan')),
                      DropdownMenuItem(value: 'manual', child: Text('Manual')),
                    ],
                    onChanged: (value) =>
                        setState(() => identifiedVia = value ?? 'scan'),
                  ),
                  const SizedBox(height: AppTheme.space4),
                  AppPrimaryButton(
                    text: 'Simpan',
                    onPressed: () async {
                      var navigator = Navigator.of(context);
                      var qtyCrtValue =
                          double.tryParse(
                            qtyCrtController.text.replaceAll(',', '.'),
                          ) ??
                          0;
                      var qtyPcsValue =
                          double.tryParse(
                            qtyPcsController.text.replaceAll(',', '.'),
                          ) ??
                          0;
                      var dispValue = (qtyCrtValue == 0 && qtyPcsValue == 0)
                          ? null
                          : disposition;
                      var data = <String, dynamic>{
                        'qty_fisik_crt': qtyCrtValue,
                        'qty_fisik_pcs': qtyPcsValue,
                        'disposition': dispValue,
                        'notes': item.notes,
                        'identified_via': identifiedVia,
                      };
                      await _provider.verifyItem(session.id, item.id, data);
                      navigator.pop();
                    },
                    isLoading: _provider.isLoading,
                  ),
                  const SizedBox(height: AppTheme.space4),
                ],
              ),
            ),
          );
        },
      ),
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
              'Anda tidak memiliki izin untuk melihat Sesi Opname Expired.',
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

class _OpnameSessionLoading extends StatelessWidget {
  const _OpnameSessionLoading();

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
          'Memuat sesi...',
          style: Theme.of(
            context,
          ).textTheme.bodyMedium?.copyWith(color: context.colors.textMuted),
        ),
      ],
    ),
  );
}

class _OpnameSessionTile extends StatelessWidget {
  const _OpnameSessionTile({required this.session, this.onTap});

  final OpnameExpiredSession session;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => AppCard(
    padding: const EdgeInsets.all(AppTheme.space4),
    onTap: onTap,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            AppBadge(
              text: OpnameSessionStatus.label(session.status),
              variant: _sessionBadgeVariant(session.status),
            ),
            const SizedBox(width: AppTheme.space2),
            Expanded(
              child: Text(
                'Sesi minggu ${session.weekStart ?? '-'}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: GoogleFonts.roboto(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: context.colors.foreground,
                ),
              ),
            ),
            Text(
              '${session.items.length} item',
              style: GoogleFonts.roboto(
                fontSize: 11,
                color: context.colors.textMuted,
              ),
            ),
          ],
        ),
        const SizedBox(height: AppTheme.space2),
        Text(
          session.namaDepo ?? session.kodeDepo ?? '-',
          style: GoogleFonts.roboto(
            fontSize: 12,
            color: context.colors.textSecondary,
          ),
        ),
      ],
    ),
  );
}

class _OpnameSessionItemTile extends StatelessWidget {
  const _OpnameSessionItemTile({required this.item, super.key, this.onCount});

  final OpnameExpiredSessionItem item;
  final VoidCallback? onCount;

  @override
  Widget build(BuildContext context) => AppCard(
    padding: const EdgeInsets.all(AppTheme.space4),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            AppBadge(
              text: item.isVerified ? 'Sudah dihitung' : 'Belum dihitung',
              variant: item.isVerified
                  ? AppBadgeVariant.success
                  : AppBadgeVariant.gray,
            ),
            const SizedBox(width: AppTheme.space2),
            Expanded(
              child: Text(
                item.namaBarang ?? item.kodeBarang ?? 'Item ${item.id}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: GoogleFonts.roboto(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: context.colors.foreground,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: AppTheme.space2),
        Text(
          'Ekspektasi: CRT ${_formatQty(item.expectedCrt)} / PCS ${_formatQty(item.expectedPcs)}',
          style: GoogleFonts.roboto(
            fontSize: 11,
            color: context.colors.textSecondary,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          'Fisik: CRT ${_formatQty(item.qtyFisikCrt)} / PCS ${_formatQty(item.qtyFisikPcs)}',
          style: GoogleFonts.roboto(
            fontSize: 11,
            color: context.colors.foreground,
          ),
        ),
        if (item.disposition != null) ...[
          const SizedBox(height: AppTheme.space2),
          Text(
            'Disposisi: ${item.disposition}',
            style: GoogleFonts.roboto(
              fontSize: 11,
              color: context.colors.textSecondary,
            ),
          ),
        ],
        if (item.notes != null && item.notes!.isNotEmpty) ...[
          const SizedBox(height: AppTheme.space2),
          Text(
            'Catatan: ${item.notes}',
            style: GoogleFonts.roboto(
              fontSize: 11,
              color: context.colors.textSecondary,
            ),
          ),
        ],
        if (onCount != null) ...[
          const SizedBox(height: AppTheme.space3),
          AppSecondaryButton(
            text: 'Hitung Fisik',
            onPressed: onCount,
            isFullWidth: false,
            width: 150,
            height: 44,
          ),
        ],
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
}
