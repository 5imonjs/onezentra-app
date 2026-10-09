import 'package:flutter_test/flutter_test.dart';

import 'package:onezentra_mobile/features/auth/models/auth_models.dart';

/// The API sends `permissions` beside `user`, not inside it. Without the
/// merge every `hasPermission` check (drawer items, menu gating) would be
/// false for a logged-in user.
void main() {
  Map<String, dynamic> loginPayload({
    dynamic permissions,
    dynamic userPermissions,
  }) {
    var user = <String, dynamic>{
      'id': 7,
      'full_name': 'Gate Officer',
      'email': 'gate@onezentra.com',
      'level': 'operator',
      'status': 'active',
      'roles': [],
    };
    if (userPermissions != null) {
      user['permissions'] = userPermissions;
    }

    var payload = <String, dynamic>{
      'message': 'Login successful',
      'token': 'token-abc',
      'user': user,
    };
    if (permissions != null) {
      payload['permissions'] = permissions;
    }
    return payload;
  }

  test('AuthResponse folds top-level permissions into the user', () {
    var response = AuthResponse.fromJson(
      loginPayload(permissions: ['gate.view', 'gate.create']),
    );

    expect(response.user.permissions, ['gate.view', 'gate.create']);
    expect(response.user.hasPermission('gate.view'), isTrue);
    expect(response.user.hasPermission('users.view'), isFalse);
    expect(response.permissions, ['gate.view', 'gate.create']);
  });

  test('a user object with its own permissions keeps them', () {
    var response = AuthResponse.fromJson(
      loginPayload(permissions: ['gate.view'], userPermissions: ['users.view']),
    );

    expect(response.user.permissions, ['users.view']);
  });

  test('a response without permissions leaves the user untouched', () {
    var response = AuthResponse.fromJson(loginPayload());

    expect(response.user.permissions, isNull);
    expect(response.user.hasPermission('gate.view'), isFalse);
  });

  test('withPermissions restores the previous permission list', () {
    var response = AuthResponse.fromJson(
      loginPayload(permissions: ['gate.view']),
    );
    var updated = response.user.withPermissions(response.user.permissions);

    expect(updated.hasPermission('gate.view'), isTrue);
    expect(updated.email, response.user.email);
  });
}
