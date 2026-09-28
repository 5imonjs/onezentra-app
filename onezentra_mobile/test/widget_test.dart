// Smoke test: the app boots into the login screen.

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

  testWidgets('App loads login page', (WidgetTester tester) async {
    final authProvider = AuthProvider();
    await authProvider.init();

    await tester.pumpWidget(
      OneZentraApp(authProvider: authProvider, router: buildRouter()),
    );
    await tester.pumpAndSettle();

    // Verify that login page loads
    expect(find.text('Selamat datang kembali'), findsOneWidget);
    expect(find.text('Email'), findsOneWidget);
    expect(find.text('Password'), findsOneWidget);
  });
}
