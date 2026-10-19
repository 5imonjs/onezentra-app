import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:onezentra_mobile/core/network/api_client.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    await ApiClient().init();
  });

  group('normalizeBaseUrl', () {
    test('host polos dilengkapi https + /api/v1', () {
      expect(
        ApiClient.normalizeBaseUrl('api.onezentra.sbs'),
        'https://api.onezentra.sbs/api/v1',
      );
    });

    test('URL penuh dipertahankan dan slash akhir dibuang', () {
      expect(
        ApiClient.normalizeBaseUrl('http://192.168.1.5:8000/api/v1/'),
        'http://192.168.1.5:8000/api/v1',
      );
    });

    test('input kosong atau bukan URL ditolak', () {
      expect(ApiClient.normalizeBaseUrl(''), isNull);
      expect(ApiClient.normalizeBaseUrl('   '), isNull);
      expect(ApiClient.normalizeBaseUrl('ftp://host/api'), isNull);
      expect(ApiClient.normalizeBaseUrl('http://'), isNull);
    });
  });

  group('runtime override', () {
    test('default non-kosong tanpa override', () {
      expect(ApiClient().baseUrl, isNotEmpty);
      expect(ApiClient().usesCustomBaseUrl, isFalse);
    });

    test(
      'setBaseUrl tersimpan dan dipakai, reset kembali ke default',
      () async {
        var client = ApiClient();
        var effective = await client.setBaseUrl('api.onezentra.sbs');
        expect(effective, 'https://api.onezentra.sbs/api/v1');
        expect(client.baseUrl, 'https://api.onezentra.sbs/api/v1');
        expect(client.usesCustomBaseUrl, isTrue);

        // Sesi lama ikut dibuang saat server diganti.
        expect(client.token, isNull);

        await client.setBaseUrl('');
        expect(client.usesCustomBaseUrl, isFalse);
        expect(client.baseUrl, ApiClient.resolvedBaseUrl);
      },
    );

    test('setBaseUrl menolak input tidak valid', () async {
      expect(
        () => ApiClient().setBaseUrl('ftp://host/api'),
        throwsA(isA<ApiException>()),
      );
    });
  });
}
