import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

import 'package:onezentra_mobile/core/theme/app_theme.dart';
import 'package:onezentra_mobile/features/auth/providers/auth_provider.dart';
import 'package:onezentra_mobile/features/gate/pages/gate_history_page.dart';
import 'package:onezentra_mobile/features/gate/repositories/gate_repository.dart';
import 'package:onezentra_mobile/features/inbound/pages/inbound_page.dart';
import 'package:onezentra_mobile/features/inbound/repositories/inbound_repository.dart';
import 'package:onezentra_mobile/features/validation/pages/validation_history_page.dart';
import 'package:onezentra_mobile/features/validation/repositories/validation_repository.dart';

/// One place for every operational history: gate, validation, and receiving.
///
/// The tabs follow the same order as the field workflow and are only shown
/// when the signed-in role has the matching view permission.
class HistoryPage extends StatelessWidget {
  const HistoryPage({
    super.key,
    this.gateRepository,
    this.validationRepository,
    this.inboundRepository,
  });

  final GateRepository? gateRepository;
  final ValidationRepository? validationRepository;
  final InboundRepository? inboundRepository;

  @override
  Widget build(BuildContext context) {
    var user = context.watch<AuthProvider>().user;
    var canViewGate = user?.hasPermission('gate.view') ?? false;
    var canViewValidation = user?.hasPermission('sj_validation.view') ?? false;
    var canViewReceiving = user?.hasPermission('receiving.view') ?? false;

    var tabs = <_HistoryTab>[
      if (canViewGate)
        _HistoryTab(
          label: 'Gate',
          icon: Icons.door_front_door_rounded,
          child: GateHistoryPage(repository: gateRepository, embedded: true),
        ),
      if (canViewValidation)
        _HistoryTab(
          label: 'Validasi',
          icon: Icons.verified_rounded,
          child: ValidationHistoryPage(
            repository: validationRepository,
            embedded: true,
          ),
        ),
      if (canViewReceiving)
        _HistoryTab(
          label: 'Penerimaan',
          icon: Icons.inventory_2_rounded,
          child: InboundPage(repository: inboundRepository, embedded: true),
        ),
    ];

    if (tabs.isEmpty) {
      return Scaffold(
        backgroundColor: Theme.of(context).extension<ThemeColors>()?.background ?? AppTheme.background,
        appBar: AppBar(title: const Text('Riwayat'), elevation: 0),
        body: SafeArea(child: _buildNoAccess()),
      );
    }

    return DefaultTabController(
      length: tabs.length,
      child: Scaffold(
        backgroundColor: Theme.of(context).extension<ThemeColors>()?.background ?? AppTheme.background,
        appBar: AppBar(
          title: const Text('Riwayat'),
          elevation: 0,
          bottom: tabs.length > 1
              ? TabBar(
                  indicatorColor: AppTheme.primary400,
                  labelColor: AppTheme.primary200,
                  unselectedLabelColor: Theme.of(context).extension<ThemeColors>()?.gray400 ?? Theme.of(context).extension<ThemeColors>()?.gray400 ?? AppTheme.gray400,
                  dividerColor: Theme.of(context).extension<ThemeColors>()?.gray300 ?? Theme.of(context).extension<ThemeColors>()?.gray300 ?? AppTheme.gray300.withValues(alpha: 0.2),
                  labelStyle: GoogleFonts.roboto(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                  ),
                  isScrollable: true,
                  tabs: [
                    for (var tab in tabs)
                      Tab(
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(tab.icon, size: 16),
                            const SizedBox(width: 6),
                            Text(tab.label),
                          ],
                        ),
                      ),
                  ],
                )
              : null,
        ),
        body: SafeArea(
          child: tabs.length == 1
              ? tabs.first.child
              : TabBarView(children: [for (var tab in tabs) tab.child]),
        ),
      ),
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
              'Anda tidak memiliki izin untuk melihat Riwayat.',
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
}

class _HistoryTab {
  const _HistoryTab({
    required this.label,
    required this.icon,
    required this.child,
  });

  final String label;
  final IconData icon;
  final Widget child;
}
