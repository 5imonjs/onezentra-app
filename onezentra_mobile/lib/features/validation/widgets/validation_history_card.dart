import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'package:onezentra_mobile/core/theme/app_theme.dart';
import 'package:onezentra_mobile/features/validation/models/validation_models.dart';
import 'package:onezentra_mobile/features/validation/providers/validation_provider.dart';
import 'package:onezentra_mobile/shared/widgets/app_widgets.dart';

/// Searchable, paged list of validation sessions.
///
/// Shared by the Validasi SJ screen and the unified Riwayat page so both
/// places show exactly the same rows, statuses, and pagination.
class ValidationHistoryCard extends StatefulWidget {
  const ValidationHistoryCard({
    required this.validation,
    required this.onOpen,
    this.title = 'Riwayat Validasi',
    super.key,
  });

  final ValidationProvider validation;
  final ValueChanged<SjValidation> onOpen;
  final String title;

  @override
  State<ValidationHistoryCard> createState() => _ValidationHistoryCardState();
}

class _ValidationHistoryCardState extends State<ValidationHistoryCard> {
  final _searchController = TextEditingController();

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    var validation = widget.validation;
    return AppCard(
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
                      widget.title,
                      style: GoogleFonts.roboto(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: Theme.of(context).extension<ThemeColors>()?.foreground ?? AppTheme.foreground,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${validation.total} sesi tercatat',
                      style: GoogleFonts.roboto(
                        fontSize: 11,
                        color: Theme.of(context).extension<ThemeColors>()?.textMuted ?? Theme.of(context).extension<ThemeColors>()?.gray400 ?? AppTheme.gray400,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: AppTheme.space4),
          AppTextField(
            controller: _searchController,
            hint: 'Cari PO...',
            prefixIcon: Icons.search_rounded,
            onChanged: validation.setSearch,
          ),
          const SizedBox(height: AppTheme.space3),
          ..._historyBody(validation),
        ],
      ),
    );
  }

  List<Widget> _historyBody(ValidationProvider validation) {
    var listError = validation.listError;
    if (listError != null) {
      return [
        SizedBox(
          width: double.infinity,
          child: AppErrorDisplay(
            message: listError,
            onRetry: validation.loadItems,
          ),
        ),
      ];
    }

    if (validation.isLoading && validation.items.isEmpty) {
      return [
        Column(
          children: List.generate(
            3,
            (_) => Container(
              height: 64,
              margin: const EdgeInsets.only(bottom: AppTheme.space3),
              decoration: BoxDecoration(
                color: Theme.of(context).extension<ThemeColors>()?.gray100 ?? AppTheme.gray100,
                borderRadius: AppTheme.radiusLg,
              ),
            ),
          ),
        ),
      ];
    }

    if (validation.items.isEmpty) {
      return [
        SizedBox(
          width: double.infinity,
          child: AppEmptyState(
            icon: Icons.verified_rounded,
            title: validation.search.isNotEmpty
                ? 'Tidak ada hasil'
                : 'Belum ada sesi validasi',
            subtitle: validation.search.isNotEmpty
                ? 'Cari dengan PO lain.'
                : 'Sesi muncul setelah scan PO pertama.',
          ),
        ),
      ];
    }

    var items = validation.items;
    return [
      Column(
        children: [
          for (var i = 0; i < items.length; i++) ...[
            _historyTile(items[i], validation),
            if (i != items.length - 1)
              Divider(height: 1, color: Theme.of(context).extension<ThemeColors>()?.gray100 ?? AppTheme.gray100, indent: 46),
          ],
        ],
      ),
      if (validation.lastPage > 1)
        Padding(
          padding: const EdgeInsets.only(top: AppTheme.space4),
          child: Column(
            children: [
              Divider(height: 1, color: Theme.of(context).extension<ThemeColors>()?.gray100 ?? AppTheme.gray100),
              const SizedBox(height: AppTheme.space3),
              Row(
                children: [
                  Expanded(
                    child: AppSecondaryButton(
                      text: 'Sebelumnya',
                      height: 42,
                      isLoading: validation.isLoading,
                      onPressed: validation.canGoBack && !validation.isLoading
                          ? () =>
                                validation.goToPage(validation.currentPage - 1)
                          : null,
                    ),
                  ),
                  const SizedBox(width: AppTheme.space2),
                  Text(
                    'Halaman ${validation.currentPage}/${validation.lastPage}',
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
                      isLoading: validation.isLoading,
                      onPressed:
                          validation.canGoForward && !validation.isLoading
                          ? () =>
                                validation.goToPage(validation.currentPage + 1)
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

  Widget _historyTile(
    SjValidation session,
    ValidationProvider validation,
  ) => InkWell(
    onTap: validation.actionBusy ? null : () => widget.onOpen(session),
    borderRadius: AppTheme.radiusLg,
    child: Padding(
      padding: const EdgeInsets.symmetric(vertical: AppTheme.space3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _iconBox(
            36,
            Theme.of(context).extension<ThemeColors>()?.gray100 ?? AppTheme.gray100,
            Icons.verified_rounded,
            iconColor: Theme.of(context).extension<ThemeColors>()?.gray50 ?? AppTheme.gray500,
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
                        session.document?.poTransporter ??
                            session.scanCode ??
                            'Sesi #${session.id}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.robotoMono(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: Theme.of(context).extension<ThemeColors>()?.foreground ?? AppTheme.foreground,
                        ),
                      ),
                    ),
                    const SizedBox(width: AppTheme.space2),
                    AppBadge(
                      text: ValidationStatus.label(session.status),
                      variant: _statusVariant(session.status),
                    ),
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  '${session.validatedCount}/${session.totalItemCount} item'
                  '${session.validatorName != null ? ' • ${session.validatorName}' : ''}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.roboto(
                    fontSize: 11,
                    color: Theme.of(context).extension<ThemeColors>()?.textMuted ?? AppTheme.gray500,
                  ),
                ),
                const SizedBox(height: 1),
                Text(
                  [
                    if (session.startedAt != null)
                      _formatDateTime(session.startedAt),
                    if (session.durationSeconds != null)
                      'Durasi ${_formatDuration(session.durationSeconds)}',
                  ].join(' • '),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.roboto(
                    fontSize: 10.5,
                    color: Theme.of(context).extension<ThemeColors>()?.textMuted ?? AppTheme.gray500,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    ),
  );

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

  static String _formatDateTime(DateTime? value) {
    if (value == null) {
      return '—';
    }
    var local = value.toLocal();
    String two(int part) => part.toString().padLeft(2, '0');
    return '${two(local.day)}/${two(local.month)}/${local.year} '
        '${two(local.hour)}:${two(local.minute)}';
  }

  static String _formatDuration(int? seconds) {
    if (seconds == null || seconds < 0) {
      return '—';
    }
    var duration = Duration(seconds: seconds);
    if (duration.inHours > 0) {
      return '${duration.inHours}j ${duration.inMinutes.remainder(60)}m';
    }
    if (duration.inMinutes > 0) {
      return '${duration.inMinutes}m';
    }
    return '${duration.inSeconds}d';
  }

  static AppBadgeVariant _statusVariant(String status) => switch (status) {
    'IN_PROGRESS' => AppBadgeVariant.primary,
    'COMPLETED' => AppBadgeVariant.success,
    'CANCELLED' => AppBadgeVariant.danger,
    _ => AppBadgeVariant.gray,
  };
}
