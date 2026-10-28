import 'dart:async';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';

import 'package:onezentra_mobile/core/printer/label_printer.dart';

/// Sink palsu yang mencatat tiap potongan; [allSent] bisa dibuat tidak
/// pernah selesai untuk menyimulasikan printer thermal tanpa ACK.
class _FakeSink implements LabelSocketSink {
  final List<Uint8List> chunks = [];
  Completer<void>? gate;

  @override
  void add(List<int> bytes) => chunks.add(Uint8List.fromList(bytes));

  @override
  Future<void> get allSent {
    var pending = gate;
    if (pending != null) {
      return pending.future;
    }
    return Future.value();
  }
}

void main() {
  test('kirimLabelByte membagi byte per potongan maksimal 180', () async {
    var sink = _FakeSink();
    var bytes = List<int>.generate(500, (i) => i % 256);

    await kirimLabelByte(
      sink,
      bytes,
      chunkDelay: Duration.zero,
      sentTimeout: const Duration(milliseconds: 50),
    );

    // 500 byte → 180 + 180 + 140.
    expect(sink.chunks.map((c) => c.length), [180, 180, 140]);
    var sent = sink.chunks.expand((c) => c).toList();
    expect(sent, bytes);
  });

  test(
    'allSent yang tidak pernah selesai tidak menggantung pengirim',
    () async {
      // Regression lapangan: printer thermal tidak mengirim ACK dan
      // flutter_bluetooth_serial kadang tidak pernah menyelesaikan allSent —
      // dulu tombol Cetak memutar selamanya (kertas keluar tapi aplikasi
      // menganggap cetakan gagal, laporan ke server tidak pernah dikirim).
      var sink = _FakeSink()..gate = Completer<void>();
      var bytes = List<int>.filled(200, 65);

      var sent = kirimLabelByte(
        sink,
        bytes,
        chunkDelay: Duration.zero,
        sentTimeout: const Duration(milliseconds: 30),
      );

      await expectLater(sent, completes);
      // Semua potongan tetap terkirim meski konfirmasi tidak pernah datang.
      expect(sink.chunks.map((c) => c.length), [180, 20]);
    },
  );
}
