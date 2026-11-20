/// Model reminder keterlambatan proses dari endpoint `/api/v1/reminders`.
///
/// Kontraknya sama dengan web: satu payload dipakai beranda mobile dan
/// dashboard web supaya angka keterlambatan tidak pernah berbeda.
class ReminderItem {
  const ReminderItem({
    required this.id,
    required this.title,
    required this.subtitle,
    required this.elapsedMinutes,
    this.at,
  });

  factory ReminderItem.fromJson(Map<String, dynamic> json) => ReminderItem(
    id: (json['id'] as num?)?.toInt() ?? 0,
    title: (json['title'] as String?) ?? '-',
    subtitle: (json['subtitle'] as String?) ?? '-',
    elapsedMinutes: (json['elapsed_minutes'] as num?)?.toInt() ?? 0,
    at: json['at'] as String?,
  );

  final int id;
  final String title;
  final String subtitle;
  final int elapsedMinutes;
  final String? at;
}

class ReminderGroup {
  const ReminderGroup({
    required this.key,
    required this.label,
    required this.href,
    required this.count,
    required this.items,
  });

  factory ReminderGroup.fromJson(Map<String, dynamic> json) {
    var rawItems = json['items'];
    return ReminderGroup(
      key: (json['key'] as String?) ?? '',
      label: (json['label'] as String?) ?? '-',
      href: (json['href'] as String?) ?? '',
      count: (json['count'] as num?)?.toInt() ?? 0,
      items: rawItems is List
          ? rawItems
                .whereType<Map<String, dynamic>>()
                .map(ReminderItem.fromJson)
                .toList()
          : const <ReminderItem>[],
    );
  }

  final String key;
  final String label;
  final String href;
  final int count;
  final List<ReminderItem> items;
}

class ReminderSummary {
  const ReminderSummary({
    required this.thresholdMinutes,
    required this.total,
    required this.groups,
  });

  factory ReminderSummary.fromJson(Map<String, dynamic> json) {
    var rawGroups = json['groups'];
    return ReminderSummary(
      thresholdMinutes: (json['threshold_minutes'] as num?)?.toInt() ?? 30,
      total: (json['total'] as num?)?.toInt() ?? 0,
      groups: rawGroups is List
          ? rawGroups
                .whereType<Map<String, dynamic>>()
                .map(ReminderGroup.fromJson)
                .toList()
          : const <ReminderGroup>[],
    );
  }

  final int thresholdMinutes;
  final int total;
  final List<ReminderGroup> groups;
}
