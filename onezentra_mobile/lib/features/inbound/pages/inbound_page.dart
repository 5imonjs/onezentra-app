import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

import 'package:onezentra_mobile/core/theme/app_theme.dart';
import 'package:onezentra_mobile/features/auth/providers/auth_provider.dart';
import 'package:onezentra_mobile/features/inbound/models/inbound_models.dart';
import 'package:onezentra_mobile/features/inbound/providers/inbound_provider.dart';
import 'package:onezentra_mobile/features/inbound/repositories/inbound_repository.dart';
import 'package:onezentra_mobile/features/validation/models/validation_models.dart';
import 'package:onezentra_mobile/shared/widgets/app_widgets.dart';

/// Hasil Penerimaan — read-only inbound history from `GET /receivings`.
///
/// Searchable, paginated list; tapping a row opens the record with its
/// received lines (expected vs actual per product).
class InboundPage extends StatefulWidget {
  const InboundPage({super.key, this.repository});

  /// Injectable so tests can run the screen against a fake repository.
  final InboundRepository? repository;

  @override
  State<InboundPage> createState() => _InboundPageState();
}

class _InboundPageState extends State<InboundPage> {
  late final InboundProvider _provider = InboundProvider(
    repository: widget.repository,
  );
  final _searchController = TextEditingController();

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
            'receiving.view',
          ) ??
          false;
      _provider.bootstrap(canView: canView);
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    _provider.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) =>
      ChangeNotifierProvider<InboundProvider>.value(
        value: _provider,
        child: Builder(builder: _buildPage),
      );

  Widget _buildPage(BuildContext context) {
    var user = context.watch<AuthProvider>().user;
    var canView = user?.hasPermission('receiving.view') ?? false;
    var inbound = context.watch<InboundProvider>();

    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        title: const Text('Hasil Penerimaan'),
        elevation: 0,
        actions: [
          IconButton(
            onPressed: canView && !inbound.isLoading
                ? () => inbound.loadItems()
                : null,
            tooltip: 'Muat ulang',
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: SafeArea(
        child: !canView
            ? _buildNoAccess()
            : RefreshIndicator(
                onRefresh: inbound.loadItems,
                color: AppTheme.primary600,
                child: SingleChildScrollView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.all(AppTheme.space4),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _buildHeader(inbound),
                      const SizedBox(height: AppTheme.space4),
                      if (inbound.open != null || inbound.detailError != null)
                        _buildDetailCard(inbound)
                      else
                        _buildHistory(inbound),
                      const SizedBox(height: AppTheme.space8),
                    ],
                  ),
                ),
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
              'Anda tidak memiliki izin untuk melihat Hasil Penerimaan.',
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

  Widget _buildHeader(InboundProvider inbound) => Container(
    width: double.infinity,
    padding: const EdgeInsets.all(AppTheme.space5),
    decoration: BoxDecoration(
      gradient: const LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [AppTheme.ink900, AppTheme.ink800],
      ),
      borderRadius: AppTheme.radius2xl,
      boxShadow: [
        BoxShadow(
          color: AppTheme.ink900.withValues(alpha: 0.2),
          blurRadius: 20,
          offset: const Offset(0, 8),
        ),
      ],
    ),
    child: Row(
      children: [
        Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.1),
            borderRadius: AppTheme.radiusLg,
          ),
          child: const Icon(
            Icons.inventory_2_rounded,
            color: Colors.white,
            size: 22,
          ),
        ),
        const SizedBox(width: AppTheme.space3),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Hasil Penerimaan',
                style: GoogleFonts.roboto(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                '${inbound.total} penerimaan tercatat',
                style: GoogleFonts.roboto(
                  fontSize: 12,
                  color: AppTheme.gray400,
                ),
              ),
            ],
          ),
        ),
      ],
    ),
  );

  // ---------------------------------------------------------------------
  // History list
  // ---------------------------------------------------------------------

  Widget _buildHistory(InboundProvider inbound) => AppCard(
    padding: const EdgeInsets.all(AppTheme.space5),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        AppTextField(
          controller: _searchController,
          hint: 'Cari PO / driver...',
          prefixIcon: Icons.search_rounded,
          onChanged: inbound.setSearch,
        ),
        const SizedBox(height: AppTheme.space3),
        ..._historyBody(inbound),
      ],
    ),
  );

  List<Widget> _historyBody(InboundProvider inbound) {
    var listError = inbound.listError;
    if (listError != null) {
      return [
        SizedBox(
          width: double.infinity,
          child: AppErrorDisplay(
            message: listError,
            onRetry: inbound.loadItems,
          ),
        ),
      ];
    }

    if (inbound.isLoading && inbound.items.isEmpty) {
      return [
        Column(
          children: List.generate(
            3,
            (_) => Container(
              height: 64,
              margin: const EdgeInsets.only(bottom: AppTheme.space3),
              decoration: const BoxDecoration(
                color: AppTheme.gray100,
                borderRadius: AppTheme.radiusLg,
              ),
            ),
          ),
        ),
      ];
    }

    if (inbound.items.isEmpty) {
      return [
        SizedBox(
          width: double.infinity,
          child: AppEmptyState(
            icon: Icons.inventory_2_rounded,
            title: inbound.search.isNotEmpty
                ? 'Tidak ada hasil'
                : 'Belum ada penerimaan',
            subtitle: inbound.search.isNotEmpty
                ? 'Cari dengan kata kunci lain.'
                : 'Penerimaan muncul setelah validasi SJ selesai.',
          ),
        ),
      ];
    }

    var items = inbound.items;
    return [
      Column(
        children: [
          for (var i = 0; i < items.length; i++) ...[
            _historyTile(items[i], inbound),
            if (i != items.length - 1)
              const Divider(height: 1, color: AppTheme.gray100, indent: 46),
          ],
        ],
      ),
      if (inbound.lastPage > 1)
        Padding(
          padding: const EdgeInsets.only(top: AppTheme.space4),
          child: Column(
            children: [
              const Divider(height: 1, color: AppTheme.gray100),
              const SizedBox(height: AppTheme.space3),
              Row(
                children: [
                  Expanded(
                    child: AppSecondaryButton(
                      text: 'Sebelumnya',
                      height: 42,
                      isLoading: inbound.isLoading,
                      onPressed:
                          inbound.canGoBack && !inbound.isLoading
                          ? () => inbound.goToPage(inbound.currentPage - 1)
                          : null,
                    ),
                  ),
                  const SizedBox(width: AppTheme.space2),
                  Text(
                    'Halaman ${inbound.currentPage}/${inbound.lastPage}',
                    style: GoogleFonts.roboto(
                      fontSize: 11.5,
                      color: AppTheme.gray500,
                    ),
                  ),
                  const SizedBox(width: AppTheme.space2),
                  Expanded(
                    child: AppSecondaryButton(
                      text: 'Selanjutnya',
                      height: 42,
                      isLoading: inbound.isLoading,
                      onPressed:
                          inbound.canGoForward && !inbound.isLoading
                          ? () => inbound.goToPage(inbound.currentPage + 1)
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

  Widget _historyTile(Receiving receiving, InboundProvider inbound) =>
      InkWell(
        onTap: inbound.detailBusy
            ? null
            : () => inbound.openDetail(receiving.id),
        borderRadius: AppTheme.radiusLg,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: AppTheme.space3),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: AppTheme.gray100,
                  borderRadius: AppTheme.radiusLg,
                ),
                child: const Icon(
                  Icons.inventory_2_rounded,
                  size: 18,
                  color: AppTheme.gray500,
                ),
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
                            receiving.poTransporter ??
                                'Penerimaan #${receiving.id}',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: GoogleFonts.robotoMono(
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                              color: AppTheme.foreground,
                            ),
                          ),
                        ),
                        const SizedBox(width: AppTheme.space2),
                        AppBadge(
                          text: ReceivingStatus.label(receiving.status),
                          variant: _statusVariant(receiving.status),
                        ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${receiving.nopol ?? '-'} • ${receiving.driverName ?? '-'}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.roboto(
                        fontSize: 11,
                        color: AppTheme.gray500,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Diterima ${_formatQty(receiving.totalReceivedQty)}'
                      ' / ${_formatQty(receiving.totalExpectedQty)}',
                      style: GoogleFonts.robotoMono(
                        fontSize: 11,
                        color: AppTheme.gray400,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      );

  // ---------------------------------------------------------------------
  // Opened record
  // ---------------------------------------------------------------------

  Widget _buildDetailCard(InboundProvider inbound) {
    var detailError = inbound.detailError;
    if (detailError != null) {
      return Column(
        children: [
          SizedBox(
            width: double.infinity,
            child: AppErrorDisplay(
              message: detailError,
              onRetry: inbound.closeDetail,
              retryText: 'Kembali',
            ),
          ),
          const SizedBox(height: AppTheme.space4),
          _buildHistory(inbound),
        ],
      );
    }

    var receiving = inbound.open;
    if (receiving == null) {
      return _buildHistory(inbound);
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        AppSecondaryButton(
          text: 'Kembali ke riwayat',
          height: 44,
          leadingIcon: Icons.arrow_back_rounded,
          onPressed: inbound.detailBusy ? null : inbound.closeDetail,
        ),
        const SizedBox(height: AppTheme.space4),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(AppTheme.space4),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [AppTheme.ink900, AppTheme.ink800],
            ),
            borderRadius: AppTheme.radius2xl,
            border: Border.all(
              color: Colors.white.withValues(alpha: 0.08),
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      receiving.poTransporter ??
                          'Penerimaan #${receiving.id}',
                      style: GoogleFonts.robotoMono(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                        color: Colors.white,
                      ),
                    ),
                  ),
                  AppBadge(
                    text: ReceivingStatus.label(receiving.status),
                    variant: _statusVariant(receiving.status),
                  ),
                ],
              ),
              const SizedBox(height: AppTheme.space2),
              Text(
                '${receiving.nopol ?? '-'} • ${receiving.driverName ?? '-'}',
                style: GoogleFonts.roboto(
                  fontSize: 12,
                  color: AppTheme.gray400,
                ),
              ),
              const SizedBox(height: AppTheme.space3),
              Row(
                children: [
                  Expanded(
                    child: _darkField(
                      'Ekspektasi',
                      _formatQty(receiving.totalExpectedQty),
                    ),
                  ),
                  const SizedBox(width: AppTheme.space3),
                  Expanded(
                    child: _darkField(
                      'Diterima',
                      _formatQty(receiving.totalReceivedQty),
                      highlight: true,
                    ),
                  ),
                ],
              ),
              if (receiving.notes != null) ...[
                const SizedBox(height: AppTheme.space3),
                Text(
                  receiving.notes!,
                  style: GoogleFonts.roboto(
                    fontSize: 12,
                    height: 1.4,
                    color: AppTheme.gray300,
                  ),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: AppTheme.space4),
        AppCard(
          padding: const EdgeInsets.all(AppTheme.space5),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '${receiving.items.length} item diterima',
                style: GoogleFonts.roboto(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: AppTheme.foreground,
                ),
              ),
              const SizedBox(height: AppTheme.space3),
              if (receiving.items.isEmpty)
                Text(
                  'Tidak ada rincian item.',
                  style: GoogleFonts.roboto(
                    fontSize: 12.5,
                    color: AppTheme.gray500,
                  ),
                )
              else
                ...[
                  for (var i = 0; i < receiving.items.length; i++) ...[
                    _itemTile(receiving.items[i]),
                    if (i != receiving.items.length - 1)
                      const Divider(
                        height: 1,
                        color: AppTheme.gray100,
                        indent: 46,
                      ),
                  ],
                ],
            ],
          ),
        ),
      ],
    );
  }

  Widget _itemTile(ReceivedItem item) => Padding(
    padding: const EdgeInsets.symmetric(vertical: AppTheme.space3),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            color: (item.selisihQty ?? 0) == 0
                ? AppTheme.successWell
                : AppTheme.warningWell,
            borderRadius: AppTheme.radiusLg,
          ),
          child: Icon(
            (item.selisihQty ?? 0) == 0
                ? Icons.check_circle_rounded
                : Icons.warning_rounded,
            size: 18,
            color: (item.selisihQty ?? 0) == 0
                ? AppTheme.success
                : AppTheme.warningText,
          ),
        ),
        const SizedBox(width: AppTheme.space3),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                item.namaBarang ?? item.kodeBarang ?? '-',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: GoogleFonts.roboto(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: AppTheme.foreground,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                'Ekspektasi ${_formatQty(item.expectedQty)}'
                ' • Diterima ${_formatQty(item.actualQty)}'
                '${item.satuan != null ? ' ${item.satuan}' : ''}',
                style: GoogleFonts.robotoMono(
                  fontSize: 11,
                  color: AppTheme.gray500,
                ),
              ),
              // Same story as the selisih email: signed difference, the
              // server reason, condition and expiry per line.
              if ((item.selisihQty ?? 0) != 0)
                Text(
                  'Selisih ${_formatSigned(item.selisihQty!)}'
                  '${item.selisihReason != null ? ' • ${item.selisihReason}' : ''}',
                  style: GoogleFonts.roboto(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.warningText,
                  ),
                ),
              if (item.condition != null || item.expiredDate != null)
                Text(
                  [
                    if (item.condition != null)
                      _conditionLabel(item.condition!),
                    if (item.expiredDate != null)
                      'Exp ${_formatDate(item.expiredDate!)}',
                  ].join(' • '),
                  style: GoogleFonts.roboto(
                    fontSize: 11,
                    color: AppTheme.gray400,
                  ),
                ),
            ],
          ),
        ),
      ],
    ),
  );

  Widget _darkField(String label, String value, {bool highlight = false}) =>
      Container(
        padding: const EdgeInsets.symmetric(
          horizontal: AppTheme.space3,
          vertical: AppTheme.space2,
        ),
        decoration: highlight
            ? const BoxDecoration(
                color: Colors.white,
                borderRadius: AppTheme.radiusLg,
              )
            : BoxDecoration(
                color: Colors.white.withValues(alpha: 0.07),
                borderRadius: AppTheme.radiusLg,
                border: Border.all(
                  color: Colors.white.withValues(alpha: 0.08),
                ),
              ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: GoogleFonts.roboto(
                fontSize: 10,
                fontWeight: FontWeight.w500,
                color: highlight ? AppTheme.gray500 : AppTheme.gray400,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              value,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: GoogleFonts.robotoMono(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: highlight ? AppTheme.gray900 : Colors.white,
              ),
            ),
          ],
        ),
      );

  static String _formatQty(double? value) {
    if (value == null) {
      return '-';
    }
    return value == value.truncateToDouble()
        ? '${value.toInt()}'
        : '$value';
  }

  /// Signed qty like the selisih email (`+5`, `-3`).
  static String _formatSigned(double value) {
    var body = _formatQty(value.abs());
    if (value > 0) {
      return '+$body';
    }
    if (value < 0) {
      return '-$body';
    }
    return body;
  }

  /// Canonical `FISIK_*` vocabulary plus the legacy receiving values, so
  /// the line reads the same as on web and in the email.
  static String _conditionLabel(String condition) {
    if (ValidationCondition.values.contains(condition)) {
      return ValidationCondition.label(condition);
    }
    return switch (condition) {
      'GOOD' => 'Bagus',
      'DAMAGED' => 'Rusak',
      'MISSING' => 'Hilang',
      'LESS' => 'Kurang',
      'NOT GOOD' => 'Tidak bagus',
      _ => condition,
    };
  }

  static String _formatDate(String raw) {
    var date = DateTime.tryParse(raw);
    if (date == null) {
      return raw;
    }
    return '${date.day.toString().padLeft(2, '0')}/'
        '${date.month.toString().padLeft(2, '0')}/${date.year}';
  }

  static AppBadgeVariant _statusVariant(String status) =>
      switch (status) {
        'PENDING' => AppBadgeVariant.warning,
        'IN_PROGRESS' => AppBadgeVariant.primary,
        'COMPLETED' => AppBadgeVariant.success,
        'CANCELLED' => AppBadgeVariant.danger,
        _ => AppBadgeVariant.gray,
      };
}
