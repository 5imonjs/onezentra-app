import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:onezentra_mobile/core/printer/escpos_label.dart';
import 'package:onezentra_mobile/core/printer/label_printer.dart';
import 'package:onezentra_mobile/core/printer/thermal_label.dart';

/// Mengatur alur: cari printer → operator memilih → cetak label.
///
/// Semua keputusan (label mana, printer mana, pesan error) ada di sini supaya
/// UI tinggal menampilkan, dan supaya alurnya bisa diuji memakai [LabelPrinter]
/// palsu tanpa radio bluetooth sungguhan.
class LabelPrintProvider extends ChangeNotifier {
  LabelPrintProvider({
    LabelPrinter? printer,
    BluetoothPermissionRequest? requestPermissions,
  }) : _printer = printer ?? BluetoothLabelPrinter(),
       _requestPermissions = requestPermissions ?? BluetoothPermissions.request;

  final LabelPrinter _printer;
  final BluetoothPermissionRequest _requestPermissions;

  static const _selectedPrinterKey = 'label_print_selected_printer_address';
  static const _widthKey = 'label_print_width_index';
  static const _enableBarcodeKey = 'label_print_enable_barcode';
  static const _enableCutKey = 'label_print_enable_cut';

  List<DiscoveredPrinter> _available = const [];
  DiscoveredPrinter? _selected;
  String? _preferredAddress;
  Future<void>? _initialization;
  bool _scanning = false;
  bool _printing = false;
  String? _error;
  String? _success;

  /// Discovery perangkat baru (belum tentu bonded) untuk alur pairing.
  List<DiscoveredPrinter> _discovered = const [];
  bool _discovering = false;
  String? _bondingAddress;
  StreamSubscription<DiscoveredPrinter>? _discoverySub;

  List<DiscoveredPrinter> get available => _available;
  DiscoveredPrinter? get selected => _selected;
  bool get scanning => _scanning;
  bool get printing => _printing;
  String? get error => _error;
  String? get success => _success;
  List<DiscoveredPrinter> get discovered => _discovered;
  bool get discovering => _discovering;
  bool get bonding => _bondingAddress != null;

  /// Width printer. Bawaan 58 mm — paling umum di gudang.
  ///
  /// Persisten: pilihan operator tersimpan sehingga alur cetak-langsung
  /// selalu memakai settingan yang sudah benar tanpa buka panel.
  LabelWidth _width = LabelWidth.w58;
  LabelWidth get width => _width;

  void setWidth(LabelWidth value) {
    if (_width == value) {
      return;
    }
    _width = value;
    notifyListeners();
    _save(
      _widthKey,
      (preferences) =>
          preferences.setInt(_widthKey, LabelWidth.values.indexOf(value)),
    );
  }

  /// Cetak barcode sebagai gambar yang bisa discan mesin, atau teks polos.
  ///
  /// Bawaan true. Printer thermal entry-level umumnya mendukung ESC/POS
  /// barcode; yang tidak bisa harus dimatikan karena byte kontrol ESC/POS akan
  /// tercetak sebagai karakter aneh. Persisten — lihat [width].
  bool _enableBarcode = true;
  bool get enableBarcode => _enableBarcode;

  void setEnableBarcode({required bool value}) {
    if (_enableBarcode == value) {
      return;
    }
    _enableBarcode = value;
    notifyListeners();
    _save(
      _enableBarcodeKey,
      (preferences) => preferences.setBool(_enableBarcodeKey, value),
    );
  }

  /// Printer tanpa pisau potong tidak boleh diberi perintah potong.
  /// Persisten — lihat [width].
  bool _enableCut = true;
  bool get enableCut => _enableCut;

  void setEnableCut({required bool value}) {
    if (_enableCut == value) {
      return;
    }
    _enableCut = value;
    notifyListeners();
    _save(
      _enableCutKey,
      (preferences) => preferences.setBool(_enableCutKey, value),
    );
  }

  /// Simpan satu preferensi printer; kegagalan storage tidak boleh
  /// menggagalkan aksi yang sedang berjalan.
  Future<void> _save(
    String key,
    Future<void> Function(SharedPreferences preferences) write,
  ) async {
    try {
      await write(await SharedPreferences.getInstance());
    } catch (e) {
      debugPrint('LabelPrintProvider.save($key): $e');
    }
  }

  Future<void> initialize() => _initialization ??= _initialize();

  Future<void> _initialize() async {
    try {
      var preferences = await SharedPreferences.getInstance();
      _preferredAddress = preferences.getString(_selectedPrinterKey);
      // Settingan cetak ikut dimuat supaya cetak-langsung memakai konfigurasi
      // yang pernah dipilih operator, bukan bawaan setiap kali aplikasi baru.
      var widthIndex = preferences.getInt(_widthKey);
      if (widthIndex != null &&
          widthIndex >= 0 &&
          widthIndex < LabelWidth.values.length) {
        _width = LabelWidth.values[widthIndex];
      }
      _enableBarcode = preferences.getBool(_enableBarcodeKey) ?? _enableBarcode;
      _enableCut = preferences.getBool(_enableCutKey) ?? _enableCut;
    } catch (e) {
      debugPrint('LabelPrintProvider.initialize: $e');
    }
    await scan();
  }

  Future<void> select(DiscoveredPrinter printer) async {
    _selected = printer;
    _preferredAddress = printer.address;
    _error = null;
    notifyListeners();
    await _saveSelectedAddress(printer.address);
  }

  Future<void> _saveSelectedAddress(String address) async {
    try {
      var preferences = await SharedPreferences.getInstance();
      await preferences.setString(_selectedPrinterKey, address);
    } catch (e) {
      debugPrint('LabelPrintProvider.saveSelectedAddress: $e');
    }
  }

  void clearMessages() {
    _error = null;
    _success = null;
    notifyListeners();
  }

  /// Cari printer dari radio bluetooth handphone.
  ///
  /// Printer thermal biasanya harus sudah di-*pair* lewat Pengaturan Android
  /// lebih dulu; bonded-device search jauh lebih cepat dan hemat baterai
  /// daripada broadcast BLE, dan tidak butuh lokasi.
  Future<void> scan() async {
    if (_scanning) {
      return;
    }
    _scanning = true;
    _error = null;
    _success = null;
    notifyListeners();

    try {
      // Android 12+ mewajibkan izin runtime SCAN/CONNECT; tanpa ini
      // pemindaian gagal diam-diam dengan PlatformException.
      if (!await _requestPermissions()) {
        _error =
            'Izin Bluetooth ditolak. Aktifkan di Pengaturan HP > Aplikasi > '
            'ONEZENTRA > Izin, lalu pindai lagi.';
        return;
      }
      var found = await _printer.scan();
      _available = found;
      var address = _preferredAddress ?? _selected?.address;
      if (found.isEmpty) {
        _selected = null;
      } else if (address == null) {
        _selected = found.first;
        _preferredAddress = _selected!.address;
        unawaited(_saveSelectedAddress(_selected!.address));
      } else {
        var matchingPrinters = found.where(
          (printer) => printer.address == address,
        );
        _selected = matchingPrinters.isEmpty ? null : matchingPrinters.first;
      }
    } on PrinterException catch (e) {
      _available = const [];
      _selected = null;
      _error = e.message;
    } catch (e) {
      debugPrint('LabelPrintProvider.scan: $e');
      _available = const [];
      _selected = null;
      _error = 'Gagal mencari printer Bluetooth.';
    } finally {
      _scanning = false;
      notifyListeners();
    }
  }

  /// Discovery perangkat baru untuk pairing dalam aplikasi.
  ///
  /// Hasil diakumulasi (deduplikat per address) sampai dihentikan. Perangkat
  /// yang sudah bonded tetap muncul di daftar bonded lewat [scan].
  Future<void> startDiscovery() async {
    if (_discovering) {
      return;
    }
    _discovering = true;
    _discovered = const [];
    _error = null;
    notifyListeners();

    try {
      if (!await _requestPermissions()) {
        _error =
            'Izin Bluetooth ditolak. Aktifkan di Pengaturan HP > Aplikasi > '
            'ONEZENTRA > Izin, lalu cari lagi.';
        _notifyDiscoveryDone();
        return;
      }
      await _discoverySub?.cancel();
      _discoverySub = _printer.discover().listen(
        (device) {
          if (_discovered.any((d) => d.address == device.address)) {
            return;
          }
          _discovered = [..._discovered, device];
          notifyListeners();
        },
        onError: (_) {
          _error = 'Pencarian terhenti. Coba lagi.';
          _notifyDiscoveryDone();
        },
        onDone: _notifyDiscoveryDone,
      );
    } catch (_) {
      _error = 'Pencarian gagal dimulai. Pastikan Bluetooth menyala.';
      _notifyDiscoveryDone();
    }
  }

  void _notifyDiscoveryDone() {
    _discovering = false;
    notifyListeners();
  }

  /// Hentikan discovery (mis. saat panel ditutup).
  Future<void> stopDiscovery() async {
    await _discoverySub?.cancel();
    _discoverySub = null;
    try {
      await _printer.cancelDiscovery();
    } catch (_) {
      // Abaikan: radio mungkin sudah idle.
    }
    if (_discovering) {
      _discovering = false;
      notifyListeners();
    }
  }

  /// Pairing ke perangkat hasil discovery. Berhasil → daftar bonded
  /// dimuat ulang supaya printer langsung bisa dipilih.
  Future<bool> bond(DiscoveredPrinter printer, {String? pin}) async {
    if (_bondingAddress != null) {
      return false;
    }
    _bondingAddress = printer.address;
    _error = null;
    _success = null;
    notifyListeners();
    try {
      var ok = await _printer.bond(printer, pin: pin);
      if (!ok) {
        _error =
            'Pairing ${printer.displayName} gagal / dibatalkan. Pastikan '
            'printer dalam mode pairing dan PIN benar (umumnya 0000).';
        return false;
      }
      await scan();
      _success = 'Terhubung: ${printer.displayName}.';
      return true;
    } catch (_) {
      _error =
          'Pairing ${printer.displayName} gagal. Pastikan printer dalam mode '
          'pairing dan PIN benar (umumnya 0000).';
      return false;
    } finally {
      _bondingAddress = null;
      notifyListeners();
    }
  }

  /// Cetak satu label batch.
  ///
  /// Mengembalikan true kalau berhasil, supaya pemanggil tahu tidak perlu
  /// menampilkan pesan sukses sendiri (sudah dilakukan di sini).
  Future<bool> printLabel(BatchLabelData data) async {
    var printer = _selected;
    if (printer == null) {
      _error = 'Pilih printer terlebih dahulu.';
      notifyListeners();
      return false;
    }
    if (_printing) {
      return false;
    }

    _printing = true;
    _error = null;
    _success = null;
    notifyListeners();

    try {
      var bytes = _enableBarcode
          ? buildLabelBytes(data, _width, enableCut: _enableCut)
          : buildLabelBytesWithoutBarcode(data, _width);
      await _printer.printLabel(printer, bytes);
      _success = 'Label ${data.barcodeLabel ?? ''} tercetak.';
      return true;
    } on PrinterException catch (e) {
      _error = e.message;
      return false;
    } catch (e) {
      debugPrint('LabelPrintProvider.printLabel: $e');
      // Tampilkan penyebab aslinya — pesan generik menyembunyikan akar
      // masalah dan diagnosis lapangan jadi buta.
      _error = 'Gagal mencetak label ($e).';
      return false;
    } finally {
      _printing = false;
      notifyListeners();
    }
  }

  @override
  void dispose() {
    _discoverySub?.cancel();
    _discoverySub = null;
    var printer = _printer;
    if (printer is BluetoothLabelPrinter) {
      unawaited(printer.dispose());
    }
    super.dispose();
  }
}
