/// Authentication Models for OneZentra Mobile

/// User model
class User {
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

  User({
    required this.id,
    required this.fullName,
    required this.email,
    this.kodeDepo,
    this.namaDepo,
    required this.level,
    required this.status,
    this.emailVerifiedAt,
    required this.createdAt,
    required this.updatedAt,
    this.roles,
    this.permissions,
  });

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id'] as int,
      fullName: json['full_name'] as String,
      email: json['email'] as String,
      kodeDepo: json['kode_depo'] as String?,
      namaDepo: json['nama_depo'] as String?,
      level: json['level'] as String,
      status: json['status'] as String,
      emailVerifiedAt: json['email_verified_at'] as String?,
      createdAt: DateTime.parse(json['created_at'] as String),
      updatedAt: DateTime.parse(json['updated_at'] as String),
      roles: (json['roles'] as List<dynamic>?)
          ?.map((e) => Role.fromJson(e as Map<String, dynamic>))
          .toList(),
      permissions: (json['permissions'] as List<dynamic>?)
          ?.map((e) => e as String)
          .toList(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
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
  }

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
  bool hasPermission(String permission) {
    return permissions?.contains(permission) ?? false;
  }

  /// Check if user has any of the permissions
  bool hasAnyPermission(List<String> permissions) {
    return this.permissions?.any((p) => permissions.contains(p)) ?? false;
  }

  /// Check if user is admin
  bool get isAdmin => level == 'admin_master' || level == 'admin_depo';
}

/// Role model
class Role {
  final int id;
  final String name;
  final String slug;
  final String description;
  final List<Permission>? permissions;

  Role({
    required this.id,
    required this.name,
    required this.slug,
    required this.description,
    this.permissions,
  });

  factory Role.fromJson(Map<String, dynamic> json) {
    return Role(
      id: json['id'] as int,
      name: json['name'] as String,
      slug: json['slug'] as String,
      description: json['description'] as String,
      permissions: (json['permissions'] as List<dynamic>?)
          ?.map((e) => Permission.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'slug': slug,
      'description': description,
      'permissions': permissions?.map((e) => e.toJson()).toList(),
    };
  }
}

/// Permission model
class Permission {
  final int id;
  final String name;
  final String slug;
  final String description;
  final String group;

  Permission({
    required this.id,
    required this.name,
    required this.slug,
    required this.description,
    required this.group,
  });

  factory Permission.fromJson(Map<String, dynamic> json) {
    return Permission(
      id: json['id'] as int,
      name: json['name'] as String,
      slug: json['slug'] as String,
      description: json['description'] as String,
      group: json['group'] as String,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'slug': slug,
      'description': description,
      'group': group,
    };
  }
}

/// Auth Response model
class AuthResponse {
  final String message;
  final String? token;
  final String? tokenType;
  final String? expiresAt;
  final User user;
  final List<String>? permissions;

  AuthResponse({
    required this.message,
    this.token,
    this.tokenType,
    this.expiresAt,
    required this.user,
    this.permissions,
  });

  factory AuthResponse.fromJson(Map<String, dynamic> json) {
    return AuthResponse(
      message: json['message'] as String,
      token: json['token'] as String?,
      tokenType: json['token_type'] as String?,
      expiresAt: json['expires_at'] as String?,
      user: User.fromJson(json['user'] as Map<String, dynamic>),
      permissions: (json['permissions'] as List<dynamic>?)
          ?.map((e) => e as String)
          .toList(),
    );
  }
}

/// Login Request model
class LoginRequest {
  final String email;
  final String password;
  final String? deviceName;

  LoginRequest({required this.email, required this.password, this.deviceName});

  Map<String, dynamic> toJson() {
    return {
      'email': email,
      'password': password,
      if (deviceName != null) 'device_name': deviceName,
    };
  }
}
