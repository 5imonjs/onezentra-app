class AuthRole {
  final int id;
  final String name;
  final String slug;

  const AuthRole({required this.id, required this.name, required this.slug});

  factory AuthRole.fromJson(Map<String, dynamic> json) => AuthRole(
    id: (json['id'] as num?)?.toInt() ?? 0,
    name: '${json['name'] ?? ''}',
    slug: '${json['slug'] ?? ''}',
  );
}

class AuthUser {
  final int id;
  final String kodeDepo;
  final String namaDepo;
  final String fullName;
  final String email;
  final String level;
  final String status;
  final List<AuthRole> roles;

  const AuthUser({
    required this.id,
    required this.kodeDepo,
    required this.namaDepo,
    required this.fullName,
    required this.email,
    required this.level,
    required this.status,
    required this.roles,
  });

  factory AuthUser.fromJson(Map<String, dynamic> json) => AuthUser(
    id: (json['id'] as num?)?.toInt() ?? 0,
    kodeDepo: '${json['kode_depo'] ?? ''}',
    namaDepo: '${json['nama_depo'] ?? ''}',
    fullName: '${json['full_name'] ?? ''}',
    email: '${json['email'] ?? ''}',
    level: '${json['level'] ?? ''}',
    status: '${json['status'] ?? ''}',
    roles: ((json['roles'] as List?) ?? [])
        .whereType<Map>()
        .map((r) => AuthRole.fromJson(Map<String, dynamic>.from(r)))
        .toList(),
  );
}
