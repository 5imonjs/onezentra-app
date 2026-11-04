import 'dart:async';

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

import 'package:onezentra_mobile/core/theme/app_theme.dart';
import 'package:onezentra_mobile/features/validation/models/validation_models.dart';
import 'package:onezentra_mobile/features/validation/providers/validation_provider.dart';
import 'package:onezentra_mobile/features/validation/widgets/npn_product_picker.dart';
import 'package:onezentra_mobile/features/validation/widgets/validation_item_fields.dart';
import 'package:onezentra_mobile/shared/widgets/app_widgets.dart';

/// Bottom sheet untuk mencatat barang di luar rencana kirim.
///
/// Identitas diambil dari master NPN atau diisi manual, foto bukti wajib,
/// dan rencana kirim tidak diubah — planner diberi tahu lewat email server.
class ExtraItemSheet extends StatefulWidget {
  const ExtraItemSheet({this.pickPhoto, super.key});

  /// Overrides ImagePicker untuk test.
  final Future<String?> Function({required bool fromCamera})? pickPhoto;

  @override
  State<ExtraItemSheet> createState() => _ExtraItemSheetState();
}

class _ExtraItemSheetState extends State<ExtraItemSheet> {
  final _formKey = GlobalKey<FormState>();
  final _qtyController = TextEditingController();
  final _searchController = TextEditingController();
  final _kodeController = TextEditingController();
  final _namaController = TextEditingController();
  final _satuanController = TextEditingController();
  final _notesController = TextEditingController();
  final _expiredController = TextEditingController();
  String _condition = 'FISIK_BAGUS';
  DateTime? _expiredDate;
  String? _photoPath;
  bool _saving = false;
  String? _error;

  /// Produk master NPN yang terpilih — identitas & satuan dikunci ke master,
  /// field manual disembunyikan. null = mode manual bebas.
  NpnProduct? _npn;
  bool _searching = false;

  /// Hasil pencarian nama di master NPN — operator memilih satu; kosong =
  /// lanjut manual. Dibatasi 5 supaya daftar singkat di layar kecil.
  List<NpnProduct> _suggestions = [];
  Timer? _searchDebounce;

  @override
  void dispose() {
    _qtyController.dispose();
    _searchController.dispose();
    _kodeController.dispose();
    _namaController.dispose();
    _satuanController.dispose();
    _notesController.dispose();
    _expiredController.dispose();
    _searchDebounce?.cancel();
    super.dispose();
  }

  /// Identitas barang sah bila terkunci ke master NPN atau kode + nama manual
  /// lengkap. Server tetap memvalidasi ulang.
  bool get _identityValid =>
      _npn != null ||
      (_kodeController.text.trim().isNotEmpty &&
          _namaController.text.trim().isNotEmpty);

  @override
  Widget build(BuildContext context) => Container(
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
                'Barang luar rencana',
                style: GoogleFonts.roboto(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: context.colors.foreground,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                'Barang dibawa transporter tapi tidak ada di rencana. '
                'Foto bukti wajib; rencana tidak diubah.',
                style: GoogleFonts.roboto(
                  fontSize: 12,
                  height: 1.4,
                  color: context.colors.textSecondary,
                ),
              ),
              const SizedBox(height: AppTheme.space4),
              // Identitas dulu — ketik nama barang, kode & satuan terisi
              // otomatis dari master NPN (pola combobox Rencana Kirim web),
              // seperti modal Validasi Item yang identitasnya tampil lebih
              // dulu sebelum form pemeriksaan. Tanpa barcode agar input
              // lebih cepat.
              AppTextField(
                controller: _searchController,
                label: 'Nama barang',
                hint: 'Ketik nama barang dari master NPN',
                prefixIcon: Icons.search_rounded,
                onChanged: _onSearchChanged,
              ),
              const SizedBox(height: AppTheme.space2),
              if (_searching)
                const Padding(
                  padding: EdgeInsets.all(AppTheme.space3),
                  child: SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                )
              else if (_suggestions.isNotEmpty)
                Container(
                  margin: const EdgeInsets.only(top: AppTheme.space2),
                  decoration: BoxDecoration(
                    color: context.colors.surfaceCard,
                    borderRadius: AppTheme.radiusLg,
                    border: Border.all(color: context.colors.gray300),
                  ),
                  child: Column(
                    children: [
                      for (var (index, product) in _suggestions.indexed) ...[
                        if (index > 0)
                          Divider(height: 1, color: context.colors.gray300),
                        NpnSuggestionTile(
                          product: product,
                          enabled: !_saving,
                          onTap: () => _selectNpn(product),
                        ),
                      ],
                    ],
                  ),
                )
              else if (_searchController.text.trim().length >= 2 && !_saving)
                Padding(
                  padding: const EdgeInsets.only(
                    top: AppTheme.space2,
                    bottom: AppTheme.space2,
                  ),
                  child: Text(
                    'Tidak ada di master NPN — isi kode & nama manual di bawah.',
                    style: GoogleFonts.roboto(
                      fontSize: 12,
                      color: context.colors.textSecondary,
                    ),
                  ),
                ),
              const SizedBox(height: AppTheme.space3),
              if (_npn != null)
                _npnIdentityCard()
              else ...[
                // Barang tidak ada di master NPN: identitas manual wajib
                // lengkap (kode + nama) karena server menolak baris tanpa
                // kode_barang saat tidak ada barcode/npn_id.
                AppTextField(
                  controller: _kodeController,
                  label: 'Kode barang *',
                  hint: 'Contoh: SKU-123',
                  prefixIcon: Icons.qr_code_2_rounded,
                  textInputAction: TextInputAction.next,
                  autovalidateMode: AutovalidateMode.onUserInteraction,
                  validator: (value) => _identityValid
                      ? null
                      : 'Isi kode & nama barang, atau barcode yang dikenal',
                ),
                const SizedBox(height: AppTheme.space3),
                AppTextField(
                  controller: _namaController,
                  label: 'Nama barang *',
                  hint: 'Wajib bila barcode tidak dikenal',
                  prefixIcon: Icons.abc_rounded,
                  textInputAction: TextInputAction.next,
                  autovalidateMode: AutovalidateMode.onUserInteraction,
                  validator: (value) => _identityValid
                      ? null
                      : 'Isi kode & nama barang, atau barcode yang dikenal',
                ),
                const SizedBox(height: AppTheme.space3),
                AppTextField(
                  controller: _satuanController,
                  label: 'Satuan',
                  hint: 'CRT / ZAK / PCS',
                  prefixIcon: Icons.square_foot_rounded,
                  textInputAction: TextInputAction.next,
                ),
              ],
              const SizedBox(height: AppTheme.space3),
              AppTextField(
                controller: _qtyController,
                label: 'Jumlah *',
                hint: _npn?.satuan == null ? '0' : '0 ($_npnSatuan)',
                prefixIcon: Icons.inventory_rounded,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                textInputAction: TextInputAction.next,
                // Merah hilang begitu angka sah — dulu error menempel
                // sampai Simpan ditekan ulang walau jumlah sudah diisi.
                autovalidateMode: AutovalidateMode.onUserInteraction,
                validator: (value) {
                  var qty = double.tryParse((value ?? '').replaceAll(',', '.'));
                  if (qty == null || qty <= 0) {
                    return 'Isi jumlah dengan angka > 0';
                  }
                  return null;
                },
              ),
              const SizedBox(height: AppTheme.space3),
              Text(
                'Kondisi',
                style: Theme.of(context).textTheme.labelLarge?.copyWith(
                  fontWeight: FontWeight.w600,
                  color: context.colors.textSecondary,
                ),
              ),
              const SizedBox(height: AppTheme.space2),
              ConditionChipRow(
                value: _condition,
                onChanged: (value) => setState(() => _condition = value),
              ),
              // Backend mewajibkan foto untuk setiap barang luar rencana,
              // termasuk kondisi FISIK_BAGUS — jangan sembunyikan field ini
              // berdasarkan kondisi, karena tombol simpan akan terkunci.
              const SizedBox(height: AppTheme.space3),
              PhotoEvidenceField(
                photoPath: _photoPath,
                onChanged: (path) => setState(() => _photoPath = path),
                picker: widget.pickPhoto,
                enabled: !_saving,
                subtitle: 'Wajib — menggantikan catatan manual di kertas.',
              ),
              const SizedBox(height: AppTheme.space3),
              ExpiredDateField(
                controller: _expiredController,
                isRequired: false,
                onPicked: (picked) {
                  if (picked == null) {
                    return;
                  }
                  setState(() {
                    _expiredDate = picked;
                    _expiredController.text = formatDateId(picked);
                  });
                },
              ),
              const SizedBox(height: AppTheme.space3),
              AppTextField(
                controller: _notesController,
                label: 'Catatan',
                hint: 'Keterangan tambahan',
                prefixIcon: Icons.note_rounded,
                maxLines: 2,
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
                text: 'Laporkan',
                isLoading: _saving,
                onPressed: _saving || _photoPath == null ? null : _save,
              ),
            ],
          ),
        ),
      ),
    ),
  );

  String get _npnSatuan => _npn?.satuan ?? '';

  /// Kartu identitas terkunci ke master NPN — menampilkan nama, kode, dan
  /// satuan dari master; tombol membuka kunci untuk kembali ke mode manual.
  Widget _npnIdentityCard() => Container(
    width: double.infinity,
    padding: const EdgeInsets.all(AppTheme.space3),
    decoration: BoxDecoration(
      color: context.colors.surfaceCard,
      borderRadius: AppTheme.radiusLg,
      border: Border.all(color: AppTheme.primary500),
    ),
    child: Row(
      children: [
        Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            color: AppTheme.primary500.withValues(alpha: 0.12),
            borderRadius: AppTheme.radiusLg,
          ),
          child: const Icon(
            Icons.inventory_2_rounded,
            color: AppTheme.primary500,
            size: 20,
          ),
        ),
        const SizedBox(width: AppTheme.space3),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                _npn!.displayName,
                style: GoogleFonts.roboto(
                  fontSize: 13.5,
                  fontWeight: FontWeight.w700,
                  color: context.colors.foreground,
                ),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 2),
              Text(
                '${_npn!.kodeBarang ?? '-'}'
                '${_npn!.satuan != null ? ' • Satuan ${_npn!.satuan}' : ''}',
                style: GoogleFonts.robotoMono(
                  fontSize: 11.5,
                  color: context.colors.textMuted,
                ),
              ),
            ],
          ),
        ),
        IconButton(
          tooltip: 'Ganti barang',
          icon: const Icon(Icons.close_rounded, size: 18),
          color: context.colors.textMuted,
          onPressed: _saving
              ? null
              : () => setState(() {
                  _npn = null;
                  _searchController.clear();
                  _kodeController.clear();
                  _namaController.clear();
                  _satuanController.clear();
                }),
        ),
      ],
    ),
  );

  /// Pencarian nama barang di master NPN dengan debounce — hasil menjadi
  /// daftar saran di bawah field. Pencarian gagal (mis. offline) hanya
  /// menyembunyikan saran: operator lanjut manual, form tidak pernah terkunci.
  void _onSearchChanged(String query) {
    _searchDebounce?.cancel();
    var trimmed = query.trim();
    if (trimmed.length < 2) {
      setState(() {
        _searching = false;
        _suggestions = [];
      });
      return;
    }
    _searchDebounce = Timer(const Duration(milliseconds: 350), () async {
      setState(() => _searching = true);
      var products = await context.read<ValidationProvider>().searchProduct(
        trimmed,
      );
      if (!mounted) {
        return;
      }
      setState(() {
        _searching = false;
        _suggestions = products.take(5).toList();
      });
    });
  }

  /// Pilih produk dari daftar saran — identitas terkunci ke master NPN:
  /// kode & satuan terisi otomatis, field manual disembunyikan.
  void _selectNpn(NpnProduct product) {
    setState(() {
      _npn = product;
      _suggestions = [];
      _searchController.text = product.displayName;
      _kodeController.text = product.kodeBarang ?? '';
      _namaController.text = product.displayName;
      _satuanController.text = product.satuan ?? '';
      _error = null;
    });
    _formKey.currentState?.validate();
  }

  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false)) {
      return;
    }
    if (!_identityValid) {
      setState(
        () => _error =
            'Isi barcode yang dikenal, atau kode + nama barang manual.',
      );
      return;
    }
    if (_photoPath == null) {
      setState(
        () => _error =
            'Foto bukti wajib. Ambil foto langsung atau pilih dari galeri.',
      );
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    var provider = context.read<ValidationProvider>();
    var success = await provider.reportExtraItem(
      npnId: _npn?.id,
      // Bila terkunci ke master, identitas dipegang npn_id — server menimpa
      // nilai manual dengan master, jadi nilai manual tidak dikirim.
      kodeBarang: _npn != null
          ? null
          : _kodeController.text.trim().isEmpty
          ? null
          : _kodeController.text.trim(),
      namaBarang: _npn != null
          ? null
          : _namaController.text.trim().isEmpty
          ? null
          : _namaController.text.trim(),
      qty: double.parse(_qtyController.text.trim().replaceAll(',', '.')),
      satuan: _npn != null
          ? null
          : _satuanController.text.trim().isEmpty
          ? null
          : _satuanController.text.trim(),
      condition: _condition,
      expiredDate: _expiredDate == null
          ? null
          : '${_expiredDate!.year.toString().padLeft(4, '0')}-'
                '${_expiredDate!.month.toString().padLeft(2, '0')}-'
                '${_expiredDate!.day.toString().padLeft(2, '0')}',
      notes: _notesController.text.trim().isEmpty
          ? null
          : _notesController.text.trim(),
      photoPath: _photoPath!,
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
            provider.message?.message ?? 'Gagal melaporkan. Silakan coba lagi.';
      });
    }
  }
}
