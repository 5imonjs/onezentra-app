import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:onezentra_mobile/core/theme/app_theme.dart';
import 'package:onezentra_mobile/features/home/widgets/reminder_banner.dart';
import 'package:onezentra_mobile/features/home/repositories/reminder_repository.dart';

ReminderRepository _repository(Map<String, dynamic> payload) =>
    ReminderRepository(get: (endpoint) async => {'data': payload});

String _today() => DateTime.now().toIso8601String().substring(0, 10);

Map<String, dynamic> _payload({int total = 2, bool withGroups = true}) => {
  'threshold_minutes': 30,
  'total': total,
  'groups': withGroups
      ? [
          {
            'key': 'sj_validation',
            'label': 'Validasi SJ belum selesai',
            'href': '/validasi-sj',
            'count': 1,
            'items': [
              {
                'id': 7,
                'title': 'PO-77',
                'subtitle': 'Depo Singkawang',
                'elapsed_minutes': 47,
                'at': '2026-11-20T09:13:00Z',
              },
            ],
          },
          {
            'key': 'gate',
            'label': 'Kendaraan tertahan di gate',
            'href': '/gate',
            'count': 1,
            'items': [
              {
                'id': 8,
                'title': 'B 1234 CD',
                'subtitle': 'Depo Singkawang',
                'elapsed_minutes': 75,
                'at': '2026-11-20T08:45:00Z',
              },
            ],
          },
        ]
      : <dynamic>[],
};

Future<void> _pump(WidgetTester tester, ReminderRepository repository) async {
  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.light,
      home: Scaffold(body: ReminderBanner(repository: repository)),
    ),
  );
  // Banner memakai Timer.periodic, jadi pumpAndSettle tidak bisa dipakai.
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
}

void main() {
  setUp(() {
    // Default: auto-open sudah dipakai hari ini supaya test tidak kena popup.
    SharedPreferences.setMockInitialValues({
      'reminder_last_auto_shown': _today(),
    });
  });

  testWidgets('kartu ringkas membuka sheet berisi grup dan durasi', (
    tester,
  ) async {
    await _pump(tester, _repository(_payload()));

    expect(find.text('Proses Tertunda'), findsOneWidget);
    expect(find.text('2 item · belum selesai > 30 menit'), findsOneWidget);
    expect(find.text('Validasi SJ belum selesai'), findsNothing);

    await tester.tap(find.text('Lihat'));
    await tester.pumpAndSettle();

    expect(find.text('Validasi SJ belum selesai'), findsOneWidget);
    expect(find.text('Kendaraan tertahan di gate'), findsOneWidget);
    expect(find.text('47 mnt'), findsOneWidget);
    expect(find.text('1 jam 15 mnt'), findsOneWidget);
  });

  testWidgets('sheet terbuka otomatis sekali sehari', (tester) async {
    SharedPreferences.setMockInitialValues({});
    await _pump(tester, _repository(_payload()));

    expect(find.text('Validasi SJ belum selesai'), findsOneWidget);
    expect(find.byTooltip('Tutup'), findsWidgets);
  });

  testWidgets('kartu tidak tampil bila tidak ada proses tertunda', (
    tester,
  ) async {
    await _pump(tester, _repository(_payload(total: 0, withGroups: false)));

    expect(find.text('Proses Tertunda'), findsNothing);
  });

  testWidgets('kegagalan memuat menampilkan tombol coba lagi', (tester) async {
    await _pump(
      tester,
      ReminderRepository(get: (endpoint) async => throw StateError('offline')),
    );

    expect(find.text('Gagal memuat reminder.'), findsOneWidget);
    expect(find.byTooltip('Coba lagi'), findsOneWidget);
  });

  testWidgets('polling tiap 5 menit memuat ulang reminder', (tester) async {
    var calls = 0;
    var repository = ReminderRepository(
      get: (endpoint) async {
        calls++;
        return {'data': _payload(total: calls, withGroups: false)};
      },
    );
    await _pump(tester, repository);
    expect(calls, 1);

    await tester.pump(const Duration(minutes: 5));
    await tester.pump();
    expect(calls, 2);
  });

  testWidgets('app kembali aktif memuat ulang reminder', (tester) async {
    var calls = 0;
    var repository = ReminderRepository(
      get: (endpoint) async {
        calls++;
        return {'data': _payload(total: calls, withGroups: false)};
      },
    );
    await _pump(tester, repository);
    expect(calls, 1);

    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pump();
    expect(calls, 2);
  });
}
