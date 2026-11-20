import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:onezentra_mobile/core/network/api_client.dart';
import 'package:onezentra_mobile/core/theme/app_theme.dart';
import 'package:onezentra_mobile/features/home/models/reminder_models.dart';
import 'package:onezentra_mobile/features/home/repositories/reminder_repository.dart';

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

/// Kartu ringkas di beranda yang membuka bottom sheet berisi daftar proses
/// tertunda. Tidak memakai push notification: data di-fetch saat halaman
/// dibuka, saat app kembali aktif, dan tiap 5 menit.
class ReminderBanner extends StatefulWidget {
  ReminderBanner({super.key, ReminderRepository? repository})
    : repository = repository ?? ReminderRepository();

  final ReminderRepository repository;

  @override
  State<ReminderBanner> createState() => _ReminderBannerState();
}

class _ReminderBannerState extends State<ReminderBanner>
    with WidgetsBindingObserver {
  static const pollInterval = Duration(minutes: 5);
  static const autoShownKey = 'reminder_last_auto_shown';

  ReminderSummary? _summary;
  String? _error;
  bool _loading = false;
  Timer? _pollTimer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _load();
    _pollTimer = Timer.periodic(pollInterval, (_) => _load());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _pollTimer?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _load();
    }
  }

  Future<void> _load({bool force = false}) async {
    if (!force && _loading) {
      return;
    }
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
      if (summary.total > 0) {
        unawaited(_maybeAutoOpen(summary));
      }
    } on ApiException catch (e) {
      if (!mounted) {
        return;
      }
      setState(() {
        _error = e.message;
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

  /// Buka sekali sehari saat ada proses tertunda — terasa seperti popup,
  /// tapi tidak mengganggu setiap kali halaman beranda dirender.
  Future<void> _maybeAutoOpen(ReminderSummary summary) async {
    try {
      var prefs = await SharedPreferences.getInstance();
      var today = DateTime.now().toIso8601String().substring(0, 10);
      if (prefs.getString(autoShownKey) == today) {
        return;
      }
      await prefs.setString(autoShownKey, today);
      if (mounted) {
        _openSheet(summary);
      }
    } on Object {
      // SharedPreferences gagal dibaca: lewati auto-open, kartu tetap tampil.
    }
  }

  void _openSheet(ReminderSummary summary) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) => _ReminderSheet(
        summary: summary,
        onOpen: (route) {
          Navigator.of(sheetContext).pop();
          context.push(route);
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_error != null) {
      return Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: context.colors.warningWell,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: context.colors.warning.withValues(alpha: 0.4),
          ),
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
              onPressed: () => _load(force: true),
            ),
          ],
        ),
      );
    }

    var summary = _summary;
    if (_loading || summary == null || summary.total == 0) {
      return const SizedBox.shrink();
    }

    var colors = context.colors;
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.warning.withValues(alpha: 0.45)),
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: () => _openSheet(summary),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: colors.warningWell,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(
                    Icons.notifications_active_rounded,
                    color: colors.warning,
                  ),
                ),
                const SizedBox(width: 12),
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
                      const SizedBox(height: 2),
                      Text(
                        '${summary.total} item · belum selesai > ${summary.thresholdMinutes} menit',
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
                    vertical: 5,
                  ),
                  decoration: BoxDecoration(
                    color: colors.warningWell,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    'Lihat',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: colors.warningText,
                    ),
                  ),
                ),
                const SizedBox(width: 2),
                Icon(
                  Icons.chevron_right_rounded,
                  size: 18,
                  color: colors.warning,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ReminderSheet extends StatelessWidget {
  const _ReminderSheet({required this.summary, required this.onOpen});

  final ReminderSummary summary;
  final void Function(String route) onOpen;

  @override
  Widget build(BuildContext context) {
    var colors = context.colors;
    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.8,
      ),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const SizedBox(height: 10),
          Container(
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: colors.warning.withValues(alpha: 0.5),
              borderRadius: BorderRadius.circular(999),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 14, 12, 12),
            child: Row(
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
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                          color: colors.textPrimary,
                        ),
                      ),
                      Text(
                        'Belum selesai > ${summary.thresholdMinutes} menit · ${summary.total} item',
                        style: TextStyle(
                          fontSize: 12,
                          color: colors.warningText,
                        ),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close_rounded),
                  tooltip: 'Tutup',
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ],
            ),
          ),
          Divider(height: 1, color: colors.warning.withValues(alpha: 0.2)),
          Flexible(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: summary.groups
                    .expand(
                      (group) => [
                        Padding(
                          padding: const EdgeInsets.only(top: 6, bottom: 6),
                          child: Row(
                            children: [
                              Container(
                                width: 8,
                                height: 8,
                                decoration: BoxDecoration(
                                  color: colors.warning,
                                  shape: BoxShape.circle,
                                ),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  group.label,
                                  style: TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w700,
                                    color: colors.textPrimary,
                                  ),
                                ),
                              ),
                              Text(
                                '${group.count} item',
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
                                  color: colors.warningText,
                                ),
                              ),
                            ],
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
                                const Icon(
                                  Icons.chevron_right_rounded,
                                  size: 18,
                                ),
                              ],
                            ),
                            onTap: () => onOpen(_routeFor(group.key)),
                          ),
                        ),
                      ],
                    )
                    .toList(),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
            child: SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: () => Navigator.of(context).pop(),
                child: const Text('Tutup'),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
