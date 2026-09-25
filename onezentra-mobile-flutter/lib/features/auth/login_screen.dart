import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:onezentra_mobile/core/api_client.dart';
import 'package:onezentra_mobile/features/auth/auth_provider.dart';
import 'package:onezentra_mobile/theme/app_colors.dart';

const _features = [
  (emoji: '📦', title: 'Inventory', desc: 'Track products'),
  (emoji: '🛡️', title: 'Security', desc: 'Role-based access'),
  (emoji: '📊', title: 'Analytics', desc: 'Real-time data'),
  (emoji: '📅', title: 'Scheduling', desc: 'Plan ahead'),
];

/// Layar Login — port dari `onezentra-mobile/app/index.tsx`
/// (mirror `onezentra-web/src/app/login/page.tsx`).
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _emailCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  String _error = '';
  bool _showPassword = false;
  bool _restored = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _restore());
  }

  Future<void> _restore() async {
    final auth = context.read<AuthProvider>();
    await auth.restore();
    if (!mounted) return;
    setState(() => _restored = true);
    if (auth.isAuthenticated) {
      Navigator.of(context).pushReplacementNamed('/dashboard');
    }
  }

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passwordCtrl.dispose();
    super.dispose();
  }

  String? _validate(String email, String password) {
    if (email.trim().isEmpty) return 'Email wajib diisi.';
    if (!RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(email.trim())) {
      return 'Format email tidak valid.';
    }
    if (password.isEmpty) return 'Password wajib diisi.';
    return null;
  }

  Future<void> _submit() async {
    final email = _emailCtrl.text;
    final password = _passwordCtrl.text;
    final clientError = _validate(email, password);
    if (clientError != null) {
      setState(() => _error = clientError);
      return;
    }
    setState(() => _error = '');
    try {
      await context.read<AuthProvider>().login(email, password);
      if (!mounted) return;
      Navigator.of(context).pushReplacementNamed('/dashboard');
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = parseLoginError(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final canSubmit =
        !auth.isLoading && _emailCtrl.text.trim().isNotEmpty && _passwordCtrl.text.isNotEmpty;

    if (!_restored || auth.isRestoring) {
      return Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: AppColors.darkGradient,
          ),
        ),
        child: const Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              CircularProgressIndicator(color: AppColors.primary300),
              SizedBox(height: 12),
              Text('Memuat sesi...', style: TextStyle(color: AppColors.primary300, fontSize: 14)),
            ],
          ),
        ),
      );
    }

    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: AppColors.darkGradient,
          ),
        ),
        child: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Column(
              children: [
                const SizedBox(height: 12),
                Image.asset('assets/logo.png', height: 54, semanticLabel: 'Logo ONEZENTRA'),
                const SizedBox(height: 8),
                const Text(
                  'ONEZENTRA',
                  style: TextStyle(
                    color: Colors.white, fontSize: 28, fontWeight: FontWeight.w800, letterSpacing: 2,
                  ),
                ),
                const SizedBox(height: 16),
                GridView.count(
                  crossAxisCount: 2,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  mainAxisSpacing: 12,
                  crossAxisSpacing: 12,
                  childAspectRatio: 1.35,
                  children: [
                    for (final f in _features)
                      Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.06),
                          border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
                          borderRadius: BorderRadius.circular(AppRadius.feature),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Container(
                              width: 40,
                              height: 40,
                              decoration: BoxDecoration(
                                color: AppColors.primary500.withValues(alpha: 0.2),
                                borderRadius: BorderRadius.circular(10),
                              ),
                              alignment: Alignment.center,
                              child: Text(f.emoji, style: const TextStyle(fontSize: 20)),
                            ),
                            const SizedBox(height: 8),
                            Text(f.title,
                                style: const TextStyle(
                                    color: Colors.white, fontWeight: FontWeight.w700, fontSize: 14)),
                            Text(f.desc,
                                style: const TextStyle(color: AppColors.primary300, fontSize: 12)),
                          ],
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 20),
                Container(
                  padding: const EdgeInsets.all(24),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(AppRadius.card),
                    boxShadow: const [
                      BoxShadow(color: Color(0x26000000), blurRadius: 20, offset: Offset(0, 8)),
                    ],
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Text('Hallo, Welcome Back',
                          style: TextStyle(
                              fontSize: 24, fontWeight: FontWeight.w800, color: AppColors.gray900)),
                      const SizedBox(height: 4),
                      const Text('Welcome Back to ONEZENTRA',
                          style: TextStyle(fontSize: 14, color: AppColors.gray500)),
                      const SizedBox(height: 20),
                      if (_error.isNotEmpty)
                        Container(
                          margin: const EdgeInsets.only(bottom: 16),
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: AppColors.errorBg,
                            border: Border.all(color: AppColors.errorBorder),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Row(
                            children: [
                              Container(
                                width: 32,
                                height: 32,
                                decoration: BoxDecoration(
                                  color: const Color(0xFFFEE2E2),
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                alignment: Alignment.center,
                                child: const Text('!',
                                    style: TextStyle(
                                        color: AppColors.errorText,
                                        fontWeight: FontWeight.w800,
                                        fontSize: 16)),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Text(_error,
                                    style: const TextStyle(
                                        color: AppColors.errorText, fontSize: 14)),
                              ),
                            ],
                          ),
                        ),
                      const Text('Email address',
                          style: TextStyle(
                              fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.gray700)),
                      const SizedBox(height: 8),
                      TextField(
                        controller: _emailCtrl,
                        onChanged: (_) => setState(() {}),
                        decoration: _inputDecoration(hint: 'admin@onezentra.com'),
                        keyboardType: TextInputType.emailAddress,
                        textInputAction: TextInputAction.next,
                        autofillHints: const [AutofillHints.email],
                        style: _inputStyle,
                      ),
                      const SizedBox(height: 12),
                      const Text('Password',
                          style: TextStyle(
                              fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.gray700)),
                      const SizedBox(height: 8),
                      TextField(
                        controller: _passwordCtrl,
                        onChanged: (_) => setState(() {}),
                        obscureText: !_showPassword,
                        textInputAction: TextInputAction.done,
                        autofillHints: const [AutofillHints.password],
                        onSubmitted: (_) => _submit(),
                        style: _inputStyle,
                        decoration: _inputDecoration(
                          hint: 'Enter your password',
                          suffix: IconButton(
                            onPressed: () => setState(() => _showPassword = !_showPassword),
                            tooltip: _showPassword ? 'Sembunyikan password' : 'Tampilkan password',
                            icon: Text(_showPassword ? '🙈' : '👁️',
                                style: const TextStyle(fontSize: 20)),
                          ),
                        ),
                      ),
                      const SizedBox(height: 20),
                      SizedBox(
                        height: 52,
                        child: FilledButton(
                          onPressed: canSubmit ? _submit : null,
                          style: FilledButton.styleFrom(
                            backgroundColor: AppColors.primary600,
                            disabledBackgroundColor: AppColors.primary600.withValues(alpha: 0.5),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(AppRadius.input),
                            ),
                          ),
                          child: auth.isLoading
                              ? const Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    SizedBox(
                                      width: 20,
                                      height: 20,
                                      child: CircularProgressIndicator(
                                          color: Colors.white, strokeWidth: 2),
                                    ),
                                    SizedBox(width: 12),
                                    Text('Signing in...',
                                        style: TextStyle(
                                            fontSize: 16, fontWeight: FontWeight.w700)),
                                  ],
                                )
                              : const Text('Sign in',
                                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 20),
                Text(
                  '© ${DateTime.now().year} ONEZENTRA  ·  Developed by Langkau_kami  ·  All rights reserved',
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: AppColors.gray400, fontSize: 12),
                ),
                const SizedBox(height: 12),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

const _inputStyle = TextStyle(fontSize: 14, color: AppColors.gray900);

InputDecoration _inputDecoration({required String hint, Widget? suffix}) {
  const border = OutlineInputBorder(
    borderRadius: BorderRadius.all(Radius.circular(AppRadius.input)),
    borderSide: BorderSide(color: AppColors.gray200),
  );
  const focused = OutlineInputBorder(
    borderRadius: BorderRadius.all(Radius.circular(AppRadius.input)),
    borderSide: BorderSide(color: AppColors.primary500, width: 2),
  );
  return InputDecoration(
    hintText: hint,
    hintStyle: const TextStyle(color: AppColors.gray400),
    filled: true,
    fillColor: Colors.white,
    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
    border: border,
    enabledBorder: border,
    focusedBorder: focused,
    suffixIcon: suffix,
  );
}
