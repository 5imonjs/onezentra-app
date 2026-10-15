import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Penjaga disiplin tema gelap — cermin themeGuard.test.ts di web.
///
/// Setiap pelanggaran di bawah ini pernah lolos review dan membuat teks
/// tak terbaca di aplikasi dark-first (putih di atas putih atau sebaliknya).
/// Aturan dibuat tekstual agar murah: pola yang ditandai di sini semuanya
/// pernah menjadi bug nyata, bukan gaya selera.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  List<File> sources() => Directory('lib')
      .listSync(recursive: true)
      .whereType<File>()
      .where((f) => f.path.endsWith('.dart'))
      .toList();

  bool isComment(String line) {
    var text = line.trim();
    return text.startsWith('//') || text.startsWith('*');
  }

  group('disiplin tema gelap', () {
    test('tanpa pastel terang pembunuh di permukaan gelap', () {
      // 0xFFFFF1F2/0xFFFECDD3 = rose terang (banner gagal tak terbaca),
      // 0xFF1D4ED8 = biru gelap (catatan dialog tak terbaca).
      const killers = ['FFFFF1F2', 'FFFECDD3', 'FF1D4ED8'];
      var offenders = <String>[];
      for (var file in sources()) {
        if (file.path.endsWith('app_theme.dart')) {
          continue;
        }
        var lines = file.readAsLinesSync();
        for (var i = 0; i < lines.length; i++) {
          if (isComment(lines[i])) {
            continue;
          }
          for (var killer in killers) {
            if (lines[i].contains(killer)) {
              offenders.add('${file.path}:${i + 1}');
            }
          }
        }
      }
      expect(offenders, isEmpty);
    });

    test('tanpa permukaan putih solid (Container/BoxDecoration)', () {
      // Putih solid sebagai fill panel + teks token terang = tak terbaca.
      // Glass (withValues), ikon/teks putih di atas panel gelap, dan
      // highlight box yang teksnya gelap tetap sah — jadi yang dicek hanya
      // fill solid. Blok BoxDecoration dilacak dengan penghitung kurung.
      var offenders = <String>[];
      for (var file in sources()) {
        var lines = file.readAsLinesSync();
        for (var i = 0; i < lines.length; i++) {
          var line = lines[i];
          if (isComment(line)) {
            continue;
          }
          if (RegExp(
            r'Container\(\s*color:\s*Colors\.white(?!\.withValues)\b',
          ).hasMatch(line.replaceAll('\n', ' '))) {
            offenders.add('${file.path}:${i + 1}');
            continue;
          }
          if (!line.contains('BoxDecoration(')) {
            continue;
          }
          // Kotak highlight putih (_darkField) disengaja: teksnya gelap
          // (gray50), bukan token terang. Pola ini dilacak aturan ketiga.
          var contextStart = i - 3 < 0 ? 0 : i - 3;
          if (lines
              .sublist(contextStart, i + 1)
              .any((l) => l.contains('highlight'))) {
            continue;
          }
          var depth = 0;
          var block = StringBuffer();
          for (var j = i; j < lines.length && j < i + 12; j++) {
            block.write(lines[j]);
            depth += '('.allMatches(lines[j]).length;
            depth -= ')'.allMatches(lines[j]).length;
            if (depth <= 0 && j > i) {
              break;
            }
          }
          if (RegExp(
            r'color:\s*Colors\.white(?!\.withValues)\b',
          ).hasMatch(block.toString())) {
            offenders.add('${file.path}:${i + 1}');
          }
        }
      }
      expect(offenders, isEmpty);
    });

    test('teks terang tidak dipakai di atas highlight putih', () {
      // Kotak highlight putih (_darkField) wajib berteks gelap (gray50).
      // gray900 adalah PUTIH di ramp terbalik aplikasi ini — di atas kotak
      // putih ia tak terlihat.
      var offenders = <String>[];
      for (var file in sources()) {
        var lines = file.readAsLinesSync();
        for (var i = 0; i < lines.length; i++) {
          if (isComment(lines[i])) {
            continue;
          }
          if (lines[i].contains('highlight ? AppTheme.gray900')) {
            offenders.add('${file.path}:${i + 1}');
          }
        }
      }
      expect(offenders, isEmpty);
    });
  });
}
