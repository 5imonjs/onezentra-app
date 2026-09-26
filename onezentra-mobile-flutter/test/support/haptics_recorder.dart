import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

/// Rekam panggilan haptik lewat mock `SystemChannels.platform`.
///
/// `HapticFeedback` mengirim `HapticFeedback.vibrate` ke channel platform, jadi
/// satu mock handler cukup untuk membuang *dan* mencatat. Dikembalikan dalam
/// bentuk `List<String>` berisi nama tipe getar (`mediumImpact`, `heavyImpact`,
/// …) supaya assertion tidak rapuh terhadap detail argumen.
List<String> recordHaptics() {
  final calls = <String>[];
  final messenger =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
  messenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
    if (call.method == 'HapticFeedback.vibrate') {
      calls.add('${call.arguments}');
    }
    return null;
  });
  addTearDown(
    () => messenger.setMockMethodCallHandler(SystemChannels.platform, null),
  );
  return calls;
}
