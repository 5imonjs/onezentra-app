import 'package:flutter_test/flutter_test.dart';

import 'package:onezentra_mobile/features/home/repositories/reminder_repository.dart';

void main() {
  test('memanggil endpoint /reminders dengan slash depan', () async {
    String? endpointDipanggil;
    var repository = ReminderRepository(
      get: (endpoint) async {
        endpointDipanggil = endpoint;
        return {
          'data': {'threshold_minutes': 30, 'total': 0, 'groups': []},
        };
      },
    );

    var summary = await repository.fetch();

    expect(endpointDipanggil, '/reminders');
    expect(summary.total, 0);
  });
}
