import 'package:flutter_test/flutter_test.dart';
import 'package:onezentra_mobile/features/gate/models/gate_models.dart';
import 'package:onezentra_mobile/main.dart';

void main() {
  testWidgets('App menampilkan layar login', (tester) async {
    await tester.pumpWidget(const OnezentraApp());
    await tester.pump();
    expect(find.text('Halo, Selamat Datang Kembali'), findsOneWidget);
    expect(find.text('Masuk ke Dashboard'), findsOneWidget);
  });

  group('gate models', () {
    test('RencanaKirimSummary parsing + label status', () {
      final rk = RencanaKirimSummary.fromJson({
        'id': 7,
        'po_transporter': 'PO-1',
        'nopol': 'KB 1234 AB',
        'driver_name': 'Budi',
        'status': 'SCHEDULED',
      });
      expect(rk.id, 7);
      expect(rk.poTransporter, 'PO-1');
      expect(gateStatusLabel('SCHEDULED'), 'Dijadwalkan');
      expect(gateStatusLabel('CHECKED_IN'), 'Check In');
    });

    test('GateStats parsing + guide status tanpa aksi', () {
      final stats = GateStats.fromJson({
        'hari_ini': 2,
        'terjadwal': 3,
        'selesai': 1,
        'total': 6,
      });
      expect(stats.hariIni, 2);
      expect(stats.total, 6);
      expect(gateStatusGuide('VERIFIED'), isNotNull);
      expect(gateStatusGuide('SCHEDULED'), isNull);
    });

    test('GateTransactionItem parsing relasi rencana_kirim', () {
      final item = GateTransactionItem.fromJson({
        'id': 9,
        'gate_type': 'INBOUND',
        'po_transporter': 'PO-9',
        'nopol': 'KB 9',
        'driver_name': 'Ani',
        'scan_time': '2026-09-25T10:00:00Z',
        'rencana_kirim': {'status': 'CHECKED_IN'},
      });
      expect(item.gateType, 'INBOUND');
      expect(item.rkStatus, 'CHECKED_IN');
    });
  });
}
