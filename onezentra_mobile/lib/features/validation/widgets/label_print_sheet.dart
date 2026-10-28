import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'package:onezentra_mobile/core/printer/label_print_provider.dart';
import 'package:onezentra_mobile/core/printer/thermal_label.dart';

/// Panel cetak label batch untuk satu item yang baru divalidasi.
///
/// Sengaja dipisah dari halaman validasi supaya alur printer bisa diuji tanpa
/// merender seluruh halaman, dan supaya halaman yang sudah panjang tidak makin
/// sulit dibaca.
class LabelPrintSheet extends StatefulWidget {
  const LabelPrintSheet({
    required this.label,
    this.printer,
    this.onPrintAttempted,
    super.key,
  });

  final BatchLabelData label;
  final LabelPrintProvider? printer;

  /// Paritas web: web melaporkan label "tercetak" SAAT tombol cetak
  /// ditekan, bukan setelah menunggu hasil printer. Mobile mengikuti pola
  /// yang sama — [onPrintAttempted] dipanggil setelah setiap percobaan
  /// cetak, apa pun hasil Bluetooth-nya, supaya status tercetak & badge
  /// web/mobile selalu konsisten.
  final Future<void> Function()? onPrintAttempted;

  /// Buka panel cetak. Mengembalikan true kalau label berhasil dicetak.
  static Future<bool?> show(
    BuildContext context, {
    required BatchLabelData label,
    LabelPrintProvider? printer,
    Future<void> Function()? onPrintAttempted,
  }) => showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    builder: (_) => LabelPrintSheet(
      label: label,
      printer: printer,
      onPrintAttempted: onPrintAttempted,
    ),
  );

  @override
  State<LabelPrintSheet> createState() => _LabelPrintSheetState();
}

class _LabelPrintSheetState extends State<LabelPrintSheet> {
  late final LabelPrintProvider _printer =
      widget.printer ?? LabelPrintProvider();

  @override
  void initState() {
    super.initState();
    unawaited(_printer.initialize());
  }

  @override
  void dispose() {
    if (widget.printer == null) {
      _printer.dispose();
    }
    super.dispose();
  }

  Future<void> _print() async {
    var ok = await _printer.printLabel(widget.label);
    debugPrint('CetakLabel: printLabel selesai -> $ok');
    // Paritas web: lapor label tercetak apa pun hasil Bluetooth-nya —
    // kertas memang keluar bahkan saat aplikasi salah membaca hasil, dan
    // dulu laporan yang hilang di sini membuat status web tidak berubah.
    try {
      await widget.onPrintAttempted?.call();
    } catch (e) {
      debugPrint('CetakLabel: laporan server gagal: $e');
    }
    if (!mounted) {
      return;
    }
    if (ok) {
      // Sheet ditutup otomatis supaya operator langsung lanjut scan produk
      // berikutnya tanpa satu ketukan tambahan.
      Navigator.of(context).pop(true);
    }
  }

  @override
  Widget build(BuildContext context) =>
      ChangeNotifierProvider<LabelPrintProvider>.value(
        value: _printer,
        child: Padding(
          padding: EdgeInsets.only(
            left: 16,
            right: 16,
            top: 16,
            bottom: MediaQuery.of(context).viewInsets.bottom + 16,
          ),
          child: _Body(onPrint: _print),
        ),
      );
}

/// Badan panel: semua kontrol cetak. Stateless supaya rebuild efficient dan
/// mudah diuji lewat [LabelPrintProvider] palsu.
class _Body extends StatelessWidget {
  const _Body({required this.onPrint});

  final Future<void> Function() onPrint;

  @override
  Widget build(BuildContext context) {
    var printer = context.watch<LabelPrintProvider>();
    return SafeArea(
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Cetak Label', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 16),
            _PrinterSelector(printer: printer),
            const SizedBox(height: 12),
            _PairingSection(printer: printer),
            const SizedBox(height: 12),
            _WidthSelector(printer: printer),
            _Toggle(
              label: 'Cetak barcode (bisa discan mesin)',
              value: printer.enableBarcode,
              hint: 'Matikan untuk printer yang hanya bisa cetak teks polos.',
              onChanged: (v) => printer.setEnableBarcode(value: v),
            ),
            _Toggle(
              label: 'Potong kertas setelah label',
              value: printer.enableCut,
              hint: 'Matikan untuk printer tanpa pisau.',
              onChanged: (v) => printer.setEnableCut(value: v),
            ),
            if (printer.error != null)
              _Banner(text: printer.error!, error: true),
            if (printer.success != null)
              _Banner(text: printer.success!, error: false),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: printer.scanning ? null : printer.scan,
                    child: const Text('Cari Printer'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  flex: 2,
                  child: FilledButton(
                    onPressed: printer.printing ? null : onPrint,
                    child: printer.printing
                        ? const SizedBox(
                            height: 16,
                            width: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Text('Cetak Label'),
                  ),
                ),
              ],
            ),
            if (printer.success != null)
              TextButton(
                onPressed: printer.printing ? null : onPrint,
                child: const Text('Cetak ulang'),
              ),
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Tutup'),
            ),
          ],
        ),
      ),
    );
  }
}

class _PrinterSelector extends StatelessWidget {
  const _PrinterSelector({required this.printer});

  final LabelPrintProvider printer;

  @override
  Widget build(BuildContext context) {
    if (printer.available.isEmpty) {
      return Text(
        printer.scanning
            ? 'Mencari printer yang sudah dipasangkan...'
            : 'Belum ada printer. Pastikan printer sudah dipasangkan lewat '
                  'Pengaturan Bluetooth HP, lalu tekan "Cari Printer".',
        style: Theme.of(context).textTheme.bodySmall,
      );
    }
    return DropdownButtonFormField<String>(
      initialValue: printer.selected?.address,
      decoration: const InputDecoration(
        labelText: 'Printer',
        border: OutlineInputBorder(),
      ),
      items: printer.available
          .map(
            (p) => DropdownMenuItem(
              value: p.address,
              child: Text(p.displayName, overflow: TextOverflow.ellipsis),
            ),
          )
          .toList(),
      onChanged: (address) {
        var match = printer.available.where((p) => p.address == address);
        if (match.isNotEmpty) {
          unawaited(printer.select(match.first));
        }
      },
    );
  }
}

/// Pairing perangkat baru dari dalam aplikasi: discovery perangkat sekitar
/// + tombol Pair per baris. Berhasil pairing → daftar bonded dimuat ulang
/// sehingga printer langsung bisa dipilih tanpa buka Pengaturan HP.
class _PairingSection extends StatefulWidget {
  const _PairingSection({required this.printer});

  final LabelPrintProvider printer;

  @override
  State<_PairingSection> createState() => _PairingSectionState();
}

class _PairingSectionState extends State<_PairingSection> {
  late final TextEditingController _pinController = TextEditingController(
    text: '0000',
  );

  @override
  void dispose() {
    _pinController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    var printer = widget.printer;
    var textTheme = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        OutlinedButton.icon(
          onPressed: printer.discovering
              ? printer.stopDiscovery
              : printer.startDiscovery,
          icon: Icon(
            printer.discovering
                ? Icons.stop_rounded
                : Icons.bluetooth_searching_rounded,
          ),
          label: Text(
            printer.discovering ? 'Berhenti Mencari' : 'Pairing Perangkat Baru',
          ),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _pinController,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'PIN printer',
                  hintText: '0000',
                  border: OutlineInputBorder(),
                  contentPadding: EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 8,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 8),
            const Expanded(
              flex: 2,
              child: Text(
                'Umumnya 0000 / 1234. Kosongkan bila printer tanpa PIN.',
              ),
            ),
          ],
        ),
        if (printer.discovering && printer.discovered.isEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Row(
              children: [
                const SizedBox(
                  height: 14,
                  width: 14,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Mencari printer di sekitar HP…',
                    style: textTheme.bodySmall,
                  ),
                ),
              ],
            ),
          ),
        for (var device in printer.discovered)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    device.displayName,
                    style: textTheme.bodyMedium,
                    maxLines: 1,
                    softWrap: false,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const SizedBox(width: 8),
                FilledButton.tonal(
                  onPressed: printer.bonding
                      ? null
                      : () => printer.bond(
                          device,
                          pin: _pinController.text.trim(),
                        ),
                  child: const Text('Pair'),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _WidthSelector extends StatelessWidget {
  const _WidthSelector({required this.printer});

  final LabelPrintProvider printer;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 12),
    child: SegmentedButton<LabelWidth>(
      segments: LabelWidth.values
          .map((w) => ButtonSegment(value: w, label: Text(w.label)))
          .toList(),
      selected: {printer.width},
      onSelectionChanged: (s) => printer.setWidth(s.first),
    ),
  );
}

class _Toggle extends StatelessWidget {
  const _Toggle({
    required this.label,
    required this.value,
    required this.onChanged,
    this.hint,
  });

  final String label;
  final bool value;
  final ValueChanged<bool> onChanged;
  final String? hint;

  @override
  Widget build(BuildContext context) => SwitchListTile(
    contentPadding: EdgeInsets.zero,
    title: Text(label, style: Theme.of(context).textTheme.bodyMedium),
    subtitle: hint == null
        ? null
        : Text(hint!, style: Theme.of(context).textTheme.bodySmall),
    value: value,
    onChanged: onChanged,
  );
}

class _Banner extends StatelessWidget {
  const _Banner({required this.text, required this.error});

  final String text;
  final bool error;

  @override
  Widget build(BuildContext context) {
    var colors = Theme.of(context).colorScheme;
    return Container(
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: error ? colors.errorContainer : colors.secondaryContainer,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        text,
        style: Theme.of(context).textTheme.bodySmall?.copyWith(
          color: error ? colors.onErrorContainer : colors.onSecondaryContainer,
        ),
      ),
    );
  }
}
