import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

import 'package:onezentra_mobile/core/theme/app_theme.dart';
import 'package:onezentra_mobile/features/validation/models/validation_models.dart';
import 'package:onezentra_mobile/features/validation/providers/validation_provider.dart';
import 'package:onezentra_mobile/features/validation/widgets/validation_item_fields.dart';
import 'package:onezentra_mobile/shared/widgets/app_widgets.dart';

/// Bottom sheet untuk memvalidasi satu baris: qty aktual, kondisi, expired.
///
/// Digunakan oleh `ValidationSessionPage`; provider di-expose ulang melalui
/// [ChangeNotifierProvider.value] agar `context.read` di dalam sheet tidak
/// melempar ProviderNotFoundException.
class ItemValidationSheet extends StatefulWidget {
  const ItemValidationSheet({required this.item, this.pickPhoto, super.key});
  final SjValidationItem item;
  final Future<String?> Function({required bool fromCamera})? pickPhoto;

  @override
  State<ItemValidationSheet> createState() => _ItemValidationSheetState();
}

class _ItemValidationSheetState extends State<ItemValidationSheet> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _qtyController = TextEditingController(
    text: _initialActualQty(widget.item),
  );
  final _barcodeController = TextEditingController();
  final _notesController = TextEditingController();
  final _expiredController = TextEditingController();
  String _condition = 'FISIK_BAGUS';
  DateTime? _expiredDate;
  String? _photoPath;
  bool _saving = false;
  String? _error;

  static String _initialActualQty(SjValidationItem item) {
    var value = item.actualQty;
    if (value == null) {
      return '';
    }
    return value == value.truncateToDouble() ? '${value.toInt()}' : '$value';
  }

  @override
  void initState() {
    super.initState();
    _barcodeController.text = widget.item.barcode ?? '';
    _notesController.text = widget.item.notes ?? '';
    _condition = ValidationCondition.values.contains(widget.item.condition)
        ? widget.item.condition
        : 'FISIK_BAGUS';
    _expiredDate = DateTime.tryParse(widget.item.expiredDate ?? '');
    _expiredController.text = formatDateId(_expiredDate);
  }

  @override
  void dispose() {
    _qtyController.dispose();
    _barcodeController.dispose();
    _notesController.dispose();
    _expiredController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    var item = widget.item;
    return Container(
      decoration: BoxDecoration(
        color: context.colors.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        border: Border.all(color: context.colors.gray300),
      ),
      padding: EdgeInsets.only(
        left: AppTheme.space5,
        right: AppTheme.space5,
        top: AppTheme.space4,
        bottom: MediaQuery.of(context).viewInsets.bottom + AppTheme.space5,
      ),
      child: SafeArea(
        top: false,
        child: SingleChildScrollView(
          child: Form(
            key: _formKey,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(
                      color: context.colors.gray300,
                      borderRadius: AppTheme.radiusFull,
                    ),
                  ),
                ),
                const SizedBox(height: AppTheme.space4),
                Text(
                  item.namaBarang ?? item.kodeBarang ?? 'Item',
                  style: GoogleFonts.roboto(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: context.colors.foreground,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  '${item.kodeBarang ?? '-'} • Ekspektasi ${_formatQty(item.expectedQty)}'
                  '${item.satuan != null ? ' ${item.satuan}' : ''}',
                  style: GoogleFonts.robotoMono(
                    fontSize: 12,
                    color: context.colors.textSecondary,
                  ),
                ),
                const SizedBox(height: AppTheme.space4),
                if (_condition != 'FISIK_TIDAK_ADA') ...[
                  AppTextField(
                    controller: _qtyController,
                    label: 'Qty aktual',
                    hint: '0',
                    prefixIcon: Icons.inventory_rounded,
                    keyboardType: const TextInputType.numberWithOptions(
                      decimal: true,
                    ),
                    textInputAction: TextInputAction.next,
                    validator: (value) {
                      if (_condition == 'FISIK_TIDAK_ADA') {
                        return null;
                      }
                      var qty = double.tryParse(
                        (value ?? '').replaceAll(',', '.'),
                      );
                      if (qty == null || qty < 0) {
                        return 'Isi qty aktual dengan angka ≥ 0';
                      }
                      return null;
                    },
                  ),
                ],
                const SizedBox(height: AppTheme.space3),
                DropdownButtonFormField<String>(
                  initialValue: _condition,
                  decoration: const InputDecoration(
                    labelText: 'Kondisi',
                    border: OutlineInputBorder(borderRadius: AppTheme.radiusLg),
                    contentPadding: EdgeInsets.symmetric(
                      horizontal: AppTheme.space3,
                      vertical: AppTheme.space2,
                    ),
                  ),
                  items: ValidationCondition.values
                      .map(
                        (c) => DropdownMenuItem<String>(
                          value: c,
                          child: Text(ValidationCondition.label(c)),
                        ),
                      )
                      .toList(),
                  onChanged: (value) {
                    if (value != null) {
                      setState(() => _condition = value);
                    }
                  },
                ),
                if (ValidationCondition.requiresPhoto.contains(_condition))
                  Padding(
                    padding: const EdgeInsets.only(top: AppTheme.space3),
                    child: PhotoEvidenceField(
                      photoPath: _photoPath,
                      onChanged: (path) => setState(() => _photoPath = path),
                      picker: widget.pickPhoto,
                      enabled: !_saving,
                    ),
                  ),
                if (_condition != 'FISIK_TIDAK_ADA') ...[
                  const SizedBox(height: AppTheme.space3),
                  ExpiredDateField(
                    controller: _expiredController,
                    onPicked: _onExpiredPicked,
                    validator: (_) =>
                        (_condition == 'FISIK_TIDAK_ADA' ||
                            _expiredDate != null)
                        ? null
                        : 'Tanggal expired wajib diisi',
                  ),
                  if (_expiredDate != null) ...[
                    const SizedBox(height: AppTheme.space3),
                    UmurStandarPanel(
                      expiredDate: _expiredDate,
                      standarUmur: widget.item.umur,
                      kodeBarang: widget.item.kodeBarang,
                      namaBarang: widget.item.namaBarang,
                    ),
                  ],
                ],
                const SizedBox(height: AppTheme.space3),
                ExpansionTile(
                  title: Text(
                    'Detail lainnya (opsional)',
                    style: GoogleFonts.roboto(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: context.colors.textMuted,
                    ),
                  ),
                  iconColor: context.colors.textMuted,
                  collapsedIconColor: context.colors.textMuted,
                  tilePadding: EdgeInsets.zero,
                  childrenPadding: EdgeInsets.zero,
                  shape: const Border(),
                  children: [
                    AppTextField(
                      controller: _barcodeController,
                      label: 'Barcode produk',
                      hint: 'Scan / ketik barcode kemasan',
                      prefixIcon: Icons.barcode_reader,
                    ),
                    const SizedBox(height: AppTheme.space3),
                    AppTextField(
                      controller: _notesController,
                      label: 'Catatan',
                      hint: 'Keterangan tambahan',
                      prefixIcon: Icons.note_rounded,
                      maxLines: 2,
                    ),
                  ],
                ),
                if (_error != null) ...[
                  const SizedBox(height: AppTheme.space3),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(AppTheme.space3),
                    decoration: BoxDecoration(
                      color: context.colors.dangerWell,
                      borderRadius: AppTheme.radiusLg,
                      border: Border.all(color: context.colors.dangerText),
                    ),
                    child: Text(
                      _error!,
                      style: GoogleFonts.roboto(
                        fontSize: 12.5,
                        height: 1.4,
                        color: context.colors.dangerText,
                      ),
                    ),
                  ),
                ],
                const SizedBox(height: AppTheme.space4),
                AppPrimaryButton(
                  text: 'Simpan Validasi',
                  isLoading: _saving,
                  onPressed:
                      _saving ||
                          (ValidationCondition.requiresPhoto.contains(
                                _condition,
                              ) &&
                              _photoPath == null)
                      ? null
                      : () async {
                          if (!(_formKey.currentState?.validate() ?? false)) {
                            return;
                          }
                          var confirmed = await showDialog<bool>(
                            context: context,
                            builder: (ctx) => AlertDialog(
                              title: const Text('Konfirmasi'),
                              content: const Text(
                                'Yakin data validasi sudah sesuai? '
                                'Setelah disimpan tidak bisa diubah (kecuali koreksi).',
                              ),
                              actions: [
                                TextButton(
                                  onPressed: () => Navigator.of(ctx).pop(false),
                                  child: const Text('Batal'),
                                ),
                                FilledButton(
                                  onPressed: () => Navigator.of(ctx).pop(true),
                                  child: const Text('OK'),
                                ),
                              ],
                            ),
                          );
                          if (confirmed == true && mounted) {
                            await _save();
                          }
                        },
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  /// Tanggal expired dipilih dari picker bersama — simpan, perbarui teks
  /// field, lalu validasi ulang form supaya pesan "wajib diisi" hilang.
  void _onExpiredPicked(DateTime? picked) {
    if (picked == null) {
      return;
    }
    setState(() {
      _expiredDate = picked;
      _expiredController.text = formatDateId(picked);
    });
    _formKey.currentState?.validate();
  }

  static String _formatQty(double? value) {
    if (value == null) {
      return '-';
    }
    return value == value.truncateToDouble() ? '${value.toInt()}' : '$value';
  }

  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false)) {
      return;
    }
    // FISIK_TIDAK_ADA: qty otomatis 0, expired tidak wajib.
    if (_condition == 'FISIK_TIDAK_ADA') {
      _qtyController.text = '0';
      _expiredController.clear();
      _expiredDate = null;
    }
    if (_condition != 'FISIK_TIDAK_ADA' && _expiredDate == null) {
      setState(() => _error = 'Tanggal expired wajib diisi.');
      return;
    }
    if (ValidationCondition.requiresPhoto.contains(_condition) &&
        _photoPath == null) {
      setState(
        () => _error =
            'Kondisi ini wajib foto. Ambil foto langsung atau pilih dari '
            'galeri.',
      );
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    var provider = context.read<ValidationProvider>();
    var success = await provider.validateItem(
      itemId: widget.item.id,
      actualQty: _condition == 'FISIK_TIDAK_ADA'
          ? 0.0
          : double.parse(_qtyController.text.trim().replaceAll(',', '.')),
      barcode: _barcodeController.text.trim().isEmpty
          ? null
          : _barcodeController.text.trim(),
      condition: _condition,
      expiredDate: _expiredDate == null
          ? null
          : '${_expiredDate!.year.toString().padLeft(4, '0')}-'
                '${_expiredDate!.month.toString().padLeft(2, '0')}-'
                '${_expiredDate!.day.toString().padLeft(2, '0')}',
      notes: _notesController.text.trim().isEmpty
          ? null
          : _notesController.text.trim(),
      photoPath: _photoPath,
    );
    if (!mounted) {
      return;
    }
    if (success) {
      Navigator.of(context).pop(true);
    } else {
      setState(() {
        _saving = false;
        _error =
            provider.message?.message ?? 'Gagal menyimpan. Silakan coba lagi.';
      });
    }
  }
}
