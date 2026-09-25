import 'package:flutter_test/flutter_test.dart';
import 'package:onezentra_mobile/main.dart';

void main() {
  testWidgets('App menampilkan layar login', (tester) async {
    await tester.pumpWidget(const OnezentraApp());
    await tester.pump();
    expect(find.text('Hallo, Welcome Back'), findsOneWidget);
    expect(find.text('Sign in'), findsOneWidget);
  });
}
