import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:onezentra_mobile/core/theme/app_theme.dart';
import 'package:onezentra_mobile/features/validation/models/validation_models.dart';
import 'package:onezentra_mobile/features/validation/providers/validation_provider.dart';
import 'package:onezentra_mobile/features/validation/repositories/validation_repository.dart';
import 'package:onezentra_mobile/features/validation/widgets/validation_history_card.dart';

/// Repository that answers a canned history page so ValidationHistoryCard can
/// be exercised without a running API.
class _FakeValidationRepository extends ValidationRepository {
  _FakeValidationRepository({this.history = const []});

  final List<SjValidation> history;

  @override
  Future<ValidationHistoryPage> list({
    String? search,
    int page = 1,
    int perPage = 20,
  }) async => ValidationHistoryPage(
    items: history,
    currentPage: page,
    lastPage: 1,
    total: history.length,
  );

  @override
  Future<ValidationStats> stats() async => const ValidationStats();
}

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('riwayat memakai items_count server, bukan daftar kosong', (
    tester,
  ) async {
    // itemsCount/validatedItemsCount datang dari server; sesi COMPLETED
    // tidak membawa items ter-embed, jadi tile harus menampilkan angka ini.
    var repository = _FakeValidationRepository(
      history: const [
        SjValidation(
          id: 12,
          scanCode: 'PO-HISTORY',
          status: 'COMPLETED',
          itemsCount: 5,
          validatedItemsCount: 3,
        ),
      ],
    );
    var provider = ValidationProvider(repository: repository);
    await provider.loadItems();

    await tester.pumpWidget(
      ChangeNotifierProvider<ValidationProvider>.value(
        value: provider,
        child: MaterialApp(
          theme: AppTheme.dark,
          home: Scaffold(
            body: ValidationHistoryCard(validation: provider, onOpen: (_) {}),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('PO-HISTORY'), findsOneWidget);
    expect(find.text('3/5 item'), findsOneWidget);
    // Badge status COMPLETED — bukan aksi 'Batal' seperti tile lama.
    expect(find.text('Selesai'), findsOneWidget);
  });
}
