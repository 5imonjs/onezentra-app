import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:onezentra_mobile/core/theme/app_theme.dart';
import 'package:onezentra_mobile/shared/widgets/app_widgets.dart';

void main() {
  testWidgets('AppCard yang bisa ditekan memakai Material berwarna', (
    tester,
  ) async {
    var taps = 0;

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(
          body: AppCard(onTap: () => taps++, child: const Text('Kartu')),
        ),
      ),
    );

    var inkWell = tester.widget<InkWell>(find.byType(InkWell));
    expect(inkWell.onTap, isNotNull);

    var material = tester.widget<Material>(
      find
          .ancestor(of: find.byType(InkWell), matching: find.byType(Material))
          .first,
    );
    expect(material.color, AppTheme.surfaceCard);

    await tester.tap(find.text('Kartu'));
    await tester.pump();

    expect(taps, 1);
  });

  testWidgets('AppCard tanpa onTap tidak membuat InkWell', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: const Scaffold(body: AppCard(child: Text('Kartu'))),
      ),
    );

    expect(find.byType(InkWell), findsNothing);
  });
}
