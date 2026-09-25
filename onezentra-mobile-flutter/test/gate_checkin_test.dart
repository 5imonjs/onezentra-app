import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:onezentra_mobile/features/auth/auth_provider.dart';
import 'package:onezentra_mobile/features/auth/auth_user.dart';
import 'package:onezentra_mobile/features/dashboard/dashboard_screen.dart';
import 'package:onezentra_mobile/features/gate/gate_checkin_screen.dart';
import 'package:onezentra_mobile/features/gate/gate_provider.dart';
import 'package:onezentra_mobile/features/gate/gate_service.dart';
import 'package:onezentra_mobile/features/gate/models/gate_models.dart';

class _FakeGateService extends GateService {
  _FakeGateService() : super(null);

  @override
  Future<GateStats> stats() async => GateStats.empty;

  @override
  Future<GateHistoryPage> history({String search = '', int page = 1}) async =>
      const GateHistoryPage(items: [], currentPage: 1, lastPage: 1, total: 0);
}

AuthProvider _authWith(List<String> permissions) {
  final auth = AuthProvider();
  auth.user = const AuthUser(
    id: 1,
    kodeDepo: 'DPO',
    namaDepo: 'Depo Test',
    fullName: 'Gate User',
    email: 'gate@example.com',
    level: 'staff_logistic',
    status: 'active',
    roles: [],
  );
  auth.permissions = permissions;
  auth.isRestoring = false;
  return auth;
}

Widget _wrap(Widget child, AuthProvider auth) {
  return MultiProvider(
    providers: [
      ChangeNotifierProvider<AuthProvider>.value(value: auth),
      ChangeNotifierProvider(create: (_) => GateProvider(_FakeGateService())),
    ],
    child: MaterialApp(home: child),
  );
}

void main() {
  testWidgets('Dashboard menampilkan menu Check In Point sesuai izin', (
    tester,
  ) async {
    await tester.pumpWidget(
      _wrap(const DashboardScreen(), _authWith(['gate.view'])),
    );
    await tester.pumpAndSettle();
    expect(find.text('Gate Check'), findsOneWidget);
    expect(find.text('Check In Point'), findsOneWidget);
  });

  testWidgets('Dashboard tanpa izin gate menampilkan empty state', (
    tester,
  ) async {
    await tester.pumpWidget(_wrap(const DashboardScreen(), _authWith([])));
    await tester.pumpAndSettle();
    expect(find.text('Check In Point'), findsNothing);
    expect(find.textContaining('Tidak ada menu'), findsOneWidget);
  });

  testWidgets('Check In Point tanpa gate.view ditolak', (tester) async {
    await tester.pumpWidget(_wrap(const GateCheckinScreen(), _authWith([])));
    await tester.pumpAndSettle();
    expect(find.textContaining('tidak memiliki izin'), findsOneWidget);
  });

  testWidgets('Check In Point dengan izin menampilkan Quick Scan', (
    tester,
  ) async {
    await tester.pumpWidget(
      _wrap(const GateCheckinScreen(), _authWith(['gate.view'])),
    );
    await tester.pumpAndSettle();
    expect(find.text('Quick Scan'), findsOneWidget);
    expect(find.text('Riwayat Gate (0)'), findsOneWidget);
  });
}
