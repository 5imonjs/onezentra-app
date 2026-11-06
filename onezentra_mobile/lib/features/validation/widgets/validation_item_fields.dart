import 'dart:io';

import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';

import 'package:onezentra_mobile/core/theme/app_theme.dart';
import 'package:onezentra_mobile/features/validation/models/validation_models.dart';
import 'package:onezentra_mobile/shared/widgets/app_widgets.dart';

/// Pola input bersama untuk sheet validasi item rencana (`ItemValidationSheet`)
/// dan sheet barang luar rencana (`ExtraItemSheet`): chips kondisi, bukti
/// foto, dan pemilih tanggal
/// expired. Semua dipakai ulang oleh kedua sheet agar tampilan, urutan tap,
/// dan perilakunya selalu identik — perubahan pola cukup di satu tempat.

/// Pemilih foto yang bisa disuntik untuk test. Default memakai ImagePicker.
typedef EvidencePhotoPicker =
    Future<String?> Function({required bool fromCamera});

/// Baris chip pilihan kondisi barang — pola pill InkWell yang sama di kedua
/// sheet validasi.
///
/// Kondisi TIDAK boleh terisi otomatis: pengguna wajib melihat & memilih
/// pilihan dengan sengaja — sebelumnya terisinya otomatis "FISIK_BAGUS"
/// membuat pelanggan selesai sesi dengan hasil yang hanya "sengaja-kurang",
/// padahal seharusnya menjadi pilihan sadar.
class ConditionChipRow extends StatelessWidget {
  const ConditionChipRow({
    required this.value,
    required this.onChanged,
    super.key,
  });

  /// Kondisi terpilih saat ini. Null = belum dipilih — render tombol
  /// pemilih dengan placeholder "Pilih kondisi fisik …".
  final String? value;

  /// Dipanggil dengan nilai kondisi baru saat chip ditekan.
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) => DropdownButtonFormField<String>(
    initialValue: value,
    hint: Text(
      'Pilih kondisi',
      style: GoogleFonts.roboto(fontSize: 14, color: context.colors.textMuted),
    ),
    decoration: const InputDecoration(
      labelText: 'Kondisi fisik',
      border: OutlineInputBorder(borderRadius: AppTheme.radiusLg),
    ),
    items: ValidationCondition.values
        .map(
          (opt) => DropdownMenuItem(
            value: opt,
            child: Text(ValidationCondition.label(opt)),
          ),
        )
        .toList(),
    onChanged: (v) => v != null ? onChanged(v) : null,
    // Trigger native validation when saving via form key.
    validator: (v) => v == null ? 'Pilih kondisi fisik dulu.' : null,
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

/// Panel pemeriksaan umur produk — sisa simpan vs standar umur master.
///
/// Logika sama dengan web (`validasi-sj/page.tsx`): tanggal acuan = tanggal
/// hari ini, sisa = tanggal expired − hari ini, lalu dibandingkan ke standar
/// umur master (bulan). Dipakai sheet validasi item & barang luar rencana.
class UmurStandarPanel extends StatelessWidget {
  const UmurStandarPanel({
    required this.expiredDate,
    required this.standarUmur,
    this.kodeBarang,
    this.namaBarang,
    super.key,
  });

  final DateTime? expiredDate;
  final int? standarUmur;
  final String? kodeBarang;
  final String? namaBarang;

  @override
  Widget build(BuildContext context) {
    var expired = expiredDate;
    var result = UmurCalculator.hitung(expired);
    var status = expired == null
        ? UmurCalculator.statusStandardTidakTersedia
        : UmurCalculator.status(standarUmur: standarUmur, sisa: result);
    var kadaluarsa = status == UmurCalculator.statusKadaluarsa;
    var perluPerhatian = status == UmurCalculator.statusPerluPerhatian;
    var aman = status == UmurCalculator.statusAman;
    var statusColor = context.colors.textMuted;
    var statusWell = context.colors.warningWell;
    if (kadaluarsa) {
      statusColor = context.colors.danger;
      statusWell = context.colors.dangerWell;
    } else if (perluPerhatian) {
      statusColor = context.colors.warning;
      statusWell = context.colors.warningWell;
    } else if (aman) {
      statusColor = context.colors.success;
      statusWell = context.colors.successWell;
    }

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AppTheme.space3),
      decoration: BoxDecoration(
        color: statusWell,
        borderRadius: AppTheme.radiusLg,
        border: Border.all(color: statusColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  expired == null
                      ? 'Pemeriksaan umur produk'
                      : 'Hasil pemeriksaan umur produk',
                  style: GoogleFonts.roboto(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                    color: statusColor,
                  ),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppTheme.space2,
                  vertical: 2,
                ),
                decoration: BoxDecoration(
                  color: statusColor.withValues(alpha: 0.12),
                  borderRadius: AppTheme.radiusFull,
                ),
                child: Text(
                  status,
                  style: GoogleFonts.roboto(
                    fontSize: 10.5,
                    fontWeight: FontWeight.w800,
                    color: statusColor,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppTheme.space3),
          if (expired == null)
            Text(
              'Isi tanggal expired untuk melihat perbandingan sisa umur vs standar.',
              style: GoogleFonts.roboto(
                fontSize: 12,
                height: 1.4,
                color: context.colors.textSecondary,
              ),
            )
          else ...[
            Row(
              children: [
                Expanded(
                  child: _UmurStat(
                    label: 'Sisa simpan',
                    value: '${result.totalMonths}',
                    suffix: 'bulan',
                    valueColor: kadaluarsa
                        ? context.colors.danger
                        : perluPerhatian
                        ? context.colors.warning
                        : context.colors.success,
                  ),
                ),
                Expanded(
                  child: _UmurStat(
                    label: 'Standar',
                    value:
                        '${standarUmur != null && standarUmur! > 0 ? standarUmur : 0}',
                    suffix: 'bulan',
                    valueColor: context.colors.textPrimary,
                  ),
                ),
                Expanded(
                  child: _UmurStat(
                    label: 'Selisih',
                    value: UmurCalculator.formatSelisih(
                      expired,
                      standarUmur ?? 0,
                    ),
                    suffix: 'selisih',
                    valueColor: statusColor,
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppTheme.space3),
            Text(
              status == UmurCalculator.statusStandardTidakTersedia
                  ? 'Standar umur produk tidak tersedia. Data standar umur perlu diisi di database standar umur produk.'
                  : kadaluarsa
                  ? 'Produk sudah kadaluarsa dan perlu penanganan segera.'
                  : perluPerhatian
                  ? 'Sisa simpan kurang dari standar.'
                  : 'Sisa simpan memenuhi standar.',
              style: GoogleFonts.roboto(
                fontSize: 12,
                height: 1.4,
                fontWeight: FontWeight.w600,
                color: statusColor,
              ),
            ),
            if (standarUmur != null && standarUmur! > 0) ...[
              const SizedBox(height: AppTheme.space3),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'Perbandingan terhadap standar',
                        style: GoogleFonts.roboto(
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          color: context.colors.textMuted,
                        ),
                      ),
                      Text(
                        standarUmur != null && standarUmur! > 0
                            ? '${result.totalMonths / standarUmur! * 100}'
                            : '0',
                        style: GoogleFonts.roboto(
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          color: context.colors.textMuted,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  LinearProgressIndicator(
                    value: (result.totalMonths / (standarUmur ?? 1)).clamp(
                      0.0,
                      1.0,
                    ),
                    minHeight: 6,
                    backgroundColor: context.colors.gray100,
                    valueColor: AlwaysStoppedAnimation<Color>(statusColor),
                  ),
                ],
              ),
            ],
          ],
        ],
      ),
    );
  }
}

/// Satu statistik umur yang tampil di panel pemeriksaan umur.
class _UmurStat extends StatelessWidget {
  const _UmurStat({
    required this.label,
    required this.value,
    required this.suffix,
    required this.valueColor,
  });

  final String label;
  final String value;
  final String suffix;
  final Color valueColor;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        label,
        style: GoogleFonts.roboto(
          fontSize: 10,
          fontWeight: FontWeight.w700,
          color: context.colors.textMuted,
        ),
      ),
      const SizedBox(height: 2),
      Text(
        value,
        style: GoogleFonts.roboto(
          fontSize: 16,
          fontWeight: FontWeight.w800,
          color: valueColor,
        ),
      ),
      Text(
        suffix,
        style: GoogleFonts.roboto(
          fontSize: 9.5,
          fontWeight: FontWeight.w600,
          color: context.colors.textMuted,
        ),
      ),
    ],
  );
}

/// Parse tanggal date-only ('yyyy-mm-dd') dari backend menjadi tanggal
/// LOKAL, bukan UTC-midnight bawaan DateTime.tryParse — bila tidak, di
/// zona waktu di belakang UTC tanggal tampil mundur sehari dan setiap
/// "edit" terasa memaksa nilai berubah.
DateTime? parseDateOnlyLocal(String? value) {
  var raw = (value ?? '').trim();
  if (raw.isEmpty) {
    return null;
  }
  var dateOnly = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(raw);
  if (dateOnly != null) {
    return DateTime(
      int.parse(dateOnly[1]!),
      int.parse(dateOnly[2]!),
      int.parse(dateOnly[3]!),
    );
  }
  // Timestamp (mis. WIB tengah malam yang di-serialize sebagai UTC
  // sebelumnya, 2027-06-05T17:00Z) — konversi ke kalender lokal dulu,
  // baru ambil komponen tanggalnya; bukan komponen UTC.
  var parsed = DateTime.tryParse(raw);
  if (parsed == null) {
    return null;
  }
  var local = parsed.toLocal();
  return DateTime(local.year, local.month, local.day);
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
