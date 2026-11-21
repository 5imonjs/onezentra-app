import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

/// Simpan sementara hasil hitung di perangkat saat jaringan bermasalah atau
/// opname belum selesai. Draft TIDAK dikirim ke server sampai petugas menekan
/// Submit — jadi tidak mengubah status sesi maupun qty monitoring.
class OpnameSessionDraftStore {
  static const _prefix = 'opname_session_draft_';

  Future<Map<int, Map<String, dynamic>>> load(int sessionId) async {
    var prefs = await SharedPreferences.getInstance();
    var raw = prefs.getString('$_prefix$sessionId');
    if (raw == null || raw.isEmpty) {
      return <int, Map<String, dynamic>>{};
    }
    try {
      var decoded = jsonDecode(raw) as Map<String, dynamic>;
      return decoded.map(
        (key, value) => MapEntry<int, Map<String, dynamic>>(
          int.tryParse(key) ?? 0,
          Map<String, dynamic>.from(value as Map),
        ),
      );
    } catch (_) {
      // Draft rusak dibuang daripada membuat form petugas error.
      await clear(sessionId);
      return <int, Map<String, dynamic>>{};
    }
  }

  Future<void> save(
    int sessionId,
    Map<int, Map<String, dynamic>> drafts,
  ) async {
    var prefs = await SharedPreferences.getInstance();
    if (drafts.isEmpty) {
      await prefs.remove('$_prefix$sessionId');
      return;
    }
    await prefs.setString(
      '$_prefix$sessionId',
      jsonEncode(drafts.map((key, value) => MapEntry(key.toString(), value))),
    );
  }

  Future<void> clear(int sessionId) => save(sessionId, const {});
}
