import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:onezentra_mobile/core/api_client.dart';
import 'package:onezentra_mobile/features/auth/auth_provider.dart';
import 'package:onezentra_mobile/features/standarisasi/models/standarisasi_models.dart';
import 'package:onezentra_mobile/features/standarisasi/standarisasi_provider.dart';
import 'package:onezentra_mobile/features/standarisasi/standarisasi_service.dart';
import 'package:onezentra_mobile/theme/app_colors.dart';
import 'package:onezentra_mobile/widgets/draggable_sheet.dart';
import 'package:onezentra_mobile/widgets/states.dart';
import 'package:onezentra_mobile/widgets/status_pill.dart';

/// Form "Tambah Standarisasi" — padanan modal `Tambah Standarisasi` di web:
/// pilih produk (BOS ID / nama), isi tier + tinggi tumpukan, lihat pratinjau
/// perhitungan, lalu simpan sebagai `pending`.
///
/// [initialProduct] dipakai untuk alur dari Validasi Dokumen: produk yang
/// operator baru pindai sudah terpilih, jadi ia cukup mengisi dimensi — sama
/// seperti `?productId=` di `standarisasi/page.tsx`.
class StandarisasiCreateSheet extends StatefulWidget {
  const StandarisasiCreateSheet({super.key, this.service, this.initialProduct});

  final StandarisasiService? service;
  final NpnProduct? initialProduct;

  @override
  State<StandarisasiCreateSheet> createState() =>
      _StandarisasiCreateSheetState();
}

class _StandarisasiCreateSheetState extends State<StandarisasiCreateSheet> {
  static const _debounce = Duration(milliseconds: 300);

  final _tierCtrl = TextEditingController(text: '1');
  final _tinggiCtrl = TextEditingController(text: '1');
  final _searchCtrl = TextEditingController();

  NpnProduct? _product;
  List<NpnProduct> _results = const [];
  bool _searching = false;
  String? _error;
  bool _saving = false;
  Timer? _searchDebounce;

  @override
  void initState() {
    super.initState();
    _product = widget.initialProduct;
    if (_product != null) {
      _searchCtrl.text = _product!.bosId;
    }
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _tierCtrl.dispose();
    _tinggiCtrl.dispose();
    _searchCtrl.dispose();
    super.dispose();
  }

  int get _tier => clampStackDimension(int.tryParse(_tierCtrl.text.trim()));
  int get _tinggi => clampStackDimension(int.tryParse(_tinggiCtrl.text.trim()));
  int get _total => _tier * _tinggi;

  /// Pratinjau selalu memakai nilai yang sudah di-clamp, supaya angka di layar
  /// persis sama dengan yang akan dikirim (web memakai `createForm.tier || 1`).
  void _onDimensionChanged() {
    setState(() {});
  }

  void _onSearchChanged(String value) {
    _searchDebounce?.cancel();
    final term = value.trim();
    if (term.isEmpty) {
      setState(() {
        _results = const [];
        _searching = false;
      });
      return;
    }
    // Debounce 300 ms sama seperti `NpnProductPicker` di web: satu produk
    // master bisa punya ribuan baris, dan mengetik cepat tidak boleh
    // menembak endpoint setiap huruf.
    _searchDebounce = Timer(_debounce, () => _runSearch(term));
  }

  Future<void> _runSearch(String term) async {
    final service = widget.service ?? StandarisasiService();
    setState(() => _searching = true);
    try {
      final results = await service.searchProduct(term);
      if (!mounted) return;
      setState(() {
        _results = results;
        _error = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = apiErrorMessage(e, 'Gagal mencari produk.'));
    } finally {
      if (mounted) {
        setState(() => _searching = false);
      }
    }
  }

  void _select(NpnProduct product) {
    setState(() {
      _product = product;
      _results = const [];
      _searchCtrl.text = product.bosId;
      _error = null;
    });
  }

  void _clearProduct() {
    setState(() {
      _product = null;
      _searchCtrl.clear();
    });
  }

  Future<void> _save() async {
    final product = _product;
    if (product == null) {
      setState(() => _error = 'Pilih produk terlebih dahulu.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    final provider = context.read<StandarisasiProvider>();
    final ok = await provider.create(
      npnId: product.id,
      tier: _tier,
      tinggiTumpukan: _tinggi,
    );
    if (!mounted) return;
    setState(() => _saving = false);
    if (ok) {
      Navigator.of(context).pop(true);
    } else {
      setState(() => _error = provider.notice?.message ?? 'Gagal menyimpan.');
    }
  }

  @override
  Widget build(BuildContext context) {
    return DraggableSheet(
      children: [
        const Text(
          'Tambah Standarisasi',
          style: TextStyle(
            fontSize: 17,
            fontWeight: FontWeight.w800,
            color: AppColors.gray900,
          ),
        ),
        const SizedBox(height: 2),
        const Text(
          'Buat standarisasi tumpukan baru',
          style: TextStyle(fontSize: 12.5, color: AppColors.gray500),
        ),
        const SizedBox(height: 18),
        const _FieldLabel('Produk (ketik nama atau BOS ID)'),
        const SizedBox(height: 8),
        if (_product != null)
          _SelectedProductChip(product: _product!, onClear: _clearProduct)
        else ...[
          TextField(
            key: const Key('standarisasi-product-search'),
            controller: _searchCtrl,
            onChanged: _onSearchChanged,
            decoration: InputDecoration(
              hintText: 'Ketik nama produk / BOS ID...',
              prefixIcon: const Icon(Icons.search, size: 20),
              suffixIcon: _searching
                  ? const Padding(
                      padding: EdgeInsets.all(12),
                      child: SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
                    )
                  : null,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(AppRadius.input),
              ),
            ),
          ),
          if (_results.isNotEmpty)
            _ProductResults(results: _results, onSelect: _select),
        ],
        const SizedBox(height: 18),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: _DimensionField(
                fieldKey: const Key('standarisasi-tier'),
                label: 'Tier *',
                controller: _tierCtrl,
                onChanged: _onDimensionChanged,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _DimensionField(
                fieldKey: const Key('standarisasi-tinggi'),
                label: 'Tinggi Tumpukan *',
                controller: _tinggiCtrl,
                onChanged: _onDimensionChanged,
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),
        _PreviewCard(tier: _tier, tinggi: _tinggi, total: _total),
        if (_error != null) ...[
          const SizedBox(height: 14),
          MessageCard(
            message: _error!,
            tone: MessageTone.error,
            icon: Icons.error_outline,
          ),
        ],
        const SizedBox(height: 18),
        FilledButton.icon(
          key: const Key('standarisasi-create-save'),
          onPressed: _saving ? null : _save,
          style: FilledButton.styleFrom(
            minimumSize: const Size.fromHeight(52),
            backgroundColor: AppColors.primary600,
          ),
          icon: _saving
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.white,
                  ),
                )
              : const Icon(Icons.save_outlined),
          label: Text(_saving ? 'Menyimpan...' : 'Simpan'),
        ),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          onPressed: _saving ? null : () => Navigator.of(context).pop(false),
          style: OutlinedButton.styleFrom(
            minimumSize: const Size.fromHeight(48),
          ),
          icon: const Icon(Icons.close, size: 20),
          label: const Text('Batal'),
        ),
      ],
    );
  }
}

/// Detail satu baris standarisasi — padanan modal `Detail Standarisasi`:
/// info produk, perhitungan tumpukan, dan status & approval, dengan tombol
/// Tolak / Setujui untuk baris `pending`.
class StandarisasiDetailSheet extends StatelessWidget {
  const StandarisasiDetailSheet({super.key, required this.row});

  final StandarisasiTumpukan row;

  Future<void> _decide(BuildContext context, {required bool approve}) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(approve ? 'Setujui Standarisasi' : 'Tolak Standarisasi'),
        content: Text(
          approve
              ? 'Yakin ingin menyetujui standarisasi ini?'
              : 'Yakin ingin menolak standarisasi ini?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Batal'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: approve
                  ? AppColors.primary600
                  : AppColors.errorText,
            ),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(approve ? 'Setujui' : 'Tolak'),
          ),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) {
      return;
    }
    final provider = context.read<StandarisasiProvider>();
    final ok = await provider.decide(row, approve: approve);
    // Web menutup modal detail setelah konfirmasi; sheet-nya ditutup juga supaya
    // operator langsung melihat barisnya berubah status di daftar.
    if (ok && context.mounted) {
      Navigator.of(context).pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final canApprove = context.watch<AuthProvider>().hasPermission(
      'standarisasi.approve',
    );
    final actionable = row.isPending && canApprove;

    return DraggableSheet(
      initialChildSize: 0.75,
      maxChildSize: 0.9,
      minChildSize: 0.4,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Detail Standarisasi',
                    style: TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w800,
                      color: AppColors.gray900,
                    ),
                  ),
                  const SizedBox(height: 2),
                  const Text(
                    'Informasi lengkap standarisasi tumpukan',
                    style: TextStyle(fontSize: 12.5, color: AppColors.gray500),
                  ),
                ],
              ),
            ),
            StatusPill(
              label: standarisasiStatusLabel(row.status),
              tone: standarisasiStatusTone(row.status),
              dot: true,
            ),
          ],
        ),
        const SizedBox(height: 16),
        _InfoGrid(
          items: <(String, String?)>[
            ('BOS ID', row.npn?.bosId),
            ('SAP ID', row.npn?.sapId),
            ('Produk', row.npn?.name),
            ('Barcode', row.npn?.barcode),
            ('Kode Depo', row.kodeDepo),
            ('Nama Depo', row.namaDepo),
          ],
        ),
        const SizedBox(height: 18),
        const _GroupLabel('Perhitungan Tumpukan'),
        const SizedBox(height: 8),
        _DimensionSummary(row: row),
        const SizedBox(height: 18),
        const _GroupLabel('Status & Approval'),
        const SizedBox(height: 8),
        _InfoGrid(
          items: <(String, String?)>[
            ('Diajukan Oleh', row.requestedByEmail),
            (
              'Disetujui Oleh',
              row.approvedByEmail ??
                  (row.isPending ? 'Menunggu approval' : '-'),
            ),
            ('Tanggal Dibuat', formatStandarisasiDate(row.createdAt)),
            (
              'Tanggal Approval',
              row.isPending
                  ? 'Menunggu approval'
                  : formatStandarisasiDate(row.updatedAt),
            ),
          ],
        ),
        if (row.isPending && !canApprove) ...[
          const SizedBox(height: 14),
          const MessageCard(
            message:
                'Izin standarisasi.approve diperlukan untuk menyetujui atau '
                'menolak permintaan ini. Hubungi BLC bila ini keliru.',
            tone: MessageTone.warning,
            icon: Icons.lock_outline,
          ),
        ],
        const SizedBox(height: 18),
        if (actionable) ...[
          FilledButton.icon(
            key: const Key('standarisasi-approve'),
            onPressed: () => _decide(context, approve: true),
            style: FilledButton.styleFrom(
              minimumSize: const Size.fromHeight(52),
              backgroundColor: AppColors.primary600,
            ),
            icon: const Icon(Icons.check),
            label: const Text('Setujui'),
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            key: const Key('standarisasi-reject'),
            onPressed: () => _decide(context, approve: false),
            style: OutlinedButton.styleFrom(
              minimumSize: const Size.fromHeight(48),
              foregroundColor: AppColors.errorText,
              side: const BorderSide(color: AppColors.errorBorder),
            ),
            icon: const Icon(Icons.close, size: 20),
            label: const Text('Tolak'),
          ),
          const SizedBox(height: 8),
        ],
        OutlinedButton.icon(
          onPressed: () => Navigator.of(context).pop(),
          style: OutlinedButton.styleFrom(
            minimumSize: const Size.fromHeight(48),
          ),
          icon: const Icon(Icons.check, size: 20),
          label: const Text('Tutup'),
        ),
      ],
    );
  }
}

// --- Bagian internal ---

class _FieldLabel extends StatelessWidget {
  const _FieldLabel(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: const TextStyle(
        fontSize: 13.5,
        fontWeight: FontWeight.w700,
        color: AppColors.gray700,
      ),
    );
  }
}

class _GroupLabel extends StatelessWidget {
  const _GroupLabel(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text.toUpperCase(),
      style: const TextStyle(
        fontSize: 11,
        fontWeight: FontWeight.w800,
        letterSpacing: 1.1,
        color: AppColors.gray500,
      ),
    );
  }
}

/// Produk terpilih — padanan tampilan "sudah pilih" di `NpnProductPicker`
/// (nama produk + BOS ID mono + tombol ganti).
class _SelectedProductChip extends StatelessWidget {
  const _SelectedProductChip({required this.product, required this.onClear});

  final NpnProduct product;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    return Container(
      key: const Key('standarisasi-product-selected'),
      padding: const EdgeInsets.fromLTRB(12, 10, 6, 10),
      decoration: BoxDecoration(
        color: AppColors.gray50,
        borderRadius: BorderRadius.circular(AppRadius.input),
        border: Border.all(color: AppColors.gray200),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  product.name,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w600,
                    color: AppColors.gray900,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  product.bosId,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.gray500,
                    fontFamily: 'monospace',
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            tooltip: 'Ganti produk',
            onPressed: onClear,
            icon: const Icon(Icons.close, size: 18),
            color: AppColors.gray500,
          ),
        ],
      ),
    );
  }
}

class _ProductResults extends StatelessWidget {
  const _ProductResults({required this.results, required this.onSelect});

  final List<NpnProduct> results;
  final ValueChanged<NpnProduct> onSelect;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(top: 6),
      constraints: const BoxConstraints(maxHeight: 200),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(AppRadius.input),
        border: Border.all(color: AppColors.gray200),
      ),
      clipBehavior: Clip.antiAlias,
      child: ListView.separated(
        shrinkWrap: true,
        padding: EdgeInsets.zero,
        itemCount: results.length,
        separatorBuilder: (_, _) => const Divider(height: 1, indent: 12),
        itemBuilder: (context, index) {
          final product = results[index];
          return InkWell(
            key: Key('standarisasi-product-${product.id}'),
            onTap: () => onSelect(product),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    product.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: AppColors.gray900,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    product.identifier,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 11.5,
                      color: AppColors.gray500,
                      fontFamily: 'monospace',
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

class _DimensionField extends StatelessWidget {
  const _DimensionField({
    required this.fieldKey,
    required this.label,
    required this.controller,
    required this.onChanged,
  });

  final Key fieldKey;
  final String label;
  final TextEditingController controller;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _FieldLabel(label),
        const SizedBox(height: 8),
        TextField(
          key: fieldKey,
          controller: controller,
          keyboardType: TextInputType.number,
          onChanged: (_) => onChanged(),
          decoration: InputDecoration(
            hintText: '1 - $maxStackDimension',
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(AppRadius.input),
            ),
          ),
        ),
      ],
    );
  }
}

/// Pratinjau perhitungan — kalimat yang sama dengan blok `Preview
/// Perhitungan` di web, dengan nilai yang sudah di-clamp.
class _PreviewCard extends StatelessWidget {
  const _PreviewCard({
    required this.tier,
    required this.tinggi,
    required this.total,
  });

  final int tier;
  final int tinggi;
  final int total;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.gray50,
        borderRadius: BorderRadius.circular(AppRadius.chip),
        border: Border.all(color: AppColors.gray200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'PREVIEW PERHITUNGAN',
            style: TextStyle(
              fontSize: 10.5,
              fontWeight: FontWeight.w800,
              letterSpacing: 1.1,
              color: AppColors.gray400,
            ),
          ),
          const SizedBox(height: 6),
          Text.rich(
            TextSpan(
              style: const TextStyle(fontSize: 13.5, color: AppColors.gray800),
              children: [
                TextSpan(text: '$tier tier x $tinggi tinggi = '),
                TextSpan(
                  text: '$total',
                  style: const TextStyle(
                    fontWeight: FontWeight.w800,
                    color: AppColors.primary600,
                  ),
                ),
                const TextSpan(text: ' total'),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Tiga kotak Tier / Tinggi / Total — `grid-cols-3` di modal detail web.
class _DimensionSummary extends StatelessWidget {
  const _DimensionSummary({required this.row});

  final StandarisasiTumpukan row;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: _DimensionBox(label: 'TIER', value: '${row.tier}'),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _DimensionBox(
                label: 'TINGGI',
                value: '${row.tinggiTumpukan}',
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _DimensionBox(
                label: 'TOTAL',
                value: '${row.totalTumpukan}',
                highlight: true,
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Text(
          '${row.tier} tier x ${row.tinggiTumpukan} tinggi = '
          '${row.totalTumpukan} total tumpukan',
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 12, color: AppColors.gray500),
        ),
      ],
    );
  }
}

class _DimensionBox extends StatelessWidget {
  const _DimensionBox({
    required this.label,
    required this.value,
    this.highlight = false,
  });

  final String label;
  final String value;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 6),
      decoration: BoxDecoration(
        color: highlight ? AppColors.primary50 : AppColors.gray50,
        borderRadius: BorderRadius.circular(AppRadius.chip),
        border: Border.all(
          color: highlight ? AppColors.primary200 : AppColors.gray200,
        ),
      ),
      child: Column(
        children: [
          Text(
            label,
            style: const TextStyle(
              fontSize: 10.5,
              fontWeight: FontWeight.w800,
              letterSpacing: 1,
              color: AppColors.gray500,
            ),
          ),
          const SizedBox(height: 4),
          FittedBox(
            fit: BoxFit.scaleDown,
            child: Text(
              value,
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w800,
                color: highlight ? AppColors.primary700 : AppColors.gray700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Kisi label/nilai — padanan `InfoItem` (kartu `bg-slate-50` dua kolom).
class _InfoGrid extends StatelessWidget {
  const _InfoGrid({required this.items});

  final List<(String, String?)> items;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        // Dua kolom seperti web, tapi otomatis turun ke satu kolom pada layar
        // sempit supaya label + nilai panjang (nama produk) tidak tergigit.
        final columns = constraints.maxWidth >= 420 ? 2 : 1;
        const gap = 10.0;
        final width = (constraints.maxWidth - gap * (columns - 1)) / columns;
        return Wrap(
          spacing: gap,
          runSpacing: gap,
          children: [
            for (final (label, value) in items)
              SizedBox(
                width: width,
                child: _InfoCell(label: label, value: value),
              ),
          ],
        );
      },
    );
  }
}

class _InfoCell extends StatelessWidget {
  const _InfoCell({required this.label, required this.value});

  final String label;
  final String? value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.gray50,
        borderRadius: BorderRadius.circular(AppRadius.chip),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label.toUpperCase(),
            style: const TextStyle(
              fontSize: 10.5,
              fontWeight: FontWeight.w800,
              letterSpacing: 1,
              color: AppColors.gray400,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            // `fmt()` di web: kosong / "-" jadi "-", bukan string kosong.
            (value == null || value!.isEmpty || value == '-') ? '-' : value!,
            style: const TextStyle(
              fontSize: 13.5,
              fontWeight: FontWeight.w600,
              color: AppColors.gray800,
            ),
          ),
        ],
      ),
    );
  }
}
