/// Authentication models for the OneZentra mobile app.
library;

/// The API ships `permissions` beside `user` (login, refresh), while [User]
/// reads them from its own object. Merge them at the parse boundary so
/// [User.hasPermission] works for a logged-in user.
///
/// A `user` object that already carries its own list wins; a response without
/// a top-level list (e.g. profile update) leaves the user object untouched.
Map<String, dynamic> userJsonWithPermissions(
  Map<String, dynamic> userJson,
  dynamic topLevelPermissions,
) {
  if (userJson['permissions'] != null || topLevelPermissions is! List) {
    return userJson;
  }
  return {...userJson, 'permissions': topLevelPermissions};
}

/// User model
class User {

  User({
    required this.id,
    required this.fullName,
    required this.email,
    required this.level, required this.status, required this.createdAt, required this.updatedAt, this.kodeDepo,
    this.namaDepo,
    this.emailVerifiedAt,
    this.roles,
    this.permissions,
  });

  factory User.fromJson(Map<String, dynamic> json) => User(
      id: _readInt(json['id']) ?? 0,
      fullName: _readString(json['full_name']) ?? '',
      email: _readString(json['email']) ?? '',
      kodeDepo: _readString(json['kode_depo']),
      namaDepo: _readString(json['nama_depo']),
      level: _readString(json['level']) ?? 'operator',
      status: _readString(json['status']) ?? 'active',
      emailVerifiedAt: _readString(json['email_verified_at']),
      createdAt: _readDate(json['created_at']) ?? DateTime.now(),
      updatedAt: _readDate(json['updated_at']) ?? DateTime.now(),
      roles: (json['roles'] as List<dynamic>?)
          ?.whereType<Map<String, dynamic>>()
          .map(Role.fromJson)
          .toList(),
      permissions: (json['permissions'] as List<dynamic>?)
          ?.map((e) => e.toString())
          .toList(),
    );
  final int id;
  final String fullName;
  final String email;
  final String? kodeDepo;
  final String? namaDepo;
  final String level;
  final String status;
  final String? emailVerifiedAt;
  final DateTime createdAt;
  final DateTime updatedAt;
  final List<Role>? roles;
  final List<String>? permissions;

  /// The API can omit or null out a field, and a plain `as String` cast then
  /// throws a [TypeError] that the login screen can only show as "unexpected
  /// error". These readers degrade to a safe default instead.
  static String? _readString(dynamic value) {
    if (value == null) return null;
    var text = value.toString().trim();
    return text.isEmpty ? null : text;
  }

  static int? _readInt(dynamic value) {
    if (value is int) return value;
    if (value is num) return value.toInt();
    return int.tryParse(value?.toString() ?? '');
  }

  static DateTime? _readDate(dynamic value) {
    if (value is String && value.isNotEmpty) return DateTime.tryParse(value);
    return null;
  }

  Map<String, dynamic> toJson() => {
      'id': id,
      'full_name': fullName,
      'email': email,
      'kode_depo': kodeDepo,
      'nama_depo': namaDepo,
      'level': level,
      'status': status,
      'email_verified_at': emailVerifiedAt,
      'created_at': createdAt.toIso8601String(),
      'updated_at': updatedAt.toIso8601String(),
      'roles': roles?.map((e) => e.toJson()).toList(),
      'permissions': permissions,
    };

  /// Get display name for role
  String get roleDisplayName {
    switch (level) {
      case 'admin_master':
        return 'Admin Master';
      case 'admin_depo':
        return 'Admin Depo';
      case 'staff_logistic':
        return 'Staff Logistik';
      case 'manager_logistic':
        return 'Manager Logistik';
      default:
        return level;
    }
  }

  /// Check if user has specific permission
  bool hasPermission(String permission) => permissions?.contains(permission) ?? false;

  /// Check if user has any of the permissions
  bool hasAnyPermission(List<String> permissions) => this.permissions?.any((p) => permissions.contains(p)) ?? false;

  /// Check if user is admin
  bool get isAdmin => level == 'admin_master' || level == 'admin_depo';

  /// Returns this user with [permissions] attached — used when a response
  /// (e.g. profile update) omits the permission list, so saving the profile
  /// cannot silently strip the rights the session already had.
  User withPermissions(List<String>? permissions) => User(
      id: id,
      fullName: fullName,
      email: email,
      kodeDepo: kodeDepo,
      namaDepo: namaDepo,
      level: level,
      status: status,
      emailVerifiedAt: emailVerifiedAt,
      createdAt: createdAt,
      updatedAt: updatedAt,
      roles: roles,
      permissions: permissions,
    );
}

/// Role model
class Role {

  Role({
    required this.id,
    required this.name,
    required this.slug,
    required this.description,
    this.permissions,
  });

  factory Role.fromJson(Map<String, dynamic> json) => Role(
      id: User._readInt(json['id']) ?? 0,
      name: User._readString(json['name']) ?? '',
      slug: User._readString(json['slug']) ?? '',
      description: User._readString(json['description']) ?? '',
      permissions: (json['permissions'] as List<dynamic>?)
          ?.whereType<Map<String, dynamic>>()
          .map(Permission.fromJson)
          .toList(),
    );
  final int id;
  final String name;
  final String slug;
  final String description;
  final List<Permission>? permissions;

  Map<String, dynamic> toJson() => {
      'id': id,
      'name': name,
      'slug': slug,
      'description': description,
      'permissions': permissions?.map((e) => e.toJson()).toList(),
    };
}

/// Permission model
class Permission {

  Permission({
    required this.id,
    required this.name,
    required this.slug,
    required this.description,
    required this.group,
  });

  factory Permission.fromJson(Map<String, dynamic> json) => Permission(
      id: User._readInt(json['id']) ?? 0,
      name: User._readString(json['name']) ?? '',
      slug: User._readString(json['slug']) ?? '',
      description: User._readString(json['description']) ?? '',
      group: User._readString(json['group']) ?? '',
    );
  final int id;
  final String name;
  final String slug;
  final String description;
  final String group;

  Map<String, dynamic> toJson() => {
      'id': id,
      'name': name,
      'slug': slug,
      'description': description,
      'group': group,
    };
}

/// Auth Response model
class AuthResponse {

  AuthResponse({
    required this.message,
    required this.user, this.token,
    this.tokenType,
    this.expiresAt,
    this.permissions,
  });

  factory AuthResponse.fromJson(Map<String, dynamic> json) => AuthResponse(
      message: User._readString(json['message']) ?? '',
      token: User._readString(json['token']),
      tokenType: User._readString(json['token_type']),
      expiresAt: User._readString(json['expires_at']),
      user: User.fromJson(
        userJsonWithPermissions(
          json['user'] as Map<String, dynamic>,
          json['permissions'],
        ),
      ),
      permissions: (json['permissions'] as List<dynamic>?)
          ?.map((e) => e.toString())
          .toList(),
    );
  final String message;
  final String? token;
  final String? tokenType;
  final String? expiresAt;
  final User user;
  final List<String>? permissions;
}

/// Login Request model
class LoginRequest {

  LoginRequest({required this.email, required this.password, this.deviceName});
  final String email;
  final String password;
  final String? deviceName;

  Map<String, dynamic> toJson() => {
      'email': email,
      'password': password,
      if (deviceName != null) 'device_name': deviceName,
    };
}
