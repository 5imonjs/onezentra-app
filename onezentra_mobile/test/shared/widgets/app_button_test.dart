import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:onezentra_mobile/core/theme/app_theme.dart';
import 'package:onezentra_mobile/shared/widgets/app_widgets.dart';

void main() {
  testWidgets('label panjang membungkus tanpa overflow di layar sempit', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(280, 600);
    tester.view.devicePixelRatio = 1;
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.view.reset);
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);

    const label = 'Lanjut validasi PO-2026-001234';

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(
          body: Padding(
            padding: const EdgeInsets.all(AppTheme.space4),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                AppPrimaryButton(text: label, onPressed: () {}),
                const SizedBox(height: AppTheme.space3),
                AppSecondaryButton(text: label, onPressed: () {}),
              ],
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(find.text(label), findsNWidgets(2));
  });
}
