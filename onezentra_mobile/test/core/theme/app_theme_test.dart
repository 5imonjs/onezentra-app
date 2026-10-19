import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:onezentra_mobile/core/theme/app_theme.dart';

/// Regresi koherensi tema gelap: permukaan bawaan tema harus gelap dan teks
/// bawaan harus terang. Pernah kejadian permukaan dialog/sheet/appbar
/// lokal memakai nilai terang sementara teks token tetap terang — judul
/// dan isi jadi tak terbaca (putih di atas putih).
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  ThemeData dark() => AppTheme.dark;

  group('tema gelap koheren', () {
    testWidgets('permukaan bawaan tema gelap', (tester) async {
      var theme = dark();
      for (var entry in {
        'scaffold': theme.scaffoldBackgroundColor,
        'canvas': theme.canvasColor,
        'dialog': theme.dialogTheme.backgroundColor,
        'bottomSheet': theme.bottomSheetTheme.modalBackgroundColor,
        'appBar': theme.appBarTheme.backgroundColor,
        'card': theme.cardTheme.color,
        'snackBar': theme.snackBarTheme.backgroundColor,
      }.entries) {
        expect(
          entry.value?.computeLuminance(),
          lessThan(0.12),
          reason: '${entry.key} harus gelap',
        );
      }
    });

    testWidgets('teks bawaan tema terang', (tester) async {
      var theme = dark();
      var scheme = theme.colorScheme;
      expect(scheme.onSurface.computeLuminance(), greaterThan(0.7));
      expect(
        theme.textTheme.bodyLarge?.color?.computeLuminance(),
        greaterThan(0.5),
      );
    });

    testWidgets('teks dialog/snackBar aplikasi terbaca di permukaan gelap', (
      tester,
    ) async {
      var dialogBg = dark().dialogTheme.backgroundColor!;
      var titleColor = AppTheme.textTheme.headlineSmall?.color;
      var snackBg = dark().snackBarTheme.backgroundColor!;
      var snackColor = dark().snackBarTheme.contentTextStyle?.color;
      expect(
        _contrast(titleColor!, dialogBg),
        greaterThanOrEqualTo(7),
        reason: 'judul dialog harus mencolok di atas panel gelap',
      );
      expect(
        _contrast(snackColor!, snackBg),
        greaterThanOrEqualTo(4.5),
        reason: 'teks snackbar harus terbaca',
      );
    });
  });
}

/// Rasio kontras WCAG dua warna.
double _contrast(Color a, Color b) {
  var l1 = a.computeLuminance();
  var l2 = b.computeLuminance();
  var (hi, lo) = l1 > l2 ? (l1, l2) : (l2, l1);
  return (hi + 0.05) / (lo + 0.05);
}
