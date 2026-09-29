import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

import 'package:onezentra_mobile/core/theme/app_theme.dart';
import 'package:onezentra_mobile/features/auth/providers/auth_provider.dart';

/// Login Page - ONEZENTRA mobile sign-in screen.
///
/// Visual language: aurora indigo gradient, glass card, pill shaped inputs and
/// a gradient submit button. Every colour is derived from the active
/// [ThemeData] so the screen stays legible in light *and* dark mode.
class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> with TickerProviderStateMixin {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _emailFocusNode = FocusNode();
  final _passwordFocusNode = FocusNode();

  bool _showPassword = false;
  late final AnimationController _animationController;
  late final Animation<double> _fadeAnimation;
  late final Animation<Offset> _slideAnimation;

  /// Practical email check: `local@domain.tld`, without the classic `{2,4}` TLD
  /// length cap that rejected valid addresses such as `user@studio.museum`.
  static final RegExp _emailPattern = RegExp(
    r'^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$',
  );

  @override
  void initState() {
    super.initState();
    _animationController = AnimationController(
      duration: const Duration(milliseconds: 600),
      vsync: this,
    );
    _fadeAnimation = Tween<double>(begin: 0, end: 1).animate(
      CurvedAnimation(parent: _animationController, curve: Curves.easeOut),
    );
    _slideAnimation =
        Tween<Offset>(begin: const Offset(0, 0.12), end: Offset.zero).animate(
          CurvedAnimation(
            parent: _animationController,
            curve: Curves.easeOutCubic,
          ),
        );
    _animationController.forward();
  }

  @override
  void dispose() {
    _animationController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    _emailFocusNode.dispose();
    _passwordFocusNode.dispose();
    super.dispose();
  }

  Future<void> _handleLogin() async {
    var formState = _formKey.currentState;
    if (formState == null || !formState.validate()) return;

    // Hide the keyboard so the user immediately sees the result of the login.
    FocusScope.of(context).unfocus();

    var authProvider = context.read<AuthProvider>();
    var success = await authProvider.login(
      email: _emailController.text.trim(),
      password: _passwordController.text,
    );

    if (!mounted) return;

    // The app is wired to GoRouter: `Navigator.pushReplacementNamed` would throw
    // because GoRouter does not expose named routes on its Navigator.
    if (success) {
      context.go('/dashboard');
    }
  }

  @override
  Widget build(BuildContext context) {
    var theme = Theme.of(context);
    var isDark = theme.brightness == Brightness.dark;
    var authProvider = context.watch<AuthProvider>();

    return Scaffold(
      backgroundColor: AppTheme.primary950,
      body: Stack(
        children: [
          const Positioned.fill(child: _AuroraBackground()),
          SafeArea(
            // Keeps the card vertically centred while there is room, and turns
            // into a scroll view when the on-screen keyboard shrinks the
            // viewport (otherwise the submit button ends up off screen).
            child: LayoutBuilder(
              builder: (context, constraints) => SingleChildScrollView(
                keyboardDismissBehavior:
                    ScrollViewKeyboardDismissBehavior.onDrag,
                padding: const EdgeInsets.symmetric(
                  horizontal: AppTheme.space6,
                  vertical: AppTheme.space8,
                ),
                child: ConstrainedBox(
                  constraints: BoxConstraints(minHeight: constraints.maxHeight),
                  child: Center(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 420),
                      child: FadeTransition(
                        opacity: _fadeAnimation,
                        child: SlideTransition(
                          position: _slideAnimation,
                          child: _buildCard(
                            context,
                            theme,
                            isDark,
                            authProvider,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCard(
    BuildContext context,
    ThemeData theme,
    bool isDark,
    AuthProvider authProvider,
  ) {
    // Glass card: translucent indigo in dark mode, solid white in light mode.
    var cardColor = isDark
        ? AppTheme.primary950.withValues(alpha: 0.55)
        : Colors.white;

    return Container(
      padding: const EdgeInsets.all(AppTheme.space6),
      decoration: BoxDecoration(
        color: cardColor,
        borderRadius: BorderRadius.circular(32),
        border: Border.all(
          color: isDark ? Colors.white.withValues(alpha: 0.14) : Colors.white,
        ),
        boxShadow: [AppTheme.shadowXl, if (!isDark) AppTheme.shadowPrimary],
      ),
      child: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _buildHeader(theme, isDark),
            const SizedBox(height: AppTheme.space6),
            _buildErrorMessage(authProvider, isDark),
            _buildEmailField(theme, isDark, authProvider),
            const SizedBox(height: AppTheme.space3),
            _buildPasswordField(theme, isDark, authProvider),
            const SizedBox(height: AppTheme.space5),
            _buildSubmitButton(theme, isDark, authProvider),
            const SizedBox(height: AppTheme.space4),
            _buildTrustNote(theme, isDark),
            const SizedBox(height: AppTheme.space4),
            _buildFooter(theme, isDark),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader(ThemeData theme, bool isDark) {
    var titleColor = isDark ? Colors.white : AppTheme.gray900;
    var subtitleColor = isDark
        ? const Color(0xFFC7D2FE) // primary-200
        : AppTheme.gray500;

    return Column(
      children: [
        // Logo shown on its own: the asset is a solid white mark, so it is
        // simply recoloured for the active brightness (white on the dark glass
        // card, near-black on the light one) with no plate, tint or border
        // behind it.
        Image.asset(
          'assets/images/LOGO.png',
          height: 34,
          fit: BoxFit.contain,
          color: isDark ? Colors.white : AppTheme.gray900,
          colorBlendMode: BlendMode.srcIn,
        ),
        const SizedBox(height: AppTheme.space6),
        Text(
          'Selamat datang kembali',
          style: theme.textTheme.headlineMedium?.copyWith(
            fontWeight: FontWeight.w700,
            color: titleColor,
            letterSpacing: -0.4,
            fontSize: 22,
          ),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: AppTheme.space2),
        Text(
          'Masuk untuk melanjutkan ke ONEZENTRA',
          style: theme.textTheme.bodyMedium?.copyWith(color: subtitleColor),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }

  Widget _buildErrorMessage(AuthProvider authProvider, bool isDark) {
    var error = authProvider.error;
    if (error == null) return const SizedBox.shrink();

    var background = isDark
        ? AppTheme.danger.withValues(alpha: 0.16)
        : const Color(0xFFFEF2F2); // red-50
    var border = isDark
        ? AppTheme.danger.withValues(alpha: 0.45)
        : const Color(0xFFFECACA); // red-200
    var textColor = isDark
        ? const Color(0xFFFCA5A5) // red-300
        : const Color(0xFFB91C1C); // red-700

    // `liveRegion` makes screen readers announce the error as soon as it shows.
    return Semantics(
      liveRegion: true,
      container: true,
      child: Padding(
        padding: const EdgeInsets.only(bottom: AppTheme.space5),
        child: Container(
          padding: const EdgeInsets.symmetric(
            horizontal: AppTheme.space4,
            vertical: AppTheme.space3,
          ),
          decoration: BoxDecoration(
            color: background,
            borderRadius: AppTheme.radiusXl,
            border: Border.all(color: border),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.error_outline_rounded, size: 18, color: textColor),
              const SizedBox(width: AppTheme.space3),
              Expanded(
                child: Text(
                  error,
                  style: Theme.of(
                    context,
                  ).textTheme.bodySmall?.copyWith(color: textColor),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildEmailField(
    ThemeData theme,
    bool isDark,
    AuthProvider authProvider,
  ) => _FieldLabel(
      label: 'Email',
      isDark: isDark,
      child: TextFormField(
        controller: _emailController,
        focusNode: _emailFocusNode,
        keyboardType: TextInputType.emailAddress,
        textInputAction: TextInputAction.next,
        // An email is never autocorrected, and the autofill hint lets the
        // platform password manager fill the credentials in.
        autocorrect: false,
        enableSuggestions: false,
        autofillHints: const [AutofillHints.username],
        style: _fieldTextStyle(theme, isDark),
        cursorColor: isDark ? AppTheme.primary300 : AppTheme.primary600,
        decoration: _inputDecoration(
          hint: 'nama@onezentra.com',
          icon: Icons.mail_outline_rounded,
          isDark: isDark,
        ),
        validator: (value) {
          if (value == null || value.trim().isEmpty) {
            return 'Email tidak boleh kosong';
          }
          if (!_emailPattern.hasMatch(value.trim())) {
            return 'Format email tidak valid';
          }
          return null;
        },
        // Clear the server error as soon as the user starts correcting input.
        onChanged: (_) => authProvider.clearError(),
        onFieldSubmitted: (_) => _passwordFocusNode.requestFocus(),
      ),
    );

  Widget _buildPasswordField(
    ThemeData theme,
    bool isDark,
    AuthProvider authProvider,
  ) {
    var iconColor = isDark
        ? const Color(0xFF94A3B8) // gray-400
        : AppTheme.gray400;

    return _FieldLabel(
      label: 'Password',
      isDark: isDark,
      child: TextFormField(
        controller: _passwordController,
        focusNode: _passwordFocusNode,
        obscureText: !_showPassword,
        textInputAction: TextInputAction.done,
        // Without these the keyboard autocorrects / auto-capitalises the
        // password as soon as "show password" is toggled on, which silently
        // breaks the login.
        autocorrect: false,
        enableSuggestions: false,
        autofillHints: const [AutofillHints.password],
        style: _fieldTextStyle(theme, isDark),
        cursorColor: isDark ? AppTheme.primary300 : AppTheme.primary600,
        decoration: _inputDecoration(
          hint: 'Masukkan password',
          icon: Icons.lock_outline_rounded,
          isDark: isDark,
          suffixIcon: IconButton(
            onPressed: () => setState(() => _showPassword = !_showPassword),
            icon: Icon(
              _showPassword
                  ? Icons.visibility_off_outlined
                  : Icons.visibility_outlined,
              size: 20,
              color: iconColor,
            ),
            tooltip: _showPassword
                ? 'Sembunyikan password'
                : 'Tampilkan password',
            splashRadius: 20,
          ),
        ),
        validator: (value) {
          if (value == null || value.isEmpty) {
            return 'Password tidak boleh kosong';
          }
          // No client-side length rule on purpose: the server is the single
          // source of truth, and a local rule blocks existing accounts whose
          // password is shorter than the current policy.
          return null;
        },
        onChanged: (_) => authProvider.clearError(),
        onFieldSubmitted: (_) => _handleLogin(),
      ),
    );
  }

  TextStyle? _fieldTextStyle(ThemeData theme, bool isDark) => theme.textTheme.bodyLarge?.copyWith(
      color: isDark ? Colors.white : AppTheme.gray900,
      fontWeight: FontWeight.w500,
    );

  /// Pill shaped input shared by the email and password fields.
  InputDecoration _inputDecoration({
    required String hint,
    required IconData icon,
    required bool isDark,
    Widget? suffixIcon,
  }) {
    var theme = Theme.of(context);
    var borderColor = isDark
        ? Colors.white.withValues(alpha: 0.14)
        : AppTheme.primary100;
    var iconColor = isDark
        ? const Color(0xFF94A3B8) // gray-400
        : AppTheme.gray400;
    var focusedColor = isDark ? AppTheme.primary300 : AppTheme.primary500;

    OutlineInputBorder pill(Color color, double width) => OutlineInputBorder(
      borderRadius: AppTheme.radiusFull,
      borderSide: BorderSide(color: color, width: width),
    );

    return InputDecoration(
      hintText: hint,
      hintStyle: theme.textTheme.bodyMedium?.copyWith(color: iconColor),
      filled: true,
      fillColor: isDark
          ? Colors.white.withValues(alpha: 0.08)
          : AppTheme.surfaceHover,
      // The pill keeps its own border as the focus affordance, so the hover /
      // focus overlays stay translucent. An opaque overlay is painted on top of
      // the fill and swallows the typed text (white on white in dark mode).
      hoverColor: isDark
          ? Colors.white.withValues(alpha: 0.06)
          : AppTheme.primary50.withValues(alpha: 0.5),
      focusColor: isDark
          ? Colors.white.withValues(alpha: 0.10)
          : AppTheme.primary100.withValues(alpha: 0.35),
      contentPadding: const EdgeInsets.symmetric(
        horizontal: AppTheme.space5,
        vertical: AppTheme.space4,
      ),
      prefixIcon: Icon(icon, size: 20, color: iconColor),
      prefixIconConstraints: const BoxConstraints(minWidth: 44),
      suffixIcon: suffixIcon,
      border: pill(borderColor, 1),
      enabledBorder: pill(borderColor, 1),
      focusedBorder: pill(focusedColor, 1.6),
      errorBorder: pill(AppTheme.danger, 1.2),
      focusedErrorBorder: pill(AppTheme.danger, 1.6),
      errorStyle: theme.textTheme.bodySmall?.copyWith(
        color: isDark ? const Color(0xFFFCA5A5) : AppTheme.danger,
      ),
    );
  }

  /// Gradient pill button with an arrow affordance, replaced by a spinner while
  /// the request is running.
  Widget _buildSubmitButton(
    ThemeData theme,
    bool isDark,
    AuthProvider authProvider,
  ) {
    var isLoading = authProvider.isLoading;

    return Semantics(
      button: true,
      enabled: !isLoading,
      label: 'Masuk',
      child: AnimatedOpacity(
        duration: const Duration(milliseconds: 200),
        opacity: isLoading ? 0.8 : 1,
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: isLoading ? null : _handleLogin,
            borderRadius: AppTheme.radiusFull,
            splashColor: Colors.white.withValues(alpha: 0.14),
            highlightColor: Colors.white.withValues(alpha: 0.06),
            child: Ink(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: isLoading
                      ? [AppTheme.gray400, AppTheme.gray500]
                      : [AppTheme.primary600, AppTheme.primary500],
                ),
                borderRadius: AppTheme.radiusFull,
                boxShadow: isLoading ? null : [AppTheme.shadowPrimary],
              ),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: AppTheme.space4),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    if (isLoading)
                      const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          valueColor: AlwaysStoppedAnimation<Color>(
                            Colors.white,
                          ),
                        ),
                      )
                    else ...[
                      Text(
                        'Masuk',
                        style: GoogleFonts.roboto(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                          color: Colors.white,
                        ),
                      ),
                      const SizedBox(width: AppTheme.space2),
                      const Icon(
                        Icons.arrow_forward_rounded,
                        size: 20,
                        color: Colors.white,
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildTrustNote(ThemeData theme, bool isDark) {
    var noteColor = isDark
        ? const Color(0xFF94A3B8) // gray-400
        : AppTheme.gray400;

    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(Icons.shield_outlined, size: 14, color: noteColor),
        const SizedBox(width: AppTheme.space2),
        Flexible(
          child: Text(
            'Sesi dilindungi token per perangkat',
            style: theme.textTheme.bodySmall?.copyWith(color: noteColor),
            textAlign: TextAlign.center,
          ),
        ),
      ],
    );
  }

  Widget _buildFooter(ThemeData theme, bool isDark) {
    var footerColor = isDark
        ? const Color(0xFF64748B) // gray-500
        : AppTheme.gray400;

    return Text(
      '© ${DateTime.now().year} ONEZENTRA · Langkau_kami',
      style: theme.textTheme.bodySmall?.copyWith(color: footerColor),
      textAlign: TextAlign.center,
    );
  }
}

/// Small caption above each input.
class _FieldLabel extends StatelessWidget {
  const _FieldLabel({
    required this.label,
    required this.isDark,
    required this.child,
  });

  final String label;
  final bool isDark;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    var labelColor = isDark
        ? const Color(0xFFC7D2FE) // primary-200
        : AppTheme.gray600;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: Theme.of(context).textTheme.labelMedium?.copyWith(
            color: labelColor,
            fontWeight: FontWeight.w600,
            letterSpacing: 0.4,
          ),
        ),
        const SizedBox(height: AppTheme.space2),
        child,
      ],
    );
  }
}

/// Aurora gradient with two soft colour blobs behind the login card.
class _AuroraBackground extends StatelessWidget {
  const _AuroraBackground();

  @override
  Widget build(BuildContext context) => const Stack(
      fit: StackFit.expand,
      children: [
        DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                Color(0xFF1E1B4B), // primary-950
                Color(0xFF4F46E5), // primary-600
                Color(0xFF0F172A), // gray-900
              ],
              stops: [0, 0.45, 1],
            ),
          ),
        ),
        Align(
          alignment: Alignment.topRight,
          child: _Glow(color: Color(0x4D2DD4BF), size: 280), // accent-400
        ),
        Align(
          alignment: Alignment.bottomLeft,
          child: _Glow(color: Color(0x4D818CF8), size: 320), // primary-400
        ),
      ],
    );
}

/// Radial blob used to soften the gradient.
class _Glow extends StatelessWidget {
  const _Glow({required this.color, required this.size});

  final Color color;
  final double size;

  @override
  Widget build(BuildContext context) => IgnorePointer(
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: RadialGradient(colors: [color, color.withValues(alpha: 0)]),
        ),
      ),
    );
}
