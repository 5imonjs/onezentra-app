/// Kartu "Standar umur produk" + popup pemeriksaan umur — padanan blok
/// `DATABASE` dan `Standar Umur Popup` di
/// `onezentra-web/src/app/validasi-sj/page.tsx`.
///
/// Kenapa satu berkas untuk ketiganya: kartu di dalam sheet dan isi popup
/// memakai angka yang sama dengan nada warna yang sama. Kalau dipisah, satu
/// sisi akan menyimpang begitu standar atau ambang warna berubah — dan
/// operator yang membandingkan keduanya akan melihat dua jawaban berbeda untuk
/// pertanyaan yang sama.
library;

import 'package:flutter/material.dart';
import 'package:onezentra_mobile/features/validation/models/validation_models.dart';
import 'package:onezentra_mobile/theme/app_colors.dart';

/// Judul bagian dengan batang aksen warna — `h-5 w-1 rounded-full
/// bg-primary-500` + judul kapital di web ("Data pemeriksaan", "Identifikasi &
/// kondisi").
class SheetSectionTitle extends StatelessWidget {
  const SheetSectionTitle(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 4,
          height: 20,
          decoration: BoxDecoration(
            color: AppColors.primary500,
            borderRadius: BorderRadius.circular(999),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            text.toUpperCase(),
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w900,
              letterSpacing: 1.1,
              color: AppColors.gray800,
            ),
          ),
        ),
      ],
    );
  }
}

/// Kartu ringkasan umur: standar database, sisa simpan, dan selisih —
/// ditunjukkan di dalam sheet tepat di bawah form tanggal expired.
class ShelfLifeCard extends StatelessWidget {
  const ShelfLifeCard({super.key, required this.report});

  /// Null saat tanggal expired belum diisi: kartu então menampilkan perintah,
  /// bukan angka nol palsu.
  final ShelfLifeReport? report;

  @override
  Widget build(BuildContext context) {
    final data = report;
    final expired = data?.isExpired ?? false;
    final short = data?.isShort ?? false;
    final border = expired
        ? AppColors.errorBorder
        : short
        ? AppColors.warningBorder
        : AppColors.primary200;
    final background = expired
        ? AppColors.errorBg
        : short
        ? AppColors.warningBg
        : AppColors.primary50;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: background,
        border: Border.all(color: border),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Standar umur produk',
                      style: TextStyle(
                        fontSize: 11.5,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 1.2,
                        color: AppColors.gray500,
                      ),
                    ),
                    SizedBox(height: 2),
                    Text(
                      'Acuan database dalam bulan',
                      style: TextStyle(
                        fontSize: 11.5,
                        color: AppColors.gray500,
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
                  color: AppColors.card,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: const Text(
                  'DATABASE',
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                    color: AppColors.primary700,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: _Metric(
                  label: 'Standar',
                  value: data == null || !data.hasStandard
                      ? '-'
                      : '${data.standardMonths}',
                  unit: 'bulan',
                ),
              ),
              Expanded(
                child: _Metric(
                  label: 'Sisa simpan',
                  value: data == null ? '-' : '${data.months}',
                  unit: 'bulan',
                  valueColor: data == null
                      ? AppColors.gray900
                      : expired
                      ? AppColors.errorText
                      : short
                      ? AppColors.amber700
                      : AppColors.success,
                ),
              ),
              Expanded(
                child: _Metric(
                  label: 'Selisih',
                  value: data?.selisih ?? '-',
                  caption: 'hari . bulan . tahun',
                  valueColor: data == null
                      ? AppColors.gray900
                      : (data.selisih?.startsWith('-') ?? false)
                      ? AppColors.amber700
                      : AppColors.success,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            data == null
                ? 'Isi tanggal expired untuk melihat perbandingan.'
                : shelfLifeVerdictText(data, popup: false),
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: AppColors.gray600,
            ),
          ),
        ],
      ),
    );
  }
}

/// Popup "Standar Umur Produk" — dibuka otomatis begitu operator memilih
/// tanggal expired (`showUmurPopup` di web). Menampilkan perbandingan lengkap
/// dengan bilah persentase, ditutup lewat tombol "Pahami".
Future<void> showShelfLifePopup(
  BuildContext context, {
  required ShelfLifeReport report,
  required String kodeBarang,
  required String namaBarang,
  required String expiredLabel,
}) {
  return showDialog<void>(
    context: context,
    builder: (ctx) => Dialog(
      insetPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 32),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      clipBehavior: Clip.antiAlias,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 460, maxHeight: 680),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _PopupHeader(
              kodeBarang: kodeBarang,
              namaBarang: namaBarang,
              onClose: () => Navigator.of(ctx).pop(),
            ),
            Flexible(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // `IntrinsicHeight` supaya dua kartu sama tinggi tanpa
                    // `CrossAxisAlignment.stretch` langsung: di dalam
                    // `SingleChildScrollView` tinggi tak terbatas, jadi
                    // `stretch` akan meminta tinggi tak terbatas juga.
                    IntrinsicHeight(
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Expanded(
                            child: _PopupTile(
                              caption: 'Standar database',
                              value: report.hasStandard
                                  ? '${report.standardMonths} bulan'
                                  : '-',
                              footnote: report.hasStandard
                                  ? 'Standar minimum dalam bulan'
                                  : 'Data tidak tersedia',
                              emphasis: true,
                              tint: AppColors.primary50,
                              border: AppColors.primary200,
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: _PopupTile(
                              caption: 'Tanggal expired',
                              value: expiredLabel,
                              footnote: 'Tanggal acuan perhitungan',
                              tint: AppColors.gray50,
                              border: AppColors.gray200,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                    _PopupResult(report: report),
                    const SizedBox(height: 16),
                    _RatioBar(report: report),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
              child: SizedBox(
                width: double.infinity,
                child: FilledButton(
                  key: const Key('item-umur-popup-ack'),
                  onPressed: () => Navigator.of(ctx).pop(),
                  style: FilledButton.styleFrom(
                    minimumSize: const Size.fromHeight(48),
                    backgroundColor: AppColors.primary600,
                  ),
                  child: const Text('Pahami'),
                ),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

class _PopupHeader extends StatelessWidget {
  const _PopupHeader({
    required this.kodeBarang,
    required this.namaBarang,
    required this.onClose,
  });

  final String kodeBarang;
  final String namaBarang;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      color: AppColors.gray900,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: AppColors.primary400.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(
              Icons.schedule,
              color: AppColors.primary300,
              size: 20,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'PEMERIKSAAN UMUR',
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1.8,
                    color: AppColors.primary300,
                  ),
                ),
                const SizedBox(height: 4),
                const Text(
                  'Standar Umur Produk',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w900,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  kodeBarang,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 11.5,
                    color: AppColors.gray400,
                    fontFamily: 'monospace',
                  ),
                ),
                Text(
                  namaBarang,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 11.5,
                    color: AppColors.gray400,
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            key: const Key('item-umur-popup-close'),
            onPressed: onClose,
            tooltip: 'Tutup',
            icon: const Icon(Icons.close, color: AppColors.gray400, size: 20),
          ),
        ],
      ),
    );
  }
}

class _PopupTile extends StatelessWidget {
  const _PopupTile({
    required this.caption,
    required this.value,
    required this.footnote,
    required this.tint,
    required this.border,
    this.emphasis = false,
  });

  final String caption;
  final String value;
  final String footnote;
  final Color tint;
  final Color border;
  final bool emphasis;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: tint,
        border: Border.all(color: border),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            caption.toUpperCase(),
            style: const TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.8,
              color: AppColors.gray500,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: emphasis ? 15 : 16,
              fontWeight: FontWeight.w900,
              color: AppColors.gray900,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            footnote,
            maxLines: 2,
            style: const TextStyle(fontSize: 11, color: AppColors.gray500),
          ),
        ],
      ),
    );
  }
}

class _PopupResult extends StatelessWidget {
  const _PopupResult({required this.report});

  final ShelfLifeReport report;

  @override
  Widget build(BuildContext context) {
    final (Color background, Color foreground, Color border) = switch ((
      report.hasStandard,
      report.isExpired,
      report.isShort,
    )) {
      (false, _, _) => (
        AppColors.gray200,
        AppColors.gray700,
        AppColors.gray200,
      ),
      (true, true, _) => (
        AppColors.red200,
        AppColors.red700,
        AppColors.errorBorder,
      ),
      (true, false, true) => (
        AppColors.amber200,
        AppColors.amber900,
        AppColors.warningBorder,
      ),
      _ => (
        AppColors.successBorder,
        AppColors.success,
        AppColors.successBorder,
      ),
    };

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: report.isExpired
            ? AppColors.errorBg
            : report.isShort
            ? AppColors.warningBg
            : report.hasStandard
            ? AppColors.successBg
            : AppColors.warningBg,
        border: Border.all(color: border),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'HASIL PEMERIKSAAN',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.8,
                        color: AppColors.gray500,
                      ),
                    ),
                    SizedBox(height: 2),
                    Text(
                      'Sisa umur produk',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: AppColors.gray800,
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
                  color: background,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  report.verdict,
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w900,
                    color: foreground,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: _Metric(
                  label: 'Sisa simpan',
                  value: '${report.months}',
                  unit: 'bulan',
                  valueColor: report.isExpired
                      ? AppColors.errorText
                      : report.isShort
                      ? AppColors.amber700
                      : AppColors.success,
                ),
              ),
              Expanded(
                child: _Metric(
                  label: 'Standar',
                  value: report.hasStandard ? '${report.standardMonths}' : '-',
                  unit: 'bulan',
                  valueColor: report.hasStandard
                      ? AppColors.gray800
                      : AppColors.gray300,
                ),
              ),
              Expanded(
                child: _Metric(
                  label: 'Selisih',
                  value: report.hasStandard ? report.selisih ?? '-' : '-',
                  caption: 'hari . bulan . tahun',
                  valueColor: !report.hasStandard
                      ? AppColors.gray400
                      : report.isExpired
                      ? AppColors.errorText
                      : (report.selisih?.startsWith('-') ?? false)
                      ? AppColors.amber700
                      : AppColors.success,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            shelfLifeVerdictText(report, popup: true),
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: report.isExpired
                  ? AppColors.errorText
                  : report.isShort
                  ? AppColors.amber700
                  : report.hasStandard
                  ? AppColors.success
                  : AppColors.gray500,
            ),
          ),
        ],
      ),
    );
  }
}

class _RatioBar extends StatelessWidget {
  const _RatioBar({required this.report});

  final ShelfLifeReport report;

  @override
  Widget build(BuildContext context) {
    final percent = report.hasStandard ? report.ratioPercent.clamp(0, 100) : 0;
    final color = !report.hasStandard
        ? AppColors.gray400
        : report.isExpired
        ? AppColors.errorText
        : report.isShort
        ? AppColors.amber500
        : AppColors.success;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.card,
        border: Border.all(color: AppColors.gray200),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Perbandingan terhadap standar',
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.8,
                  color: AppColors.gray400,
                ),
              ),
              Text(
                report.hasStandard ? '$percent%' : '-',
                style: const TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                  color: AppColors.gray400,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: percent / 100,
              minHeight: 10,
              backgroundColor: AppColors.gray100,
              valueColor: AlwaysStoppedAnimation<Color>(color),
            ),
          ),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                '0 bulan',
                style: TextStyle(fontSize: 10, color: AppColors.gray400),
              ),
              Text(
                report.hasStandard
                    ? 'Standar ${report.standardMonths} bulan'
                    : 'Data standar tidak tersedia',
                style: const TextStyle(fontSize: 10, color: AppColors.gray400),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Metric extends StatelessWidget {
  const _Metric({
    required this.label,
    required this.value,
    this.unit,
    this.caption,
    this.valueColor = AppColors.gray900,
  });

  final String label;
  final String value;
  final String? unit;
  final String? caption;
  final Color valueColor;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(fontSize: 10.5, color: AppColors.gray500),
        ),
        const SizedBox(height: 2),
        Text(
          value,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            fontSize: 19,
            fontWeight: FontWeight.w900,
            color: valueColor,
          ),
        ),
        Text(
          caption ?? unit ?? '',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontSize: 10, color: AppColors.gray500),
        ),
      ],
    );
  }
}
