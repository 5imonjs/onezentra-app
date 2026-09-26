import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import 'package:onezentra_mobile/features/auth/auth_provider.dart';
import 'package:onezentra_mobile/features/gate/scanner_screen.dart';
import 'package:onezentra_mobile/features/validation/models/validation_models.dart';
import 'package:onezentra_mobile/features/validation/shelf_life_card.dart';
import 'package:onezentra_mobile/features/validation/validation_session_provider.dart';
import 'package:onezentra_mobile/theme/app_colors.dart';
import 'package:onezentra_mobile/widgets/draggable_sheet.dart';

/// Form validasi satu item: barcode kemasan, qty aktual, tanggal expired,
/// kondisi fisik (+ foto bila kondisi bermasalah), dan catatan.
///
/// Standarisasi tumpukan **tidak** ditanyakan di sini: item tanpa standarisasi
/// yang disetujui tidak boleh membuka sheet ini sama sekali
/// (`ValidationScreen._openItem` -&gt; halaman Standarisasi), sama seperti
/// `openItem` di `onezentra-web/src/app/validasi-sj/page.tsx`.
///
/// Dikirim sebagai multipart (`ValidationService.scanItem`). Backend mewajibkan
/// foto untuk kondisi bermasalah, jadi form menolak lebih dulu di sisi client
/// ([itemDraftError]) daripada mengirim request yang pasti ditolak server.
class ValidationItemSheet extends StatefulWidget {
  const ValidationItemSheet({super.key, required this.item});

  final SjValidationItem item;

  @override
  State<ValidationItemSheet> createState() => _ValidationItemSheetState();
}

class _ValidationItemSheetState extends State<ValidationItemSheet> {
  late final TextEditingController _barcodeCtrl;
  late final TextEditingController _qtyCtrl;
  final _notesCtrl = TextEditingController();

  String _condition = conditionGood;
  DateTime? _expired;
  String? _photoPath;
  String? _draftError;
  bool _pickingPhoto = false;

  @override
  void initState() {
    super.initState();
    final item = widget.item;
    _barcodeCtrl = TextEditingController(text: item.barcode);
    _qtyCtrl = TextEditingController(
      text: item.actualQty == null ? '' : formatQty(item.actualQty!),
    );
    _condition = item.condition;
    _expired = _parseDate(item.expiredDate);
  }

  @override
  void dispose() {
    _barcodeCtrl.dispose();
    _qtyCtrl.dispose();
    _notesCtrl.dispose();
    super.dispose();
  }

  double? get _qty => double.tryParse(_qtyCtrl.text.trim());

  String? get _expiredText => _expired == null ? null : _formatDate(_expired!);

  /// Laporan umur lengkap (sisa bulan, selisih hari/bulan/tahun, verdict) —
  /// sumber tunggal untuk kartu di sheet ini dan popup pemeriksaan umur, sama
  /// seperti `calcUmurInMonths` + `formatUmurSelisih` di web.
  ShelfLifeReport? get _shelf =>
      shelfLifeReport(_expiredText, standardMonths: widget.item.umur);

  Future<void> _pickBarcode() async {
    final code = await Navigator.of(context).push<String>(
      MaterialPageRoute(
        builder: (_) => const ScannerScreen(
          title: 'Scan Barcode Produk',
          hint: 'Arahkan kamera ke barcode kemasan produk',
        ),
      ),
    );
    if (code == null || !mounted) {
      return;
    }
    final value = code.trim();
    if (value.isEmpty) {
      return;
    }
    setState(() {
      _barcodeCtrl.text = value;
      _barcodeCtrl.selection = TextSelection.collapsed(offset: value.length);
    });
  }

  Future<void> _pickPhoto(ImageSource source) async {
    setState(() => _pickingPhoto = true);
    try {
      final file = await ImagePicker().pickImage(
        source: source,
        maxWidth: 1600,
        imageQuality: 80,
      );
      if (file == null || !mounted) {
        return;
      }
      setState(() => _photoPath = file.path);
    } catch (e) {
      if (!mounted) return;
      setState(() => _draftError = 'Gagal membuka galeri/kamera: $e');
    } finally {
      if (mounted) {
        setState(() => _pickingPhoto = false);
      }
    }
  }

  Future<void> _pickCamera() => _pickPhoto(ImageSource.camera);

  Future<void> _pickGallery() => _pickPhoto(ImageSource.gallery);

  Future<void> _choosePhotoSource() async {
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined),
              title: const Text('Ambil foto'),
              onTap: () => Navigator.of(ctx).pop(ImageSource.camera),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Pilih dari galeri'),
              onTap: () => Navigator.of(ctx).pop(ImageSource.gallery),
            ),
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(),
              child: const Text('Batal'),
            ),
          ],
        ),
      ),
    );
    if (source != null) {
      await _pickPhoto(source);
    }
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _expired ?? now,
      firstDate: DateTime(now.year - 5),
      lastDate: DateTime(now.year + 10),
      helpText: 'Tanggal expired',
    );
    if (picked == null || !mounted) {
      return;
    }
    setState(() => _expired = picked);
    // Web membuka popup "Standar Umur Produk" setiap kali tanggal expired diisi
    // (`setShowUmurPopup(true)`), karena di sanalah operator menilai apakah
    // sisa simpan masih memenuhi standar. Angkanya sama dengan kartu di bawah
    // form, tapi popup bisa dibaca tanpa menutup sheet.
    await _openShelfLifePopup();
  }

  Future<void> _openShelfLifePopup() async {
    final report = _shelf;
    if (report == null || !mounted) {
      return;
    }
    await showShelfLifePopup(
      context,
      report: report,
      kodeBarang: widget.item.kodeBarang,
      namaBarang: widget.item.namaBarang,
      expiredLabel: formatValidationDate(_expiredText) ?? '-',
    );
  }

  Future<void> _save() async {
    final error = itemDraftError(
      actualQty: _qty,
      condition: _condition,
      hasPhoto: _photoPath != null,
      hasExpiredDate: _expired != null,
    );
    if (error != null) {
      setState(() => _draftError = error);
      return;
    }
    setState(() => _draftError = null);

    final session = context.read<ValidationSessionProvider>();
    final ok = await session.saveItem(
      item: widget.item,
      actualQty: _qty!,
      barcode: _barcodeCtrl.text,
      expiredDate: _expired == null ? null : _formatDate(_expired!),
      condition: _condition,
      notes: _notesCtrl.text,
      photoPath: _photoPath,
    );
    if (!mounted) return;
    if (ok) {
      Navigator.of(context).pop();
    } else {
      setState(() => _draftError = session.error);
    }
  }

  Future<void> _delete() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Hapus item?'),
        content: Text(
          '${widget.item.namaBarang} akan dihapus dari daftar validasi '
          'dokumen ini.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Batal'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.errorText),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Hapus'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    final session = context.read<ValidationSessionProvider>();
    final ok = await session.removeItem(widget.item);
    if (ok && mounted) {
      Navigator.of(context).pop();
    } else if (mounted) {
      setState(() => _draftError = session.error);
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = context.watch<ValidationSessionProvider>();
    final busy = session.itemBusy;
    // Backend menolak `DELETE /items/{id}` tanpa izin ini.
    final canDelete = context.watch<AuthProvider>().hasPermission(
      'sj_validation.delete',
    );
    final needsPhoto = conditionNeedsPhoto(_condition);
    final shelf = _shelf;

    return DraggableSheet(
      children: [
        _ItemHero(item: widget.item),
        const SizedBox(height: 18),

        const SheetSectionTitle('Data pemeriksaan'),
        const SizedBox(height: 12),

        // Barcode produk
        _FieldLabel('Barcode kemasan (opsional)'),
        const SizedBox(height: 8),
        TextField(
          key: const Key('item-barcode'),
          controller: _barcodeCtrl,
          keyboardType: TextInputType.number,
          decoration: InputDecoration(
            hintText: 'Scan atau ketik barcode produk',
            prefixIcon: const Icon(Icons.barcode_reader, size: 20),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(AppRadius.input),
            ),
          ),
        ),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          onPressed: busy ? null : _pickBarcode,
          style: OutlinedButton.styleFrom(
            minimumSize: const Size.fromHeight(44),
          ),
          icon: const Icon(Icons.qr_code_scanner, size: 18),
          label: const Text('Scan Barcode Produk'),
        ),
        const SizedBox(height: 18),

        // Qty aktual
        _FieldLabel('Qty aktual *'),
        const SizedBox(height: 8),
        TextField(
          key: const Key('item-qty'),
          controller: _qtyCtrl,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: InputDecoration(
            hintText: 'Masukkan qty hasil hitung fisik',
            suffixText: widget.item.satuan.isEmpty ? null : widget.item.satuan,
            prefixIcon: const Icon(Icons.numbers, size: 20),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(AppRadius.input),
            ),
          ),
        ),
        const SizedBox(height: 18),

        // Tanggal expired
        _FieldLabel('Tanggal expired *'),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          key: const Key('item-expired'),
          onPressed: busy ? null : _pickDate,
          style: OutlinedButton.styleFrom(
            minimumSize: const Size.fromHeight(48),
            alignment: Alignment.centerLeft,
          ),
          icon: const Icon(Icons.event_outlined, size: 20),
          label: Text(
            _expired == null ? 'Pilih tanggal expired' : _formatDate(_expired!),
          ),
        ),
        if (_expired != null) ...[
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerLeft,
            child: Row(
              children: [
                TextButton(
                  key: const Key('item-expired-popup'),
                  onPressed: busy ? null : _openShelfLifePopup,
                  child: const Text('Detail umur'),
                ),
                TextButton(
                  onPressed: busy
                      ? null
                      : () => setState(() => _expired = null),
                  child: const Text('Hapus tanggal'),
                ),
              ],
            ),
          ),
        ],
        const SizedBox(height: 12),
        ShelfLifeCard(report: shelf),
        const SizedBox(height: 18),

        const SheetSectionTitle('Identifikasi & kondisi'),
        const SizedBox(height: 12),

        // Kondisi fisik
        const _FieldLabel('Kondisi fisik *'),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final c in conditionLabels.keys)
              ChoiceChip(
                label: Text(conditionLabel(c)),
                selected: _condition == c,
                onSelected: busy ? null : (_) => setState(() => _condition = c),
              ),
          ],
        ),
        const SizedBox(height: 16),

        // Foto — dua tombol terpisah (kamera / galeri) seperti di web, bukan
        // satu tombol yang memunculkan pilihan: di lapangan memakai sarung
        // tangan, tombol langsung lebih cepat daripada sheet kedua.
        _PhotoBlock(
          required: needsPhoto,
          busy: busy || _pickingPhoto,
          path: _photoPath,
          onCamera: _pickCamera,
          onGallery: _pickGallery,
          onRetake: _choosePhotoSource,
          onRemove: () => setState(() => _photoPath = null),
        ),
        const SizedBox(height: 18),

        // Catatan
        const _FieldLabel('Catatan'),
        const SizedBox(height: 8),
        TextField(
          controller: _notesCtrl,
          maxLines: 2,
          maxLength: 500,
          decoration: InputDecoration(
            hintText: 'Catatan singkat bila perlu',
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(AppRadius.input),
            ),
          ),
        ),

        if (_draftError != null) ...[
          const SizedBox(height: 16),
          _DraftError(message: _draftError!),
        ],
        const SizedBox(height: 20),

        FilledButton.icon(
          onPressed: busy ? null : _save,
          style: FilledButton.styleFrom(
            minimumSize: const Size.fromHeight(52),
            backgroundColor: AppColors.primary600,
          ),
          icon: busy
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.white,
                  ),
                )
              : const Icon(Icons.save_outlined),
          label: Text(busy ? 'Menyimpan...' : 'Simpan Validasi'),
        ),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          onPressed: busy || !canDelete ? null : _delete,
          style: OutlinedButton.styleFrom(
            minimumSize: const Size.fromHeight(48),
            foregroundColor: AppColors.errorText,
            side: const BorderSide(color: AppColors.errorBorder),
          ),
          icon: const Icon(Icons.delete_outline, size: 20),
          label: const Text('Hapus Item'),
        ),
        if (!canDelete)
          const Padding(
            padding: EdgeInsets.only(top: 6),
            child: Text(
              'Izin sj_validation.delete diperlukan untuk menghapus '
              'item dari dokumen.',
              style: TextStyle(
                fontSize: 12,
                color: AppColors.gray500,
                height: 1.35,
              ),
            ),
          ),
        const SizedBox(height: 8),
      ],
    );
  }
}

/// Kartu gelap identitas item — padanan blok `bg-slate-950` + aksen cyan
/// ("Item yang diperiksa") di `validasi-sj/page.tsx`.
class _ItemHero extends StatelessWidget {
  const _ItemHero({required this.item});

  final SjValidationItem item;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.gray900,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: AppColors.sky200.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(
              Icons.inventory_2_outlined,
              color: AppColors.sky200,
              size: 20,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'ITEM YANG DIPERIKSA',
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1.8,
                    color: AppColors.sky200,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  item.namaBarang,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    height: 1.4,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 8),
                Wrap(
                  crossAxisAlignment: WrapCrossAlignment.center,
                  spacing: 6,
                  runSpacing: 4,
                  children: [
                    Text(
                      item.kodeBarang,
                      style: const TextStyle(
                        fontSize: 11.5,
                        color: AppColors.gray300,
                        fontFamily: 'monospace',
                      ),
                    ),
                    const Text('•', style: TextStyle(color: AppColors.gray600)),
                    Text.rich(
                      TextSpan(
                        children: [
                          const TextSpan(
                            text: 'Rencana ',
                            style: TextStyle(color: AppColors.gray400),
                          ),
                          TextSpan(
                            text:
                                '${formatQty(item.expectedQty)} ${item.satuan}',
                            style: const TextStyle(
                              color: AppColors.gray200,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                      style: const TextStyle(fontSize: 11.5),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Blok bukti foto. Warna amber + judul "Bukti fotografi kondisi wajib" hanya
/// muncul saat kondisi memang mewajibkan foto (`conditionRequiresPhoto`), sama
/// seperti `photoRequired && …` di web; untuk kondisi baik blok tetap ada
/// tetapi netral, supaya operator bisa melampaui bukti tanpa mencari menu lain.
class _PhotoBlock extends StatelessWidget {
  const _PhotoBlock({
    required this.required,
    required this.busy,
    required this.path,
    required this.onCamera,
    required this.onGallery,
    required this.onRetake,
    required this.onRemove,
  });

  final bool required;
  final bool busy;
  final String? path;
  final VoidCallback onCamera;
  final VoidCallback onGallery;
  final VoidCallback onRetake;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final tint = required ? AppColors.warningBorder : AppColors.gray200;
    final background = required ? AppColors.warningBg : AppColors.surface;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: background,
        border: Border.all(color: tint),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: required
                      ? AppColors.amber500.withValues(alpha: 0.2)
                      : AppColors.gray100,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(
                  Icons.location_on_outlined,
                  size: 16,
                  color: required ? AppColors.amber700 : AppColors.gray600,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      required
                          ? 'Bukti fotografi kondisi wajib'
                          : 'Foto kondisi (opsional)',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: required
                            ? AppColors.amber900
                            : AppColors.gray700,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      required
                          ? 'Ambil foto langsung atau pilih dari galeri sebagai '
                                'bukti kondisi produk.'
                          : 'Lampirkan foto bila ada yang perlu dicatat.',
                      style: TextStyle(
                        fontSize: 11.5,
                        height: 1.35,
                        color: required
                            ? AppColors.amber700
                            : AppColors.gray500,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (path != null)
            _PhotoPreview(
              path: path!,
              onRetake: busy ? null : onRetake,
              onRemove: busy ? null : onRemove,
            )
          else
            Row(
              children: [
                Expanded(
                  child: _PhotoSourceButton(
                    key: const Key('item-photo-camera'),
                    label: 'Kamera',
                    icon: Icons.add_a_photo_outlined,
                    accent: required,
                    onPressed: busy ? null : onCamera,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _PhotoSourceButton(
                    key: const Key('item-photo-gallery'),
                    label: 'Galeri',
                    icon: Icons.image_outlined,
                    accent: required,
                    onPressed: busy ? null : onGallery,
                  ),
                ),
              ],
            ),
        ],
      ),
    );
  }
}

class _PhotoSourceButton extends StatelessWidget {
  const _PhotoSourceButton({
    super.key,
    required this.label,
    required this.icon,
    required this.accent,
    required this.onPressed,
  });

  final String label;
  final IconData icon;
  final bool accent;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final foreground = accent ? AppColors.amber700 : AppColors.gray700;
    return OutlinedButton.icon(
      onPressed: onPressed,
      icon: Icon(icon, size: 20, color: foreground),
      label: Text(
        label,
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w700,
          color: foreground,
        ),
      ),
      style: OutlinedButton.styleFrom(
        minimumSize: const Size.fromHeight(56),
        backgroundColor: AppColors.card,
        side: BorderSide(
          color: accent ? AppColors.amber200 : AppColors.gray200,
          width: 2,
        ),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
    );
  }
}

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

class _PhotoPreview extends StatelessWidget {
  const _PhotoPreview({
    required this.path,
    required this.onRetake,
    required this.onRemove,
  });

  final String path;
  final VoidCallback? onRetake;
  final VoidCallback? onRemove;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(14),
          child: Image.file(
            File(path),
            height: 180,
            fit: BoxFit.cover,
            errorBuilder: (_, _, _) => Container(
              height: 180,
              color: AppColors.gray100,
              alignment: Alignment.center,
              child: const Text(
                'Foto tidak bisa dimuat',
                style: TextStyle(color: AppColors.gray500, fontSize: 13),
              ),
            ),
          ),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: onRetake,
                icon: const Icon(Icons.refresh, size: 18),
                label: const Text('Ganti'),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: TextButton.icon(
                onPressed: onRemove,
                style: TextButton.styleFrom(
                  foregroundColor: AppColors.errorText,
                ),
                icon: const Icon(Icons.close, size: 18),
                label: const Text('Hapus'),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _DraftError extends StatelessWidget {
  const _DraftError({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.errorBg,
        border: Border.all(color: AppColors.errorBorder),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.error_outline, size: 18, color: AppColors.errorText),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(
                color: AppColors.errorText,
                fontSize: 13,
                height: 1.35,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

DateTime? _parseDate(String? value) {
  if (value == null || value.isEmpty) {
    return null;
  }
  return DateTime.tryParse(value);
}

/// Format `yyyy-MM-dd` — sama dengan yang disimpan backend & dikirim form.
String _formatDate(DateTime date) =>
    '${date.year.toString().padLeft(4, '0')}-'
    '${date.month.toString().padLeft(2, '0')}-'
    '${date.day.toString().padLeft(2, '0')}';
