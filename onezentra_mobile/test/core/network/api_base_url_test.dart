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
        ApiClient.normalizeBaseUrl('187.77.121.102'),
        'https://187.77.121.102/api/v1',
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

    test('build non-debug menolak http, debug tetap mengizinkannya', () {
      expect(
        ApiClient.normalizeBaseUrl(
          'http://192.168.1.5:8000/api/v1',
          allowInsecure: false,
        ),
        isNull,
      );
      expect(
        ApiClient.normalizeBaseUrl(
          'http://192.168.1.5:8000/api/v1',
          allowInsecure: true,
        ),
        'http://192.168.1.5:8000/api/v1',
      );
    });
  });

  group('error message', () {
    test('401 login berarti kredensial salah, bukan sesi berakhir', () {
      expect(
        ApiClient.errorMessageForStatus(401, null, endpoint: '/mobile/login'),
        'Email atau password salah.',
      );
      expect(
        ApiClient.errorMessageForStatus(401, null, endpoint: '/user'),
        'Sesi berakhir. Silakan login kembali.',
      );
    });

    test('Retry-After dibaca dalam detik', () {
      expect(ApiClient.parseRetryAfter('7'), const Duration(seconds: 7));
      expect(ApiClient.parseRetryAfter('0'), isNull);
      expect(ApiClient.parseRetryAfter('bukan angka'), isNull);
      expect(ApiClient.parseRetryAfter(null), isNull);
    });
  });

  group('runtime override', () {
    test('default non-kosong tanpa override', () {
      expect(ApiClient().baseUrl, isNotEmpty);
      expect(ApiClient().usesCustomBaseUrl, isFalse);
    });

    test('URL produksi memakai IP trial', () {
      expect(ApiClient.productionBaseUrl, 'https://187.77.121.102/api/v1');
    });

    test('override domain lama dimigrasikan ke IP', () async {
      SharedPreferences.setMockInitialValues({
        'api_base_url': 'https://api.onezentra.sbs/api/v1',
      });

      await ApiClient().init();

      expect(ApiClient().usesCustomBaseUrl, isFalse);
      expect(ApiClient().baseUrl, ApiClient.resolvedBaseUrl);
    });

    test(
      'setBaseUrl tersimpan dan dipakai, reset kembali ke default',
      () async {
        var client = ApiClient();
        var effective = await client.setBaseUrl('187.77.121.102');
        expect(effective, 'https://187.77.121.102/api/v1');
        expect(client.baseUrl, 'https://187.77.121.102/api/v1');
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
