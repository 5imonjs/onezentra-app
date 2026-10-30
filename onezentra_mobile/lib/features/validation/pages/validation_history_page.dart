import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

import 'package:onezentra_mobile/core/theme/app_theme.dart';
import 'package:onezentra_mobile/features/auth/providers/auth_provider.dart';
import 'package:onezentra_mobile/features/validation/models/validation_models.dart';
import 'package:onezentra_mobile/features/validation/providers/validation_provider.dart';
import 'package:onezentra_mobile/features/validation/repositories/validation_repository.dart';
import 'package:onezentra_mobile/features/validation/widgets/validation_history_card.dart';

/// Standalone validation history, also embeddable as a tab on the unified
/// Riwayat page.
class ValidationHistoryPage extends StatefulWidget {
  const ValidationHistoryPage({
    super.key,
    this.repository,
    this.embedded = false,
  });

  final ValidationRepository? repository;
  final bool embedded;

  @override
  State<ValidationHistoryPage> createState() => _ValidationHistoryPageState();
}

class _ValidationHistoryPageState extends State<ValidationHistoryPage> {
  late final ValidationProvider _provider = ValidationProvider(
    repository: widget.repository,
  );

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) {
        return;
      }
      var canView =
          context.read<AuthProvider>().user?.hasPermission(
            'sj_validation.view',
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
      ChangeNotifierProvider<ValidationProvider>.value(
        value: _provider,
        child: Builder(builder: _buildPage),
      );

  Widget _buildPage(BuildContext context) {
    var canView =
        context.watch<AuthProvider>().user?.hasPermission(
          'sj_validation.view',
        ) ??
        false;
    var validation = context.watch<ValidationProvider>();

    Widget content = !canView
        ? _buildNoAccess()
        : RefreshIndicator(
            onRefresh: validation.refresh,
            color: AppTheme.primary600,
            child: SingleChildScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(AppTheme.space4),
              child: ValidationHistoryCard(
                validation: validation,
                onOpen: _openSession,
              ),
            ),
          );

    if (widget.embedded) {
      return content;
    }

    return Scaffold(
      backgroundColor: Theme.of(context).extension<ThemeColors>()?.background ?? AppTheme.background,
      appBar: AppBar(
        title: const Text('Riwayat Validasi'),
        elevation: 0,
        actions: [
          IconButton(
            onPressed: canView && !validation.isLoading
                ? () => validation.refresh()
                : null,
            tooltip: 'Muat ulang',
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: SafeArea(child: content),
    );
  }

  void _openSession(SjValidation session) {
    var code = session.scanCode?.trim();
    if (code == null || code.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('PO sesi ini tidak tersedia.')),
      );
      return;
    }
    context.push('/validasi-sj', extra: code);
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
              'Anda tidak memiliki izin untuk melihat Riwayat Validasi.',
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
