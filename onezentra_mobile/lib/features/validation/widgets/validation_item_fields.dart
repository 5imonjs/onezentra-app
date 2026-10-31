import 'dart:io';

import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';

import 'package:onezentra_mobile/core/theme/app_theme.dart';
import 'package:onezentra_mobile/features/validation/models/validation_models.dart';
import 'package:onezentra_mobile/shared/widgets/app_widgets.dart';

/// Pola input bersama untuk sheet validasi item rencana ([_ItemValidationSheet]
/// di validation_session_page.dart) dan sheet barang luar rencana
/// ([_ExtraItemSheet]): chips kondisi, bukti foto, dan pemilih tanggal
/// expired. Semua dipakai ulang oleh kedua sheet agar tampilan, urutan tap,
/// dan perilakunya selalu identik — perubahan pola cukup di satu tempat.

/// Pemilih foto yang bisa disuntik untuk test. Default memakai ImagePicker.
typedef EvidencePhotoPicker =
    Future<String?> Function({required bool fromCamera});

/// Baris chip pilihan kondisi barang — pola pill InkWell yang sama di kedua
/// sheet validasi.
class ConditionChipRow extends StatelessWidget {
  const ConditionChipRow({
    required this.value,
    required this.onChanged,
    super.key,
  });

  /// Kondisi terpilih saat ini.
  final String value;

  /// Dipanggil dengan nilai kondisi baru saat chip ditekan.
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) => DropdownButtonFormField<String>(
    initialValue: value,
    decoration: InputDecoration(
      labelText: 'Kondisi fisik',
      border: OutlineInputBorder(borderRadius: AppTheme.radiusLg),
    ),
    items: ValidationCondition.values.map((opt) => DropdownMenuItem(
      value: opt,
      child: Text(ValidationCondition.label(opt)),
    )).toList(),
    onChanged: (v) => v != null ? onChanged(v) : null,
  );
}

/// Blok bukti foto: tombol Kamera/Galeri, pratinjau, Ganti/Hapus, dan pesan
/// error izin — logika ImagePicker (kompres 1280px, kualitas 80) hidup di
/// sini sehingga kedua sheet tidak menggandakannya.
class PhotoEvidenceField extends StatefulWidget {
  const PhotoEvidenceField({
    required this.photoPath,
    required this.onChanged,
    this.picker,
    this.title = 'Foto bukti *',
    this.subtitle =
        'Kondisi ini wajib foto. Ambil langsung atau pilih dari galeri.',
    this.enabled = true,
    super.key,
  });

  /// Path foto terpilih (dikelola parent — ikut dipakai submit).
  final String? photoPath;

  /// Dipanggil setiap foto berubah; null berarti dihapus.
  final ValueChanged<String?> onChanged;

  /// Overrides ImagePicker untuk test. Default memakai [ImagePicker].
  final EvidencePhotoPicker? picker;

  final String title;
  final String subtitle;

  /// false saat form sedang menyimpan — semua tombol nonaktif.
  final bool enabled;

  @override
  State<PhotoEvidenceField> createState() => _PhotoEvidenceFieldState();
}

class _PhotoEvidenceFieldState extends State<PhotoEvidenceField> {
  bool _picking = false;
  String? _error;

  bool get _busy => _picking || !widget.enabled;

  Future<void> _pick({required bool fromCamera}) async {
    if (_busy) {
      return;
    }
    setState(() {
      _picking = true;
      _error = null;
    });
    try {
      String? path;
      var picker = widget.picker;
      if (picker != null) {
        path = await picker(fromCamera: fromCamera);
      } else {
        var file = await ImagePicker().pickImage(
          source: fromCamera ? ImageSource.camera : ImageSource.gallery,
          maxWidth: 1280,
          imageQuality: 80,
        );
        path = file?.path;
      }
      if (!mounted) {
        return;
      }
      if (path != null && path.isNotEmpty) {
        widget.onChanged(path);
      }
    } on PlatformException catch (error) {
      if (!mounted) {
        return;
      }
      var denied =
          error.code == 'camera_access_denied' ||
          error.code == 'photo_access_denied';
      setState(() {
        _error = denied
            ? 'Izin kamera/galeri ditolak. Aktifkan izin di pengaturan '
                  'perangkat.'
            : 'Foto tidak dapat diambil. Coba lagi.';
      });
    } catch (error, stack) {
      debugPrint('PhotoEvidenceField._pick: ${error.runtimeType}: $error');
      debugPrintStack(stackTrace: stack, maxFrames: 8);
      if (!mounted) {
        return;
      }
      setState(() => _error = 'Foto tidak dapat diambil. Coba lagi.');
    } finally {
      if (mounted) {
        setState(() => _picking = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    padding: const EdgeInsets.all(AppTheme.space3),
    decoration: BoxDecoration(
      color: context.colors.warningWell,
      borderRadius: AppTheme.radiusLg,
      border: Border.all(color: context.colors.warningText),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(
              Icons.photo_camera_rounded,
              size: 16,
              color: context.colors.warningText,
            ),
            const SizedBox(width: 6),
            Expanded(
              child: Text(
                widget.title,
                style: GoogleFonts.roboto(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w700,
                  color: context.colors.warningText,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 3),
        Text(
          widget.subtitle,
          style: GoogleFonts.roboto(
            fontSize: 11.5,
            height: 1.4,
            color: context.colors.warningText,
          ),
        ),
        const SizedBox(height: AppTheme.space3),
        if (widget.photoPath == null)
          Row(
            children: [
              Expanded(
                child: AppSecondaryButton(
                  text: 'Kamera',
                  height: 44,
                  leadingIcon: Icons.photo_camera_rounded,
                  isLoading: _picking,
                  onPressed: _busy ? null : () => _pick(fromCamera: true),
                ),
              ),
              const SizedBox(width: AppTheme.space2),
              Expanded(
                child: AppSecondaryButton(
                  text: 'Galeri',
                  height: 44,
                  leadingIcon: Icons.photo_library_rounded,
                  onPressed: _busy ? null : () => _pick(fromCamera: false),
                ),
              ),
            ],
          )
        else ...[
          ClipRRect(
            borderRadius: AppTheme.radiusLg,
            child: Image.file(
              File(widget.photoPath!),
              width: double.infinity,
              height: 160,
              fit: BoxFit.cover,
              errorBuilder: (_, _, _) => Container(
                width: double.infinity,
                height: 96,
                alignment: Alignment.center,
                color: context.colors.gray100,
                child: Text(
                  'Pratinjau tidak tersedia',
                  style: GoogleFonts.roboto(
                    fontSize: 12,
                    color: context.colors.textMuted,
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(height: AppTheme.space2),
          Row(
            children: [
              Expanded(
                child: AppSecondaryButton(
                  text: 'Ganti',
                  height: 44,
                  leadingIcon: Icons.refresh_rounded,
                  onPressed: _busy ? null : () => _pick(fromCamera: true),
                ),
              ),
              const SizedBox(width: AppTheme.space2),
              Expanded(
                child: AppSecondaryButton(
                  text: 'Hapus',
                  height: 44,
                  leadingIcon: Icons.delete_outline_rounded,
                  onPressed: widget.enabled
                      ? () => widget.onChanged(null)
                      : null,
                ),
              ),
            ],
          ),
        ],
        if (_error != null) ...[
          const SizedBox(height: AppTheme.space2),
          Text(
            _error!,
            style: GoogleFonts.roboto(
              fontSize: 11.5,
              height: 1.4,
              color: context.colors.dangerText,
            ),
          ),
        ],
      ],
    ),
  );
}

/// Format tanggal Indonesia: dd/MM/yyyy (dipakai controller & pratinjau).
String formatDateId(DateTime? value) {
  if (value == null) {
    return '';
  }
  String two(int part) => part.toString().padLeft(2, '0');
  return '${two(value.day)}/${two(value.month)}/${value.year}';
}

/// Memunculkan pemilih tanggal expired (popup Cupertino) — pola yang sama di
/// kedua sheet validasi. Mengembalikan tanggal yang dipilih atau null.
Future<DateTime?> pickExpiredDate(BuildContext context, {DateTime? initial}) {
  var start = initial ?? DateTime.now().add(const Duration(days: 30));
  DateTime? changed;
  // Nilai yang tampil di roda (initial) langsung dianggap dipilih: user yang
  // menekan "Pilih" tanpa menggeser roda tetap mendapatkan tanggal terlihat,
  // bukan null yang membuat field diam-diam kosong. "Batal" tetap null.
  return showCupertinoModalPopup<DateTime?>(
    context: context,
    builder: (_) => Container(
      height: 260,
      padding: const EdgeInsets.all(AppTheme.space4),
      color: context.colors.surface,
      child: Column(
        children: [
          Container(
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: context.colors.gray300,
              borderRadius: AppTheme.radiusFull,
            ),
          ),
          Expanded(
            child: CupertinoDatePicker(
              mode: CupertinoDatePickerMode.date,
              initialDateTime: start,
              minimumDate: DateTime(2000),
              maximumDate: DateTime(2100),
              onDateTimeChanged: (DateTime value) => changed = value,
              backgroundColor: context.colors.surface,
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppTheme.space3),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  TextButton(
                    onPressed: () => Navigator.of(context).pop(),
                    child: const Text('Batal'),
                  ),
                  FilledButton(
                    onPressed: () =>
                        Navigator.of(context).pop(changed ?? start),
                    style: FilledButton.styleFrom(
                      backgroundColor: AppTheme.primary500,
                    ),
                    child: const Text('Pilih'),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    ),
  );
}

/// Field tanggal expired read-only yang membuka [pickExpiredDate].
class ExpiredDateField extends StatelessWidget {
  const ExpiredDateField({
    required this.controller,
    required this.onPicked,
    this.isRequired = true,
    this.validator,
    super.key,
  });

  final TextEditingController controller;

  /// Dipanggil dengan tanggal terpilih (null bila batal).
  final ValueChanged<DateTime?> onPicked;

  /// true = label wajib ("Tanggal expired *", dipakai sheet item rencana);
  /// false = label opsional (sheet barang luar rencana).
  final bool isRequired;

  /// Validator Form (dipass ke AppTextField).
  final String? Function(String?)? validator;

  @override
  Widget build(BuildContext context) => AppTextField(
    controller: controller,
    label: isRequired ? 'Tanggal expired *' : 'Tanggal expired',
    hint: isRequired ? 'Wajib diisi' : 'Opsional',
    prefixIcon: Icons.calendar_today_rounded,
    readOnly: true,
    onTap: () async => onPicked(await pickExpiredDate(context)),
    validator: validator,
  );
}
