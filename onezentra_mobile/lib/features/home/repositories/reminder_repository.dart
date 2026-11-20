import 'package:onezentra_mobile/core/network/api_client.dart';
import 'package:onezentra_mobile/features/home/models/reminder_models.dart';

/// Transport GET yang bisa disuntik pada widget test.
typedef ReminderGet = Future<dynamic> Function(String endpoint);

/// Mengambil reminder keterlambatan proses dari API yang sama dengan web.
class ReminderRepository {
  ReminderRepository({ReminderGet? get})
    : _get = get ?? ((endpoint) => ApiClient().get(endpoint));

  final ReminderGet _get;

  Future<ReminderSummary> fetch() async {
    // Harus diawali '/': ApiClient menggabungkan baseUrl + endpoint apa adanya.
    // Tanpa slash, URL-nya jadi .../api/v1reminders dan server balas 404.
    var response = await _get('/reminders');
    if (response is! Map<String, dynamic>) {
      throw const ApiException('Respons server tidak valid.', 0);
    }
    var body = response['data'];
    if (body is! Map<String, dynamic>) {
      throw const ApiException('Respons server tidak valid.', 0);
    }
    return ReminderSummary.fromJson(body);
  }
}
