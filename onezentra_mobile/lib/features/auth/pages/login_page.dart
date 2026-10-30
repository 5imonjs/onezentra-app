import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

import 'package:onezentra_mobile/core/network/api_client.dart';
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
  bool _showServer = false;
  bool _savingServer = false;
  String? _serverNotice;
  String? _serverError;
  final _serverController = TextEditingController();
  Timer? _cooldownTimer;
  int _cooldownRemaining = 0;
  AutovalidateMode _autovalidateMode = AutovalidateMode.disabled;
  late final AnimationController _animationController;
  late final Animation<double> _fadeAnimation;
  late final Animation<Offset> _slideAnimation;

  /// Local part accepts the RFC characters the server accepts, but extra
  /// checks below reject leading/trailing dots, consecutive dots, and domain
  /// labels that start or end with a hyphen. The previous regex let
  /// `a..b@example.com` reach Laravel, which then answered with an English
  /// validation message.
  static final RegExp _localPartPattern = RegExp(
    r"^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+$",
  );
  static final RegExp _domainLabelPattern = RegExp(r'^[A-Za-z0-9-]+$');
  static final RegExp _tldPattern = RegExp(r'^[A-Za-z]{2,}$');

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
    _cooldownTimer?.cancel();
    _animationController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    _serverController.dispose();
    _emailFocusNode.dispose();
    _passwordFocusNode.dispose();
    super.dispose();
  }

  /// Validates `local@domain.tld` without the classic `{2,4}` TLD cap that
  /// rejected valid addresses such as `user@studio.museum`, but stricter than
  /// the old regex so the client and the server agree on obvious mistakes.
  static bool _isValidEmail(String value) {
    var email = value.trim();
    if (email.isEmpty || email.length > 254) {
      return false;
    }

    var parts = email.split('@');
    if (parts.length != 2) {
      return false;
    }

    var local = parts[0];
    var domain = parts[1];
    if (local.isEmpty ||
        local.length > 64 ||
        local.startsWith('.') ||
        local.endsWith('.') ||
        local.contains('..') ||
        !_localPartPattern.hasMatch(local)) {
      return false;
    }

    if (domain.isEmpty || domain.length > 253) {
      return false;
    }

    var labels = domain.split('.');
    if (labels.length < 2) {
      return false;
    }
    for (var label in labels) {
      if (label.isEmpty ||
          label.length > 63 ||
          label.startsWith('-') ||
          label.endsWith('-') ||
          !_domainLabelPattern.hasMatch(label)) {
        return false;
      }
    }

    return _tldPattern.hasMatch(labels.last);
  }

  Future<void> _handleLogin() async {
    if (_cooldownRemaining > 0) {
      return;
    }

    var formState = _formKey.currentState;
    if (formState == null) {
      return;
    }
    if (!formState.validate()) {
      // Turn on live validation only after the first failed submit, so the
      // user does not see "wajib diisi" before touching anything. From here
      // on, correcting an input immediately clears its error.
      if (_autovalidateMode == AutovalidateMode.disabled) {
        setState(() => _autovalidateMode = AutovalidateMode.onUserInteraction);
      }
      return;
    }

    // Hide the keyboard so the user immediately sees the result of the login.
    FocusScope.of(context).unfocus();

    var authProvider = context.read<AuthProvider>();
    var success = await authProvider.login(
      email: _emailController.text.trim(),
      password: _passwordController.text,
    );

    if (!mounted) {
      return;
    }

    // The app is wired to GoRouter: `Navigator.pushReplacementNamed` would throw
    // because GoRouter does not expose named routes on its Navigator.
    if (success) {
      // Lets Android/iOS password managers offer to save the credentials.
      TextInput.finishAutofillContext();
      context.go('/home');
      return;
    }

    // A 429 means every retry inside the window is rejected by the server.
    // Keep the button disabled until the server told us it is safe again.
    var retryAfter = authProvider.retryAfter;
    if (retryAfter != null) {
      _startCooldown(retryAfter);
    } else if (authProvider.errorStatusCode == 429) {
      _startCooldown(const Duration(seconds: 60));
    }
  }

  void _startCooldown(Duration duration) {
    var seconds = duration.inSeconds;
    if (seconds <= 0) {
      return;
    }

    _cooldownTimer?.cancel();
    setState(() => _cooldownRemaining = seconds);
    _cooldownTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted || _cooldownRemaining <= 1) {
        timer.cancel();
        if (mounted) {
          setState(() => _cooldownRemaining = 0);
        }
        return;
      }
      setState(() => _cooldownRemaining -= 1);
    });
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
        : Theme.of(context).extension<ThemeColors>()?.foreground ?? AppTheme.foreground;

    return Container(
      padding: const EdgeInsets.all(AppTheme.space6),
      decoration: BoxDecoration(
        color: cardColor,
        borderRadius: BorderRadius.circular(32),
        border: Border.all(
          color: isDark ? Theme.of(context).extension<ThemeColors>()?.foreground ?? AppTheme.foreground.withValues(alpha: 0.14) : Theme.of(context).extension<ThemeColors>()?.foreground ?? AppTheme.foreground,
        ),
        boxShadow: [AppTheme.shadowXl, if (!isDark) AppTheme.shadowPrimary],
      ),
      child: Form(
        key: _formKey,
        autovalidateMode: _autovalidateMode,
        child: AutofillGroup(
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
              _buildServerSection(theme, isDark, authProvider),
            ],
          ),
        ),
      ),
    );
  }

  /// Pilihan server API saat runtime: app mengikuti server mana pun tanpa
  /// rebuild. Ganti server membuang sesi lama (token milik server sebelumnya).
  void _toggleServerPanel(AuthProvider authProvider) {
    setState(() {
      _showServer = !_showServer;
      _serverNotice = null;
      _serverError = null;
      if (_showServer) {
        _serverController.text = authProvider.apiBaseUrl;
      }
    });
  }

  /// Replacing the server clears the current session, so make the destination
  /// explicit before accepting the change. This also prevents a mistyped host
  /// from silently receiving the next login attempt.
  Future<bool> _confirmServerChange(String current, String next) async {
    FocusScope.of(context).unfocus();
    var confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Ganti server?'),
        content: Text(
          'Aplikasi akan diarahkan ke server berikut:\n\n'
          '$next\n\n'
          'Server saat ini: $current\n\n'
          'Sesi saat ini akan dihapus dan Anda harus login ulang.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Batal'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Ganti server'),
          ),
        ],
      ),
    );
    return confirmed ?? false;
  }

  Future<void> _handleSaveServer(AuthProvider authProvider) async {
    if (_savingServer) {
      return;
    }

    var input = _serverController.text;
    if (input.trim().isEmpty) {
      setState(() {
        _serverNotice = null;
        _serverError =
            'Alamat server tidak boleh kosong. Gunakan tombol Bawaan untuk '
            'kembali ke server default.';
      });
      return;
    }

    var preview = ApiClient.normalizeBaseUrl(input);
    if (preview == authProvider.apiBaseUrl) {
      setState(() {
        _serverError = null;
        _serverNotice = 'Server tidak berubah.';
      });
      return;
    }

    if (preview != null) {
      var confirmed = await _confirmServerChange(
        authProvider.apiBaseUrl,
        preview,
      );
      if (!confirmed || !mounted) {
        return;
      }
    }

    await _applyServer(authProvider, input);
  }

  Future<void> _handleResetServer(AuthProvider authProvider) async {
    if (_savingServer) {
      return;
    }

    var target = ApiClient.resolvedBaseUrl;
    if (authProvider.apiBaseUrl == target) {
      setState(() {
        _serverController.text = authProvider.apiBaseUrl;
        _serverError = null;
        _serverNotice = 'Sudah memakai server bawaan.';
      });
      return;
    }

    var confirmed = await _confirmServerChange(authProvider.apiBaseUrl, target);
    if (!confirmed || !mounted) {
      return;
    }

    await _applyServer(authProvider, '');
  }

  Future<void> _applyServer(AuthProvider authProvider, String input) async {
    // Drop any leftover login error so a failure below can only show the
    // server error next to the field.
    authProvider.clearError();
    setState(() {
      _savingServer = true;
      _serverError = null;
      _serverNotice = null;
    });
    FocusScope.of(context).unfocus();

    String? effective;
    try {
      effective = await authProvider.setApiBaseUrl(input);
    } catch (_) {
      effective = null;
    }

    if (!mounted) {
      return;
    }

    setState(() {
      _savingServer = false;
      if (effective == null) {
        _serverError =
            authProvider.error ?? 'Gagal menyimpan server. Silakan coba lagi.';
      } else {
        _serverController.text = authProvider.apiBaseUrl;
        _serverNotice = input.trim().isEmpty
            ? 'Kembali ke server bawaan: $effective'
            : 'Server: $effective — silakan login ulang.';
      }
    });

    if (effective == null) {
      // Show the failure next to the field instead of the banner at the top
      // of the card, which may be scrolled out of view.
      authProvider.clearError();
    }
  }

  Widget _buildServerSection(
    ThemeData theme,
    bool isDark,
    AuthProvider authProvider,
  ) {
    var muted = isDark
        ? const Color(0xFF94A3B8) // gray-400
        : Theme.of(context).extension<ThemeColors>()?.gray400 ?? AppTheme.gray400;
    var parsedHost = Uri.tryParse(authProvider.apiBaseUrl)?.host ?? '';
    var host = parsedHost.isEmpty ? authProvider.apiBaseUrl : parsedHost;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: AppTheme.space2),
        TextButton.icon(
          onPressed: () => _toggleServerPanel(authProvider),
          icon: Icon(Icons.dns_outlined, size: 16, color: muted),
          label: Text(
            'Server: $host',
            style: theme.textTheme.bodySmall?.copyWith(color: muted),
            overflow: TextOverflow.ellipsis,
          ),
        ),
        if (_showServer) ...[
          const SizedBox(height: AppTheme.space2),
          _FieldLabel(
            label: 'Alamat server',
            isDark: isDark,
            child: TextField(
              key: const Key('server-url-field'),
              controller: _serverController,
              keyboardType: TextInputType.url,
              autocorrect: false,
              enableSuggestions: false,
              style: _fieldTextStyle(theme, isDark),
              cursorColor: isDark ? AppTheme.primary300 : AppTheme.primary600,
              decoration: _inputDecoration(
                hint: ApiClient.productionBaseUrl,
                icon: Icons.link_outlined,
                isDark: isDark,
                errorText: _serverError,
              ),
              onChanged: (_) {
                if (_serverError != null) {
                  setState(() => _serverError = null);
                }
              },
              onSubmitted: (_) => _handleSaveServer(authProvider),
            ),
          ),
          const SizedBox(height: AppTheme.space2),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: _savingServer
                      ? null
                      : () => _handleResetServer(authProvider),
                  child: const Text('Bawaan'),
                ),
              ),
              const SizedBox(width: AppTheme.space2),
              Expanded(
                child: FilledButton(
                  onPressed: _savingServer
                      ? null
                      : () => _handleSaveServer(authProvider),
                  child: _savingServer
                      ? const SizedBox(
                          height: 16,
                          width: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Simpan'),
                ),
              ),
            ],
          ),
          if (_serverNotice != null) ...[
            const SizedBox(height: AppTheme.space2),
            Semantics(
              liveRegion: true,
              child: Text(
                _serverNotice!,
                style: theme.textTheme.bodySmall?.copyWith(color: muted),
                textAlign: TextAlign.center,
              ),
            ),
          ],
        ],
      ],
    );
  }

  Widget _buildHeader(ThemeData theme, bool isDark) {
    var titleColor = isDark ? Theme.of(context).extension<ThemeColors>()?.foreground ?? AppTheme.foreground : Theme.of(context).extension<ThemeColors>()?.gray900 ?? Theme.of(context).extension<ThemeColors>()?.gray900 ?? AppTheme.gray900;
    var subtitleColor = isDark
        ? const Color(0xFFC7D2FE) // primary-200
        : Theme.of(context).extension<ThemeColors>()?.gray50 ?? AppTheme.gray500;

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
          color: isDark ? Theme.of(context).extension<ThemeColors>()?.foreground ?? AppTheme.foreground : Theme.of(context).extension<ThemeColors>()?.gray900 ?? Theme.of(context).extension<ThemeColors>()?.gray900 ?? AppTheme.gray900,
          colorBlendMode: BlendMode.srcIn,
          semanticLabel: 'ONEZENTRA',
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
    if (error == null) {
      return const SizedBox.shrink();
    }

    var background = isDark
        ? AppTheme.danger.withValues(alpha: 0.16)
        : AppTheme.dangerWell; // red-50
    var border = isDark
        ? AppTheme.danger.withValues(alpha: 0.45)
        : AppTheme.dangerText; // red-200
    var textColor = isDark
        ? const Color(0xFFFCA5A5) // red-300
        : AppTheme.dangerText; // red-700

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
        if (!_isValidEmail(value)) {
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
        : Theme.of(context).extension<ThemeColors>()?.gray400 ?? AppTheme.gray400;

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
        // Keep the keyboard from learning a password typed into the field.
        enableIMEPersonalizedLearning: false,
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

  TextStyle? _fieldTextStyle(ThemeData theme, bool isDark) =>
      theme.textTheme.bodyLarge?.copyWith(
        color: isDark ? Theme.of(context).extension<ThemeColors>()?.foreground ?? AppTheme.foreground : Theme.of(context).extension<ThemeColors>()?.gray900 ?? Theme.of(context).extension<ThemeColors>()?.gray900 ?? AppTheme.gray900,
        fontWeight: FontWeight.w500,
      );

  /// Pill shaped input shared by the email, password, and server fields.
  InputDecoration _inputDecoration({
    required String hint,
    required IconData icon,
    required bool isDark,
    Widget? suffixIcon,
    String? errorText,
  }) {
    var theme = Theme.of(context);
    var borderColor = isDark
        ? Theme.of(context).extension<ThemeColors>()?.foreground ?? AppTheme.foreground.withValues(alpha: 0.14)
        : AppTheme.primary100;
    var iconColor = isDark
        ? const Color(0xFF94A3B8) // gray-400
        : Theme.of(context).extension<ThemeColors>()?.gray400 ?? AppTheme.gray400;
    var focusedColor = isDark ? AppTheme.primary300 : AppTheme.primary500;

    OutlineInputBorder pill(Color color, double width) => OutlineInputBorder(
      borderRadius: AppTheme.radiusFull,
      borderSide: BorderSide(color: color, width: width),
    );

    return InputDecoration(
      hintText: hint,
      errorText: errorText,
      errorMaxLines: 3,
      hintStyle: theme.textTheme.bodyMedium?.copyWith(color: iconColor),
      filled: true,
      fillColor: isDark
          ? Theme.of(context).extension<ThemeColors>()?.foreground ?? AppTheme.foreground.withValues(alpha: 0.08)
          : Theme.of(context).extension<ThemeColors>()?.surfaceHover ?? Theme.of(context).extension<ThemeColors>()?.surface ?? AppTheme.surfaceHover,
      // The pill keeps its own border as the focus affordance, so the hover /
      // focus overlays stay translucent. An opaque overlay is painted on top of
      // the fill and swallows the typed text (white on white in dark mode).
      hoverColor: isDark
          ? Theme.of(context).extension<ThemeColors>()?.foreground ?? AppTheme.foreground.withValues(alpha: 0.06)
          : AppTheme.primary50.withValues(alpha: 0.5),
      focusColor: isDark
          ? Theme.of(context).extension<ThemeColors>()?.foreground ?? AppTheme.foreground.withValues(alpha: 0.10)
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
    var isCoolingDown = _cooldownRemaining > 0;
    var isDisabled = isLoading || isCoolingDown;
    var buttonLabel = isCoolingDown
        ? 'Tunggu $_cooldownRemaining dtk'
        : 'Masuk';

    return Semantics(
      button: true,
      enabled: !isDisabled,
      label: buttonLabel,
      // Keep the accessibility action even though child semantics are
      // excluded to avoid the label being announced twice.
      onTap: isDisabled ? null : _handleLogin,
      excludeSemantics: true,
      child: AnimatedOpacity(
        duration: const Duration(milliseconds: 200),
        opacity: isDisabled ? 0.8 : 1,
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: isDisabled ? null : _handleLogin,
            borderRadius: AppTheme.radiusFull,
            splashColor: Theme.of(context).extension<ThemeColors>()?.foreground ?? AppTheme.foreground.withValues(alpha: 0.14),
            highlightColor: Theme.of(context).extension<ThemeColors>()?.foreground ?? AppTheme.foreground.withValues(alpha: 0.06),
            child: Ink(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: isDisabled
                      ? [Theme.of(context).extension<ThemeColors>()?.gray400 ?? AppTheme.gray400, Theme.of(context).extension<ThemeColors>()?.gray50 ?? AppTheme.gray500]
                      : [AppTheme.primary600, AppTheme.primary500],
                ),
                borderRadius: AppTheme.radiusFull,
                boxShadow: isDisabled ? null : [AppTheme.shadowPrimary],
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
                          valueColor: AlwaysStoppedAnimation<Color>(AppTheme.gray900,
                          ),
                        ),
                      )
                    else if (isCoolingDown)
                      Text(
                        buttonLabel,
                        style: GoogleFonts.roboto(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                          color: Theme.of(context).extension<ThemeColors>()?.foreground ?? AppTheme.foreground,
                        ),
                      )
                    else ...[
                      Text(
                        'Masuk',
                        style: GoogleFonts.roboto(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                          color: Theme.of(context).extension<ThemeColors>()?.foreground ?? AppTheme.foreground,
                        ),
                      ),
                      SizedBox(width: AppTheme.space2),
                      Icon(
                        Icons.arrow_forward_rounded,
                        size: 20,
                        color: Theme.of(context).extension<ThemeColors>()?.foreground ?? AppTheme.foreground,
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
        : Theme.of(context).extension<ThemeColors>()?.gray400 ?? AppTheme.gray400;

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
        : Theme.of(context).extension<ThemeColors>()?.gray400 ?? AppTheme.gray400;

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
        : Theme.of(context).extension<ThemeColors>()?.gray600 ?? AppTheme.gray600;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // The caption is visual only; the field below carries the same label
        // in its semantics node so screen readers announce it when focused.
        ExcludeSemantics(
          child: Text(
            label,
            style: Theme.of(context).textTheme.labelMedium?.copyWith(
              color: labelColor,
              fontWeight: FontWeight.w600,
              letterSpacing: 0.4,
            ),
          ),
        ),
        const SizedBox(height: AppTheme.space2),
        Semantics(label: label, child: child),
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
