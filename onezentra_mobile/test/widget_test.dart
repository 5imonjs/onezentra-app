// Smoke test: the app opens directly on the login screen without a splash route.

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:onezentra_mobile/features/auth/providers/auth_provider.dart';
import 'package:onezentra_mobile/main.dart';

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
  });

  testWidgets('App opens login page directly', (WidgetTester tester) async {
    var authProvider = AuthProvider();
    await authProvider.init();

    await tester.pumpWidget(
      OneZentraApp(
        authProvider: authProvider,
        router: buildRouter(authProvider),
      ),
    );
    await tester.pumpAndSettle();

    // Verify that login page loads
    expect(find.text('Selamat datang kembali'), findsOneWidget);
    expect(find.text('Email'), findsOneWidget);
    expect(find.text('Password'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
