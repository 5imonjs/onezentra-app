import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:onezentra_mobile/core/api_client.dart';
import 'package:onezentra_mobile/features/auth/auth_provider.dart';
import 'package:onezentra_mobile/theme/app_colors.dart';

const _features = [
  (
    icon: Icons.inventory_2_outlined,
    title: 'Inventory',
    desc: 'Stok real-time',
  ),
  (
    icon: Icons.verified_user_outlined,
    title: 'Keamanan',
    desc: 'Akses berbasis peran',
  ),
  (icon: Icons.bar_chart_outlined, title: 'Analitik', desc: 'Data live gudang'),
  (
    icon: Icons.calendar_month_outlined,
    title: 'Penjadwalan',
    desc: 'Rencana kirim',
  ),
];

/// Versi aplikasi. Satu konstanta di sisi Dart supaya badge versi ini tidak
/// lagi melenceng dari `pubspec.yaml`.
const _appVersion = '1.0.0';

/// Layar Login — port dari `onezentra-mobile/app/index.tsx`
/// (mirror `onezentra-web/src/app/login/page.tsx`).
///
/// Sesi tidak lagi dipulihkan di layar ini; `AppRoot` yang memutuskan layar
/// mana yang tampil, sehingga login cukup menampilkan form.
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  final _emailFocus = FocusNode();
  final _passwordFocus = FocusNode();
  String _error = '';
  bool _showPassword = false;

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passwordCtrl.dispose();
    _emailFocus.dispose();
    _passwordFocus.dispose();
    super.dispose();
  }

  String? _emailValidator(String? value) {
    final email = (value ?? '').trim();
    if (email.isEmpty) {
      return 'Email wajib diisi.';
    }
    if (!RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(email)) {
      return 'Format email tidak valid.';
    }
    return null;
  }

  String? _passwordValidator(String? value) {
    if ((value ?? '').isEmpty) {
      return 'Password wajib diisi.';
    }
    if ((value ?? '').length < 3) {
      return 'Password minimal 3 karakter.';
    }
    return null;
  }

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    setState(() => _error = '');
    if (!(_formKey.currentState?.validate() ?? false)) {
      return;
    }
    final auth = context.read<AuthProvider>();
    try {
      await auth.login(_emailCtrl.text, _passwordCtrl.text);
    } catch (e) {
      if (!mounted) {
        return;
      }
      setState(() => _error = parseLoginError(e));
    }
  }

  void _forgotPassword() {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        const SnackBar(
          content: Text(
            'Hubungi admin gudang untuk reset kata sandi akun Anda.',
          ),
          behavior: SnackBarBehavior.floating,
        ),
      );
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();

    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: AppColors.darkGradient,
          ),
        ),
        child: Stack(
          children: [
            const _DecorativeBackground(),
            SafeArea(
              child: GestureDetector(
                onTap: () => FocusScope.of(context).unfocus(),
                child: SingleChildScrollView(
                  keyboardDismissBehavior:
                      ScrollViewKeyboardDismissBehavior.onDrag,
                  padding: EdgeInsets.fromLTRB(
                    20,
                    16,
                    20,
                    16 + MediaQuery.viewInsetsOf(context).bottom,
                  ),
                  child: Center(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 480),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          const _Entrance(delayMs: 0, child: _HeroHeader()),
                          const SizedBox(height: 16),
                          const _Entrance(delayMs: 90, child: _FeatureGrid()),
                          const SizedBox(height: 20),
                          if (auth.restoreError != null) ...[
                            _OfflineBanner(
                              message: auth.restoreError!,
                              onRetry: () =>
                                  context.read<AuthProvider>().restore(),
                            ),
                            const SizedBox(height: 12),
                          ],
                          _Entrance(
                            delayMs: 180,
                            child: _LoginCard(
                              formKey: _formKey,
                              emailCtrl: _emailCtrl,
                              passwordCtrl: _passwordCtrl,
                              emailFocus: _emailFocus,
                              passwordFocus: _passwordFocus,
                              emailValidator: _emailValidator,
                              passwordValidator: _passwordValidator,
                              error: _error,
                              showPassword: _showPassword,
                              isLoading: auth.isLoading,
                              onTogglePassword: () => setState(
                                () => _showPassword = !_showPassword,
                              ),
                              onClearEmail: () => setState(_emailCtrl.clear),
                              onEmailChanged: (_) => _error.isEmpty
                                  ? null
                                  : setState(() => _error = ''),
                              onSubmit: _submit,
                              onForgotPassword: _forgotPassword,
                            ),
                          ),
                          const SizedBox(height: 18),
                          const _SecureHint(),
                          const SizedBox(height: 10),
                          Text(
                            '© ${DateTime.now().year} ONEZENTRA  ·  Developed by Langkau_kami',
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              color: AppColors.gray300,
                              fontSize: 12,
                            ),
                          ),
                          const SizedBox(height: 8),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Banner saat pemulihan sesi gagal karena jaringan — token tidak dibuang,
/// jadi pengguna cukup mencoba ulang alih-alih login dari awal.
class _OfflineBanner extends StatelessWidget {
  const _OfflineBanner({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.warningBg,
        border: Border.all(color: AppColors.warningBorder),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(
            Icons.wifi_off_outlined,
            size: 20,
            color: AppColors.warningText,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  message,
                  style: const TextStyle(
                    color: AppColors.warningText,
                    fontSize: 13,
                    height: 1.35,
                  ),
                ),
                const SizedBox(height: 4),
                TextButton(
                  onPressed: onRetry,
                  style: TextButton.styleFrom(
                    padding: EdgeInsets.zero,
                    minimumSize: Size.zero,
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                  child: const Text('Coba lagi'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _DecorativeBackground extends StatelessWidget {
  const _DecorativeBackground();

  @override
  Widget build(BuildContext context) {
    return const Stack(
      children: [
        Positioned(
          top: -70,
          right: -60,
          child: _BlurCircle(size: 220, color: Color(0x336366F1)),
        ),
        Positioned(
          top: 90,
          left: -70,
          child: _BlurCircle(size: 180, color: Color(0x262DD4BF)),
        ),
        Positioned(
          bottom: -40,
          left: 40,
          right: 40,
          child: _BlurCircle(size: 140, color: Color(0x1A818CF8)),
        ),
      ],
    );
  }
}

class _BlurCircle extends StatelessWidget {
  const _BlurCircle({required this.size, required this.color});

  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(shape: BoxShape.circle, color: color),
    );
  }
}

/// Header brand. Logo disimpan sebagai file putih transparan, jadi tidak
/// boleh ditaruh di atas latar putih (sebelumnya tidak terlihat sama sekali) —
/// ditampilkan langsung di atas gradient gelap, seperti panel kiri login web.
class _HeroHeader extends StatelessWidget {
  const _HeroHeader();

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Semantics(
          label: 'Logo ONEZENTRA',
          image: true,
          child: SizedBox(
            height: 40,
            child: Image.asset(
              'assets/logo.png',
              fit: BoxFit.contain,
              cacheWidth: 480,
              filterQuality: FilterQuality.medium,
              excludeFromSemantics: true,
              errorBuilder: (_, _, _) => const Icon(
                Icons.warehouse_outlined,
                size: 40,
                color: Colors.white,
              ),
            ),
          ),
        ),
        const SizedBox(height: 14),
        const Text(
          'ONEZENTRA',
          style: TextStyle(
            color: Colors.white,
            fontSize: 28,
            fontWeight: FontWeight.w800,
            letterSpacing: 3,
            height: 1,
          ),
        ),
        const SizedBox(height: 6),
        const Text(
          'Warehouse Management System',
          style: TextStyle(color: AppColors.primary200, fontSize: 13),
        ),
        const SizedBox(height: 10),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.08),
            border: Border.all(color: Colors.white.withValues(alpha: 0.14)),
            borderRadius: BorderRadius.circular(999),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(
                Icons.smartphone,
                size: 14,
                color: AppColors.accent400,
              ),
              const SizedBox(width: 6),
              Text(
                'Mobile Access  ·  v$_appVersion',
                style: const TextStyle(
                  color: Colors.white70,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _FeatureGrid extends StatelessWidget {
  const _FeatureGrid();

  @override
  Widget build(BuildContext context) {
    return GridView.builder(
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        mainAxisSpacing: 12,
        crossAxisSpacing: 12,
        childAspectRatio: 1.9,
      ),
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: _features.length,
      itemBuilder: (context, i) {
        final f = _features[i];
        return Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.07),
            border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
            borderRadius: BorderRadius.circular(AppRadius.feature),
          ),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: AppColors.primary500.withValues(alpha: 0.22),
                  borderRadius: BorderRadius.circular(12),
                ),
                alignment: Alignment.center,
                child: Icon(f.icon, color: Colors.white, size: 22),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      f.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                        fontSize: 13.5,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      f.desc,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: AppColors.primary300,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _LoginCard extends StatelessWidget {
  const _LoginCard({
    required this.formKey,
    required this.emailCtrl,
    required this.passwordCtrl,
    required this.emailFocus,
    required this.passwordFocus,
    required this.emailValidator,
    required this.passwordValidator,
    required this.error,
    required this.showPassword,
    required this.isLoading,
    required this.onTogglePassword,
    required this.onClearEmail,
    required this.onEmailChanged,
    required this.onSubmit,
    required this.onForgotPassword,
  });

  final GlobalKey<FormState> formKey;
  final TextEditingController emailCtrl;
  final TextEditingController passwordCtrl;
  final FocusNode emailFocus;
  final FocusNode passwordFocus;
  final FormFieldValidator<String> emailValidator;
  final FormFieldValidator<String> passwordValidator;
  final String error;
  final bool showPassword;
  final bool isLoading;
  final VoidCallback onTogglePassword;
  final VoidCallback onClearEmail;
  final ValueChanged<String> onEmailChanged;
  final Future<void> Function() onSubmit;
  final VoidCallback onForgotPassword;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(28),
        boxShadow: const [
          BoxShadow(
            color: Color(0x33000000),
            blurRadius: 28,
            offset: Offset(0, 12),
          ),
        ],
      ),
      child: AutofillGroup(
        child: Form(
          key: formKey,
          autovalidateMode: AutovalidateMode.onUserInteraction,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Halo, Selamat Datang Kembali',
                style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                  color: AppColors.gray900,
                  height: 1.2,
                ),
              ),
              const SizedBox(height: 6),
              const Text(
                'Masuk untuk mengelola operasional gudang Anda.',
                style: TextStyle(fontSize: 14, color: AppColors.gray500),
              ),
              const SizedBox(height: 20),
              if (error.isNotEmpty) _ErrorBanner(message: error),
              if (error.isNotEmpty) const SizedBox(height: 16),
              const _FieldLabel('Email address'),
              const SizedBox(height: 8),
              TextFormField(
                controller: emailCtrl,
                focusNode: emailFocus,
                validator: emailValidator,
                onChanged: onEmailChanged,
                keyboardType: TextInputType.emailAddress,
                textInputAction: TextInputAction.next,
                autofillHints: const [AutofillHints.email],
                autocorrect: false,
                enableSuggestions: false,
                style: _inputStyle,
                onFieldSubmitted: (_) =>
                    FocusScope.of(context).requestFocus(passwordFocus),
                decoration: _inputDecoration(
                  hint: 'nama@perusahaan.com',
                  prefix: Icons.alternate_email,
                  suffix: emailCtrl.text.isNotEmpty
                      ? IconButton(
                          onPressed: onClearEmail,
                          tooltip: 'Hapus email',
                          icon: const Icon(
                            Icons.clear,
                            size: 18,
                            color: AppColors.gray400,
                          ),
                        )
                      : null,
                ),
              ),
              const SizedBox(height: 14),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const _FieldLabel('Password'),
                  TextButton(
                    onPressed: onForgotPassword,
                    style: TextButton.styleFrom(
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      minimumSize: Size.zero,
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                    child: const Text(
                      'Lupa password?',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: AppColors.primary600,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              TextFormField(
                controller: passwordCtrl,
                focusNode: passwordFocus,
                validator: passwordValidator,
                obscureText: !showPassword,
                textInputAction: TextInputAction.done,
                autofillHints: const [AutofillHints.password],
                style: _inputStyle,
                onFieldSubmitted: (_) => onSubmit(),
                decoration: _inputDecoration(
                  hint: 'Masukkan kata sandi',
                  prefix: Icons.lock_outline,
                  suffix: IconButton(
                    onPressed: onTogglePassword,
                    tooltip: showPassword
                        ? 'Sembunyikan password'
                        : 'Tampilkan password',
                    icon: Icon(
                      showPassword
                          ? Icons.visibility_off_outlined
                          : Icons.visibility_outlined,
                      size: 20,
                      color: AppColors.gray500,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 20),
              SizedBox(
                height: 54,
                child: FilledButton(
                  onPressed: isLoading ? null : onSubmit,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.primary600,
                    disabledBackgroundColor: AppColors.primary600.withValues(
                      alpha: 0.6,
                    ),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                    elevation: 2,
                  ),
                  child: isLoading
                      ? const Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                color: Colors.white,
                                strokeWidth: 2.5,
                              ),
                            ),
                            SizedBox(width: 12),
                            Text(
                              'Memeriksa...',
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ],
                        )
                      : const Row(
                          mainAxisSize: MainAxisSize.min,
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(
                              'Masuk ke Dashboard',
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            SizedBox(width: 8),
                            Icon(Icons.arrow_forward_rounded, size: 20),
                          ],
                        ),
                ),
              ),
              const SizedBox(height: 4),
            ],
          ),
        ),
      ),
    );
  }
}

class _FieldLabel extends StatelessWidget {
  const _FieldLabel(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: const TextStyle(
        fontSize: 13.5,
        fontWeight: FontWeight.w700,
        color: AppColors.gray700,
      ),
    );
  }
}

class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.errorBg,
        border: Border.all(color: AppColors.errorBorder),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: const Color(0xFFFEE2E2),
              borderRadius: BorderRadius.circular(10),
            ),
            alignment: Alignment.center,
            child: const Icon(
              Icons.error_outline,
              color: AppColors.errorText,
              size: 18,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(
                color: AppColors.errorText,
                fontSize: 13.5,
                height: 1.4,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SecureHint extends StatelessWidget {
  const _SecureHint();

  @override
  Widget build(BuildContext context) {
    return const Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(Icons.lock, size: 13, color: AppColors.gray400),
        SizedBox(width: 6),
        Text(
          'Sesi tersimpan aman di perangkat ini',
          style: TextStyle(color: AppColors.gray400, fontSize: 12),
        ),
      ],
    );
  }
}

class _Entrance extends StatelessWidget {
  const _Entrance({required this.delayMs, required this.child});

  final int delayMs;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: Duration(milliseconds: 450 + delayMs),
      curve: Curves.easeOutCubic,
      builder: (context, value, child) {
        final t = (value * 1000 - delayMs).clamp(0.0, 1000.0) / 1000.0;
        final eased = Curves.easeOutCubic.transform(t);
        return Opacity(
          opacity: eased,
          child: Transform.translate(
            offset: Offset(0, 16 * (1 - eased)),
            child: child,
          ),
        );
      },
      child: child,
    );
  }
}

const _inputStyle = TextStyle(fontSize: 14.5, color: AppColors.gray900);

InputDecoration _inputDecoration({
  required String hint,
  required IconData prefix,
  Widget? suffix,
}) {
  const border = OutlineInputBorder(
    borderRadius: BorderRadius.all(Radius.circular(14)),
    borderSide: BorderSide(color: AppColors.gray200),
  );
  const focused = OutlineInputBorder(
    borderRadius: BorderRadius.all(Radius.circular(14)),
    borderSide: BorderSide(color: AppColors.primary500, width: 1.8),
  );
  const errorBorder = OutlineInputBorder(
    borderRadius: BorderRadius.all(Radius.circular(14)),
    borderSide: BorderSide(color: AppColors.errorText),
  );
  return InputDecoration(
    hintText: hint,
    hintStyle: const TextStyle(color: AppColors.gray500, fontSize: 14),
    filled: true,
    fillColor: AppColors.gray50,
    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 15),
    border: border,
    enabledBorder: border,
    focusedBorder: focused,
    errorBorder: errorBorder,
    focusedErrorBorder: errorBorder,
    prefixIcon: Icon(prefix, size: 20, color: AppColors.gray500),
    suffixIcon: suffix,
    errorStyle: const TextStyle(fontSize: 12.5),
  );
}
