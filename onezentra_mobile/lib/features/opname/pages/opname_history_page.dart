import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

import 'package:onezentra_mobile/core/network/api_client.dart';
import 'package:onezentra_mobile/core/theme/app_theme.dart';
import 'package:onezentra_mobile/features/auth/providers/auth_provider.dart';
import 'package:onezentra_mobile/features/opname/models/opname_expired_session_models.dart';
import 'package:onezentra_mobile/features/opname/repositories/opname_expired_session_repository.dart';
import 'package:onezentra_mobile/shared/widgets/app_widgets.dart';

/// Riwayat sesi opname untuk menu Riwayat terpadu.
///
/// Menampilkan ID sesi, petugas yang mengerjakan, periode, status, dan jumlah
/// batch. Mengetuk baris membuka detail hasil hitung per batch tanpa harus
/// meninggalkan menu Riwayat.
class OpnameHistoryPage extends StatefulWidget {
  const OpnameHistoryPage({super.key, this.repository, this.embedded = false});

  final OpnameExpiredSessionRepository? repository;
  final bool embedded;

  @override
  State<OpnameHistoryPage> createState() => _OpnameHistoryPageState();
}

class _OpnameHistoryPageState extends State<OpnameHistoryPage> {
  late final OpnameExpiredSessionRepository _repository =
      widget.repository ?? OpnameExpiredSessionRepository();
  List<OpnameExpiredSession> _sessions = const [];
  bool _loading = false;
  String? _error;
  bool _bootstrapped = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted) {
        return;
      }
      var canView =
          context.read<AuthProvider>().user?.hasPermission(
            'opname.session.view',
          ) ??
          false;
      if (canView) {
        await load();
      } else {
        _bootstrapped = true;
      }
    });
  }

  Future<void> load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      var sessions = await _repository.history();
      if (!mounted) {
        return;
      }
      setState(() => _sessions = sessions);
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => _error = e.message);
      }
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Gagal memuat riwayat opname.');
      }
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
          _bootstrapped = true;
        });
      }
    }
  }

  Future<void> _openDetail(OpnameExpiredSession session) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (_) =>
          _OpnameHistoryDetail(repository: _repository, session: session),
    );
  }

  @override
  Widget build(BuildContext context) {
    var canView =
        context.watch<AuthProvider>().user?.hasPermission(
          'opname.session.view',
        ) ??
        false;
    var colors = context.colors;

    Widget content;
    if (!canView) {
      content = Padding(
        padding: const EdgeInsets.all(AppTheme.space4),
        child: Text(
          'Anda tidak memiliki izin untuk melihat Riwayat Opname.',
          style: GoogleFonts.roboto(fontSize: 13, color: colors.textSecondary),
        ),
      );
    } else if (!_bootstrapped && _loading) {
      content = const Center(child: CircularProgressIndicator());
    } else if (_error != null && _sessions.isEmpty) {
      content = AppErrorDisplay(
        message: _error!,
        onRetry: load,
        retryText: 'Coba Lagi',
      );
    } else if (_sessions.isEmpty) {
      content = const AppEmptyState(
        icon: Icons.history_rounded,
        title: 'Belum ada riwayat opname',
        subtitle: 'Sesi yang sudah dikirim atau disetujui tampil di sini.',
      );
    } else {
      content = RefreshIndicator(
        onRefresh: load,
        color: AppTheme.primary600,
        child: ListView.separated(
          padding: const EdgeInsets.all(AppTheme.space3),
          itemCount: _sessions.length,
          separatorBuilder: (_, index) => const SizedBox(height: 8),
          itemBuilder: (_, index) {
            var session = _sessions[index];
            var total = session.itemsCount ?? session.items.length;
            var done =
                session.verifiedCount ??
                session.items.where((i) => i.isVerified).length;
            return AppCard(
              padding: const EdgeInsets.all(10),
              onTap: () => _openDetail(session),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(
                        'SESI #${session.id}',
                        style: GoogleFonts.robotoMono(
                          fontSize: 12,
                          fontWeight: FontWeight.w800,
                          color: AppTheme.primary600,
                        ),
                      ),
                      const Spacer(),
                      AppBadge(
                        text: OpnameSessionStatus.label(session.status),
                        variant: _badgeVariant(session.status),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Minggu ${_formatDate(session.weekStart)} · ${session.namaDepo ?? session.kodeDepo ?? '-'}',
                    style: GoogleFonts.roboto(
                      fontSize: 11,
                      color: colors.textSecondary,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Row(
                    children: [
                      Icon(
                        Icons.person_rounded,
                        size: 13,
                        color: colors.textMuted,
                      ),
                      const SizedBox(width: 4),
                      Expanded(
                        child: Text(
                          session.assigneeName ??
                              (session.assignedTo != null
                                  ? 'Petugas #${session.assignedTo}'
                                  : 'Petugas tidak tercatat'),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: GoogleFonts.roboto(
                            fontSize: 11.5,
                            fontWeight: FontWeight.w600,
                            color: colors.foreground,
                          ),
                        ),
                      ),
                      Text(
                        '$done/$total batch',
                        style: GoogleFonts.roboto(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: colors.textMuted,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            );
          },
        ),
      );
    }

    if (widget.embedded) {
      return content;
    }
    return Scaffold(
      backgroundColor: colors.background,
      appBar: AppBar(title: const Text('Riwayat Opname'), elevation: 0),
      body: SafeArea(child: content),
    );
  }

  AppBadgeVariant _badgeVariant(String status) => switch (status) {
    'APPROVED' || 'COMPLETED' => AppBadgeVariant.success,
    'CANCELLED' => AppBadgeVariant.danger,
    'REVISI' => AppBadgeVariant.critical,
    _ => AppBadgeVariant.info,
  };

  String _formatDate(String? iso) {
    if (iso == null || iso.isEmpty) {
      return '-';
    }
    var parsed = DateTime.tryParse(iso);
    if (parsed == null) {
      return iso;
    }
    String two(String value) => value.padLeft(2, '0');
    return '${two(parsed.day.toString())}/${two(parsed.month.toString())}/${parsed.year}';
  }
}

/// Detail hasil opname satu sesi, dimuat dari GET /opname-sessions/{id}.
class _OpnameHistoryDetail extends StatefulWidget {
  const _OpnameHistoryDetail({required this.repository, required this.session});

  final OpnameExpiredSessionRepository repository;
  final OpnameExpiredSession session;

  @override
  State<_OpnameHistoryDetail> createState() => _OpnameHistoryDetailState();
}

class _OpnameHistoryDetailState extends State<_OpnameHistoryDetail> {
  OpnameExpiredSession? _detail;
  String? _error;

  @override
  void initState() {
    super.initState();
    widget.repository
        .show(widget.session.id)
        .then((detail) {
          if (mounted) {
            setState(() => _detail = detail);
          }
        })
        .catchError((_) {
          if (mounted) {
            setState(() => _error = 'Detail opname gagal dimuat.');
          }
        });
  }

  @override
  Widget build(BuildContext context) {
    var colors = context.colors;
    var detail = _detail ?? widget.session;
    var items = detail.items;
    var total = detail.itemsCount ?? items.length;
    var done = detail.verifiedCount ?? items.where((i) => i.isVerified).length;

    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: Container(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.of(context).size.height * 0.88,
        ),
        decoration: BoxDecoration(
          color: colors.background,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: SafeArea(
          top: false,
          child: RefreshIndicator(
            onRefresh: () async {
              var fresh = await widget.repository.show(widget.session.id);
              if (mounted) {
                setState(() => _detail = fresh);
              }
            },
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 20),
              children: [
                Center(
                  child: Container(
                    width: 36,
                    height: 4,
                    decoration: BoxDecoration(
                      color: colors.border,
                      borderRadius: BorderRadius.circular(99),
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        'HASIL SESI #${detail.id}',
                        style: GoogleFonts.roboto(
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          color: colors.foreground,
                        ),
                      ),
                    ),
                    IconButton(
                      onPressed: () => Navigator.of(context).pop(),
                      tooltip: 'Tutup',
                      icon: Icon(Icons.close_rounded, color: colors.textMuted),
                    ),
                  ],
                ),
                if (_error != null)
                  Text(
                    _error!,
                    style: GoogleFonts.roboto(
                      color: colors.danger,
                      fontSize: 12,
                    ),
                  ),
                const SizedBox(height: 4),
                Text(
                  'Petugas: ${detail.assigneeName ?? (detail.assignedTo != null ? 'Petugas #${detail.assignedTo}' : '-')}',
                  style: GoogleFonts.roboto(
                    fontSize: 12,
                    color: colors.textSecondary,
                  ),
                ),
                Text(
                  'Status: ${OpnameSessionStatus.label(detail.status)} · $done/$total batch dihitung',
                  style: GoogleFonts.roboto(
                    fontSize: 12,
                    color: colors.textSecondary,
                  ),
                ),
                const SizedBox(height: 12),
                if (_detail == null && _error == null)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 32),
                    child: Center(child: CircularProgressIndicator()),
                  )
                else if (items.isEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 24),
                    child: Text(
                      'Tidak ada baris hasil opname pada sesi ini.',
                      style: GoogleFonts.roboto(
                        fontSize: 12,
                        color: colors.textMuted,
                      ),
                    ),
                  )
                else
                  for (var item in items) ...[
                    Container(
                      padding: const EdgeInsets.all(10),
                      margin: const EdgeInsets.only(bottom: 8),
                      decoration: BoxDecoration(
                        color: colors.surfaceCard,
                        borderRadius: AppTheme.radiusLg,
                        border: Border.all(color: colors.border),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            item.batchNumber ??
                                item.kodeBarang ??
                                'Batch #${item.id}',
                            style: GoogleFonts.robotoMono(
                              fontSize: 12,
                              fontWeight: FontWeight.w800,
                              color: colors.foreground,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'Fisik CRT ${_qty(item.qtyFisikCrt)} · PCS ${_qty(item.qtyFisikPcs)}'
                            ' · Acuan ${_qty(item.expectedCrt)} CRT',
                            style: GoogleFonts.roboto(
                              fontSize: 11,
                              color: colors.textSecondary,
                            ),
                          ),
                          Text(
                            'Terima ${_iso(item.tanggalPenerimaan)} · Exp ${_iso(item.expiredDateIni)}',
                            style: GoogleFonts.roboto(
                              fontSize: 11,
                              color: colors.textMuted,
                            ),
                          ),
                          if (item.notes != null && item.notes!.isNotEmpty)
                            Text(
                              'Catatan: ${item.notes}',
                              style: GoogleFonts.roboto(
                                fontSize: 11,
                                color: colors.textMuted,
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  String _qty(double? value) => value == null
      ? '-'
      : value == value.roundToDouble()
      ? value.toInt().toString()
      : value.toStringAsFixed(2);

  String _iso(String? value) {
    if (value == null || value.isEmpty) {
      return '-';
    }
    var parsed = DateTime.tryParse(value);
    if (parsed == null) {
      return value;
    }
    String two(String v) => v.padLeft(2, '0');
    return '${two(parsed.day.toString())}/${two(parsed.month.toString())}/${parsed.year}';
  }
}
