import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'package:onezentra_mobile/core/theme/app_theme.dart';
import 'package:onezentra_mobile/features/home/models/reminder_models.dart';
import 'package:onezentra_mobile/features/home/repositories/reminder_repository.dart';

/// Banner reminder pada beranda mobile.
///
/// Tidak memakai push notification: data di-fetch saat halaman dibuka supaya
/// angka keterlambatan selalu sama dengan dashboard web (satu endpoint API).
class ReminderBanner extends StatefulWidget {
  ReminderBanner({super.key, ReminderRepository? repository})
    : repository = repository ?? ReminderRepository();

  final ReminderRepository repository;

  @override
  State<ReminderBanner> createState() => _ReminderBannerState();
}

class _ReminderBannerState extends State<ReminderBanner> {
  ReminderSummary? _summary;
  String? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (!mounted) {
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      var summary = await widget.repository.fetch();
      if (!mounted) {
        return;
      }
      setState(() {
        _summary = summary;
        _loading = false;
      });
    } on Object {
      if (!mounted) {
        return;
      }
      setState(() {
        _error = 'Gagal memuat reminder.';
        _loading = false;
      });
    }
  }

  String _routeFor(String key) {
    switch (key) {
      case 'sj_validation':
        return '/validasi-sj';
      case 'gate':
        return '/gate';
      default:
        return '/riwayat';
    }
  }

  String _formatElapsed(int minutes) {
    if (minutes < 60) {
      return '$minutes mnt';
    }
    var hours = minutes ~/ 60;
    var rest = minutes % 60;
    return rest == 0 ? '$hours jam' : '$hours jam $rest mnt';
  }

  @override
  Widget build(BuildContext context) {
    if (_loading || _summary == null) {
      if (_error == null) {
        return const SizedBox.shrink();
      }
      return Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: context.colors.warningWell,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            Icon(
              Icons.warning_amber_rounded,
              size: 18,
              color: context.colors.warning,
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                _error!,
                style: TextStyle(color: context.colors.warningText),
              ),
            ),
            IconButton(
              icon: const Icon(Icons.refresh_rounded),
              tooltip: 'Coba lagi',
              color: context.colors.warning,
              onPressed: _load,
            ),
          ],
        ),
      );
    }

    var summary = _summary!;
    if (summary.total == 0 || summary.groups.isEmpty) {
      return const SizedBox.shrink();
    }

    var colors = context.colors;
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.warning.withValues(alpha: 0.4)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(AppTheme.space4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.schedule_rounded, color: colors.warning),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Proses Tertunda',
                        style: TextStyle(
                          fontWeight: FontWeight.w700,
                          color: colors.textPrimary,
                        ),
                      ),
                      Text(
                        'Belum selesai > ${summary.thresholdMinutes} menit',
                        style: TextStyle(
                          fontSize: 12,
                          color: colors.warningText,
                        ),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: colors.warningWell,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    '${summary.total} item',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: colors.warningText,
                    ),
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.refresh_rounded),
                  tooltip: 'Muat ulang reminder',
                  color: colors.warning,
                  onPressed: _load,
                ),
              ],
            ),
            const SizedBox(height: 8),
            ...summary.groups.expand(
              (group) => [
                Padding(
                  padding: const EdgeInsets.only(top: 6, bottom: 4),
                  child: Text(
                    '${group.label} · ${group.count}',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: colors.textPrimary,
                    ),
                  ),
                ),
                ...group.items.map(
                  (item) => ListTile(
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    leading: Icon(
                      Icons.access_time_rounded,
                      size: 18,
                      color: colors.warning,
                    ),
                    title: Text(
                      item.title,
                      style: TextStyle(color: colors.textPrimary),
                    ),
                    subtitle: Text(
                      item.subtitle,
                      style: const TextStyle(fontSize: 12),
                    ),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 3,
                          ),
                          decoration: BoxDecoration(
                            color: colors.warningWell,
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Text(
                            _formatElapsed(item.elapsedMinutes),
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              color: colors.warningText,
                            ),
                          ),
                        ),
                        const Icon(Icons.chevron_right_rounded, size: 18),
                      ],
                    ),
                    onTap: () => context.push(_routeFor(group.key)),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
