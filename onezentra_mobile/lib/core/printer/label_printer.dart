import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bluetooth_serial/flutter_bluetooth_serial.dart';
import 'package:permission_handler/permission_handler.dart';

/// Permintaan izin runtime Bluetooth, disuntik agar alur scan bisa diuji
/// tanpa dialog sistem.
typedef BluetoothPermissionRequest = Future<bool> Function();

/// Izin Bluetooth Android 12+ (SCAN untuk mencari, CONNECT untuk mencetak).
/// Tanpa keduanya, pemindaian gagal dengan PlatformException yang samar —
/// jadi diminta eksplisit di sini dengan pesan yang bisa ditindaklanjuti.
///
/// Bukan Android (iOS simulator, web, desktop): tidak ada izin runtime yang
/// relevan, langsung lolos. Catatan: iOS tidak mendukung Bluetooth Classic
/// SPP untuk aplikasi pihak ketiga (butuh MFi), jadi cetak label praktisnya
/// Android saja; di iOS pemindaian gagal dengan pesan di bawah.
class BluetoothPermissions {
  BluetoothPermissions._();

  static Future<bool> request() async {
    if (kIsWeb) {
      return true;
    }
    if (!Platform.isAndroid) {
      return true;
    }
    try {
      var scan = await Permission.bluetoothScan.request();
      var connect = await Permission.bluetoothConnect.request();
      return scan.isGranted && connect.isGranted;
    } catch (_) {
      return false;
    }
  }
}

/// Printer yang ditemukan lewat pencarian Bluetooth di handphone.
class DiscoveredPrinter {
  const DiscoveredPrinter({required this.address, required this.name});

  final String address;
  final String name;

  String get displayName => name.isEmpty ? address : '$name ($address)';
}

class PrinterException implements Exception {
  const PrinterException(this.message);

  final String message;

  @override
  String toString() => message;
}

/// Kontrak printer, dipisah dari implementasinya supaya alur scan → pilih →
/// cetak bisa diuji tanpa perangkat bluetooth sungguhan.
abstract class LabelPrinter {
  /// Pencarian printer dari radio bluetooth handphone.
  Future<List<DiscoveredPrinter>> scan();

  /// Discovery perangkat di sekitar (belum tentu sudah di-pair).
  /// Dipakai alur pairing dalam aplikasi.
  Stream<DiscoveredPrinter> discover();

  /// Pairing ke perangkat hasil discovery. Dialog PIN sistem bisa muncul;
  /// mengembalikan true bila perangkat berhasil bonded. [pin] opsional
  /// (umumnya `0000` untuk printer thermal) untuk menjawab otomatis bila
  /// printer memintanya.
  Future<bool> bond(DiscoveredPrinter printer, {String? pin});

  /// Hentikan discovery yang sedang berjalan. Aman dipanggil saat idle.
  Future<void> cancelDiscovery();

  /// Kirim byte ESC/POS label ke printer yang dipilih.
  ///
  /// Menerima [List<int]>, bukan String, karena barcode Code39 harus dikirim
  /// sebagai perintah ESC/POS — kalau dikirim sebagai teks, printer hanya
  /// mencetak karakter fantasy, bukan barcode yang bisa discan.
  ///
  /// Melempar [PrinterException] kalau gagal — pemanggil wajib memberi umpan
  /// balik ke operator, karena label yang gagal cetak berarti produk jadi tanpa
  /// tanda terima dan tidak bisa ditelusuri.
  Future<void> printLabel(DiscoveredPrinter printer, List<int> bytes);
}

/// Implementasi nyata memakai Bluetooth Classic (SPP/RFCOMM).
class BluetoothLabelPrinter implements LabelPrinter {
  // Paket ini hanya mengekspos singleton lewat `.instance`; constructor-nya
  // private. Field ini nullable supaya test bisa menyuntik serial palsu.
  BluetoothLabelPrinter({FlutterBluetoothSerial? serial})
    : _serial = serial ?? FlutterBluetoothSerial.instance;

  final FlutterBluetoothSerial _serial;
  BluetoothConnection? _connection;

  @override
  Future<List<DiscoveredPrinter>> scan() async {
    List<BluetoothDevice> bonded;
    try {
      bonded = await _serial.getBondedDevices();
    } on PlatformException {
      throw const PrinterException(
        'Bluetooth tidak tersedia atau izin ditolak. Aktifkan Bluetooth dan '
        'izinkan akses di Pengaturan HP.',
      );
    }
    var found =
        bonded
            .map(
              (d) => DiscoveredPrinter(address: d.address, name: d.name ?? ''),
            )
            .toList()
          ..sort((a, b) => a.displayName.compareTo(b.displayName));

    if (found.isEmpty) {
      throw const PrinterException(
        'Printer tidak ditemukan. Pasangkan printer lewat Pengaturan Bluetooth dulu.',
      );
    }
    return found;
  }

  @override
  Stream<DiscoveredPrinter> discover() => _serial.startDiscovery().map(
    (result) => DiscoveredPrinter(
      address: result.device.address,
      name: result.device.name ?? '',
    ),
  );

  /// Pairing ke perangkat hasil discovery. Dialog PIN sistem bisa muncul;
  /// mengembalikan true bila perangkat berhasil bonded.
  @override
  Future<bool> bond(DiscoveredPrinter printer, {String? pin}) async {
    try {
      return await _serial.bondDeviceAtAddress(
            printer.address,
            pin: pin?.isEmpty ?? true ? null : pin,
          ) ??
          false;
    } on PlatformException {
      return false;
    } catch (_) {
      return false;
    }
  }

  @override
  Future<void> cancelDiscovery() async {
    try {
      await _serial.cancelDiscovery();
    } catch (_) {
      // Idle / radio mati: tidak ada yang perlu dihentikan.
    }
  }

  @override
  Future<void> printLabel(DiscoveredPrinter printer, List<int> bytes) async {
    BluetoothConnection? connection;
    try {
      connection = await BluetoothConnection.toAddress(printer.address);
      if (connection.isConnected != true) {
        throw const PrinterException(
          'Gagal terhubung ke printer. Pastikan printer menyala dan tidak dipakai aplikasi lain.',
        );
      }
      _connection = connection;

      // Data dikirim per potongan karena write panjang pada Classic Bluetooth
      // sering terpotong di tengah — label terpotong berarti label salah baca.
      const chunkSize = 180;
      for (var offset = 0; offset < bytes.length; offset += chunkSize) {
        var end = offset + chunkSize < bytes.length
            ? offset + chunkSize
            : bytes.length;
        // `output.add` sengaja TIDAK di-await: sink-nya tidak mengembalikan
        // Future, jadi `await` di situ akan menunggu `null` selamanya. Beri
        // jeda pendek agar printer sempat mencerna tiap potongan sebelum
        // berikutnya dikirim — Classic Bluetooth membelah write panjang menjadi
        // beberapa frame dan printer thermal sering kehilangan potongan kalau
        // dikirim rapat-rapat.
        connection.output.add(Uint8List.fromList(bytes.sublist(offset, end)));
        await Future<void>.delayed(const Duration(milliseconds: 60));
      }
      await connection.output.allSent;
    } on PrinterException {
      rethrow;
    } on TimeoutException {
      throw const PrinterException(
        'Printer tidak merespons. Matikan lalu nyalakan printer dan coba lagi.',
      );
    } catch (e) {
      debugPrint('BluetoothLabelPrinter: $e');
      throw const PrinterException(
        'Gagal mencetak. Periksa printer dan coba lagi.',
      );
    } finally {
      // Putuskan koneksi supaya printer tidak terkunci eksklusif dan operator
      // tetap bisa mencetak dari halaman lain.
      try {
        await connection?.close();
      } catch (_) {
        // Kegagalan menutup tidak boleh menutupi hasil cetak yang sukses.
      }
      _connection = null;
    }
  }

  Future<void> dispose() async {
    try {
      await _connection?.close();
    } catch (_) {
      // Diabaikan: dispose dipanggil saat halaman ditutup.
    }
    _connection = null;
  }
}
