import 'dart:async';

import 'package:flutter_test/flutter_test.dart';

import 'package:onezentra_mobile/features/unload/models/unload_models.dart';
import 'package:onezentra_mobile/features/unload/providers/unload_provider.dart';
import 'package:onezentra_mobile/features/unload/repositories/unload_repository.dart';

/// Repository whose lookup only resolves when the test completes [lookup],
/// so a request can still be in flight when the provider is disposed.
class _SlowUnloadRepository extends UnloadRepository {
  _SlowUnloadRepository(this.lookup);

  final Completer<UnloadSession> lookup;

  @override
  Future<UnloadSession> findByPo(String po) => lookup.future;
}

UnloadSession _session() => UnloadSession.fromJson({
  'id': 7,
  'status': 'PENDING',
  'rencana_kirim': {'po_transporter': 'PO-042'},
});

void main() {
  test('lookup tidak notify setelah provider di-dispose', () async {
    var lookup = Completer<UnloadSession>();
    var provider = UnloadProvider(repository: _SlowUnloadRepository(lookup));

    var pending = provider.lookup('PO-042');
    provider.dispose();
    lookup.complete(_session());

    // Without the _disposed guard the late notifyListeners() would throw
    // "A ChangeNotifier was used after being disposed".
    await pending;
    expect(provider.active?.id, 7);
  });
}
