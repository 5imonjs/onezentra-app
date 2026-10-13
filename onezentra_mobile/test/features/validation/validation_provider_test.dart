import 'dart:async';

import 'package:flutter_test/flutter_test.dart';

import 'package:onezentra_mobile/features/validation/models/validation_models.dart';
import 'package:onezentra_mobile/features/validation/providers/validation_provider.dart';
import 'package:onezentra_mobile/features/validation/repositories/validation_repository.dart';

/// Repository yang menjawab sesuai skenario per panggilan, sehingga jendela
/// loading antar-sesi bisa diamati lewat completer.
class _ScriptedValidationRepository extends ValidationRepository {
  _ScriptedValidationRepository(this.script);
  final List<Future<SjValidation> Function()> script;
  var calls = 0;

  @override
  Future<SjValidation> startByCode(String scanCode) => script[calls++]();
}

void main() {
  test('scan baru membuang sesi lama selama pemindaian berjalan', () async {
    var pending = Completer<SjValidation>();
    var repository = _ScriptedValidationRepository([
      () => Future.value(const SjValidation(id: 1, scanCode: 'PO-A')),
      () => pending.future,
    ]);
    var provider = ValidationProvider(repository: repository);

    await provider.start('PO-A');
    expect(provider.active?.scanCode, 'PO-A');

    // Pemindaian kedua masih berjalan: sesi lama tidak boleh terpajang.
    var second = provider.start('PO-B');
    await Future<void>.delayed(Duration.zero);
    expect(provider.startBusy, isTrue);
    expect(provider.active, isNull);

    pending.complete(const SjValidation(id: 2, scanCode: 'PO-B'));
    await second;
    expect(provider.active?.scanCode, 'PO-B');

    provider.dispose();
  });

  test('notify setelah dispose tidak melempar', () async {
    var pending = Completer<SjValidation>();
    var repository = _ScriptedValidationRepository([
      () => pending.future,
    ]);
    var provider = ValidationProvider(repository: repository);

    var started = provider.start('PO-A');
    provider.dispose();
    pending.complete(const SjValidation(id: 1, scanCode: 'PO-A'));

    // Selesai tanpa "used after being disposed".
    await started;
  });
}
