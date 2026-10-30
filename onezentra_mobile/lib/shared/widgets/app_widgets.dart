import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:onezentra_mobile/core/theme/app_theme.dart';

/// Custom text field matching the web app's input-field style
class AppTextField extends StatelessWidget {
  const AppTextField({
    super.key,
    this.controller,
    this.label,
    this.hint,
    this.prefixIcon,
    this.suffixIcon,
    this.obscureText = false,
    this.keyboardType,
    this.textInputAction,
    this.validator,
    this.autovalidateMode,
    this.onSaved,
    this.onChanged,
    this.onEditingComplete,
    this.onSubmitted,
    this.onTap,
    this.readOnly = false,
    this.enabled = true,
    this.maxLines = 1,
    this.maxLength,
    this.focusNode,
    this.autofocus = false,
  });
  final TextEditingController? controller;
  final String? label;
  final String? hint;
  final IconData? prefixIcon;
  final Widget? suffixIcon;
  final bool obscureText;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final String? Function(String?)? validator;

  /// Kapan validator dijalankan. Bawaan bila null (hanya saat
  /// form.validate()) membuat pesan error "menempel" — operator sudah
  /// mengisi kolom dengan benar tetapi merahnya baru hilang setelah menekan
  /// Simpan lagi. Isi [AutovalidateMode.onUserInteraction] untuk form yang
  /// errornya harus hilang begitu isian menjadi sah.
  final AutovalidateMode? autovalidateMode;
  final void Function(String?)? onSaved;
  final void Function(String)? onChanged;
  final void Function()? onEditingComplete;

  /// Dipanggil saat user menekan tombol aksi keyboard (mis. "done") —
  /// dipakai sheet barang luar rencana untuk mencocokkan barcode ke master.
  final ValueChanged<String>? onSubmitted;
  final void Function()? onTap;
  final bool readOnly;
  final bool enabled;
  final int? maxLines;
  final int? maxLength;
  final FocusNode? focusNode;
  final bool autofocus;

  @override
  Widget build(BuildContext context) {
    var theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (label != null) ...[
          Text(
            label!,
            style: theme.textTheme.labelLarge?.copyWith(
              fontWeight: FontWeight.w600,
              color: context.colors.textSecondary,
            ),
          ),
          const SizedBox(height: AppTheme.space2),
        ],
        TextFormField(
          controller: controller,
          obscureText: obscureText,
          keyboardType: keyboardType,
          textInputAction: textInputAction,
          validator: validator,
          autovalidateMode: autovalidateMode,
          onSaved: onSaved,
          onChanged: onChanged,
          onEditingComplete: onEditingComplete,
          onFieldSubmitted: onSubmitted,
          onTap: onTap,
          readOnly: readOnly,
          enabled: enabled,
          maxLines: maxLines,
          maxLength: maxLength,
          focusNode: focusNode,
          autofocus: autofocus,
          style: theme.textTheme.bodyMedium?.copyWith(
            color: context.colors.foreground,
          ),
          decoration: InputDecoration(
            hintText: hint,
            prefixIcon: prefixIcon != null
                ? Icon(prefixIcon, size: 20, color: context.colors.textMuted)
                : null,
            suffixIcon: suffixIcon,
            counterText: '',
            filled: true,
            fillColor: context.colors.surfaceCard,
            contentPadding: const EdgeInsets.symmetric(
              horizontal: AppTheme.space4,
              vertical: AppTheme.space3,
            ),
            border: OutlineInputBorder(
              borderRadius: AppTheme.radiusXl,
              borderSide: BorderSide(color: context.colors.gray200),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: AppTheme.radiusXl,
              borderSide: BorderSide(color: context.colors.gray200),
            ),
            focusedBorder: const OutlineInputBorder(
              borderRadius: AppTheme.radiusXl,
              borderSide: BorderSide(color: AppTheme.primary500, width: 2),
            ),
            errorBorder: OutlineInputBorder(
              borderRadius: AppTheme.radiusXl,
              borderSide: BorderSide(color: context.colors.danger),
            ),
            focusedErrorBorder: OutlineInputBorder(
              borderRadius: AppTheme.radiusXl,
              borderSide: BorderSide(color: context.colors.danger, width: 2),
            ),
            disabledBorder: OutlineInputBorder(
              borderRadius: AppTheme.radiusXl,
              borderSide: BorderSide(color: context.colors.gray200),
            ),
            labelStyle: theme.textTheme.bodyMedium?.copyWith(
              color: context.colors.textSecondary,
            ),
            hintStyle: theme.textTheme.bodyMedium?.copyWith(
              color: context.colors.textMuted,
            ),
            errorStyle: theme.textTheme.bodySmall?.copyWith(
              color: context.colors.danger,
            ),
            floatingLabelBehavior: FloatingLabelBehavior.auto,
            prefixIconColor: context.colors.gray400,
            suffixIconColor: context.colors.gray400,
          ),
        ),
      ],
    );
  }
}

/// Primary button matching the web app's btn-primary style
class AppPrimaryButton extends StatelessWidget {
  const AppPrimaryButton({
    required this.text,
    super.key,
    this.onPressed,
    this.isLoading = false,
    this.isFullWidth = true,
    this.width,
    this.height = 52,
    this.leadingIcon,
    this.trailingIcon,
  });
  final String text;
  final VoidCallback? onPressed;
  final bool isLoading;
  final bool isFullWidth;
  final double? width;
  final double height;
  final IconData? leadingIcon;
  final IconData? trailingIcon;

  @override
  Widget build(BuildContext context) {
    var theme = Theme.of(context);

    var button = ElevatedButton(
      onPressed: isLoading ? null : onPressed,
      style: theme.elevatedButtonTheme.style?.copyWith(
        minimumSize: WidgetStateProperty.all(
          Size(isFullWidth ? double.infinity : (width ?? 0), height),
        ),
        padding: WidgetStateProperty.all(
          EdgeInsets.symmetric(
            horizontal: isFullWidth ? AppTheme.space6 : AppTheme.space4,
            vertical: AppTheme.space3,
          ),
        ),
      ),
      child: isLoading
          ? SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                valueColor: AlwaysStoppedAnimation<Color>(
                  theme.colorScheme.onPrimary,
                ),
              ),
            )
          : Row(
              mainAxisSize: isFullWidth ? MainAxisSize.max : MainAxisSize.min,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (leadingIcon != null) ...[
                  Icon(leadingIcon, size: 18),
                  const SizedBox(width: AppTheme.space2),
                ],
                Flexible(child: Text(text, textAlign: TextAlign.center)),
                if (trailingIcon != null) ...[
                  const SizedBox(width: AppTheme.space2),
                  Icon(trailingIcon, size: 18),
                ],
              ],
            ),
    );

    if (isFullWidth) {
      return SizedBox(width: double.infinity, child: button);
    }
    return button;
  }
}

/// Secondary button matching the web app's btn-secondary style
class AppSecondaryButton extends StatelessWidget {
  const AppSecondaryButton({
    required this.text,
    super.key,
    this.onPressed,
    this.isLoading = false,
    this.isFullWidth = true,
    this.width,
    this.height = 52,
    this.leadingIcon,
    this.trailingIcon,
  });
  final String text;
  final VoidCallback? onPressed;
  final bool isLoading;
  final bool isFullWidth;
  final double? width;
  final double height;
  final IconData? leadingIcon;
  final IconData? trailingIcon;

  @override
  Widget build(BuildContext context) {
    var theme = Theme.of(context);

    var button = OutlinedButton(
      onPressed: isLoading ? null : onPressed,
      style: theme.outlinedButtonTheme.style?.copyWith(
        minimumSize: WidgetStateProperty.all(
          Size(isFullWidth ? double.infinity : (width ?? 0), height),
        ),
        padding: WidgetStateProperty.all(
          EdgeInsets.symmetric(
            horizontal: isFullWidth ? AppTheme.space6 : AppTheme.space4,
            vertical: AppTheme.space3,
          ),
        ),
      ),
      child: isLoading
          ? SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                valueColor: AlwaysStoppedAnimation<Color>(
                  theme.colorScheme.primary,
                ),
              ),
            )
          : Row(
              mainAxisSize: isFullWidth ? MainAxisSize.max : MainAxisSize.min,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (leadingIcon != null) ...[
                  Icon(leadingIcon, size: 18),
                  const SizedBox(width: AppTheme.space2),
                ],
                Flexible(child: Text(text, textAlign: TextAlign.center)),
                if (trailingIcon != null) ...[
                  const SizedBox(width: AppTheme.space2),
                  Icon(trailingIcon, size: 18),
                ],
              ],
            ),
    );

    if (isFullWidth) {
      return SizedBox(width: double.infinity, child: button);
    }
    return button;
  }
}

/// Text button matching the web app's style
class AppTextButton extends StatelessWidget {
  const AppTextButton({
    required this.text,
    super.key,
    this.onPressed,
    this.style,
  });
  final String text;
  final VoidCallback? onPressed;
  final TextStyle? style;

  @override
  Widget build(BuildContext context) {
    var theme = Theme.of(context);

    return TextButton(
      onPressed: onPressed,
      style: theme.textButtonTheme.style,
      child: Text(
        text,
        style:
            style ??
            theme.textTheme.labelLarge?.copyWith(
              fontWeight: FontWeight.w500,
              color: AppTheme.primary600,
            ),
      ),
    );
  }
}

/// Card widget matching the web app's card style
class AppCard extends StatelessWidget {
  const AppCard({
    required this.child,
    super.key,
    this.padding,
    this.margin,
    this.color,
    this.shadows,
    this.borderRadius,
    this.border,
    this.onTap,
  });
  final Widget child;
  final EdgeInsetsGeometry? padding;
  final EdgeInsetsGeometry? margin;
  final Color? color;
  final List<BoxShadow>? shadows;
  final BorderRadius? borderRadius;
  final Border? border;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    var radius = borderRadius ?? AppTheme.radius2xl;
    var cardBorder = border ?? Border.all(color: context.colors.gray300);
    var cardShadow =
        shadows ??
        [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            offset: const Offset(0, 1),
            blurRadius: 3,
          ),
        ];

    // No tap target: keep the simple opaque container.
    if (onTap == null) {
      return Container(
        padding: padding ?? const EdgeInsets.all(AppTheme.space6),
        margin: margin,
        decoration: BoxDecoration(
          color: color ?? context.colors.surfaceCard,
          borderRadius: radius,
          border: cardBorder,
          boxShadow: cardShadow,
        ),
        child: child,
      );
    }

    // Interactive cards put the colour on the Material, not on an opaque
    // child. An opaque Container above InkWell paints over the ripple,
    // highlight, and keyboard focus ring, leaving the card with no feedback.
    return Container(
      margin: margin,
      decoration: BoxDecoration(borderRadius: radius, boxShadow: cardShadow),
      child: Material(
        color: color ?? context.colors.surfaceCard,
        borderRadius: radius,
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          borderRadius: radius,
          child: Container(
            padding: padding ?? const EdgeInsets.all(AppTheme.space6),
            decoration: BoxDecoration(borderRadius: radius, border: cardBorder),
            child: child,
          ),
        ),
      ),
    );
  }
}

/// Badge widget matching the web app's badge style
class AppBadge extends StatelessWidget {
  const AppBadge({
    required this.text,
    super.key,
    this.variant = AppBadgeVariant.info,
    this.icon,
  });
  final String text;
  final AppBadgeVariant variant;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    var theme = Theme.of(context);

    Color backgroundColor;
    Color textColor;
    Color borderColor;

    switch (variant) {
      case AppBadgeVariant.success:
        backgroundColor = context.colors.successWell;
        textColor = context.colors.successText;
        borderColor = context.colors.success;
        break;
      case AppBadgeVariant.warning:
        backgroundColor = context.colors.warningWell;
        textColor = context.colors.warningText;
        borderColor = context.colors.warning;
        break;
      case AppBadgeVariant.danger:
        backgroundColor = context.colors.dangerWell;
        textColor = context.colors.dangerText;
        borderColor = context.colors.danger;
        break;
      case AppBadgeVariant.info:
        backgroundColor = context.colors.infoWell;
        textColor = context.colors.infoText;
        borderColor = context.colors.info;
        break;
      case AppBadgeVariant.primary:
        backgroundColor = context.colors.primaryWell;
        textColor = context.colors.primaryWellText;
        borderColor = context.colors.primaryWellBorder;
        break;
      case AppBadgeVariant.gray:
        backgroundColor = context.colors.gray200;
        textColor = context.colors.gray700;
        borderColor = context.colors.gray300;
        break;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: AppTheme.radiusFull,
        border: Border.all(color: borderColor),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 10, color: textColor),
            const SizedBox(width: 2),
          ],
          Flexible(
            child: Text(
              text,
              style: theme.textTheme.labelSmall?.copyWith(
                fontWeight: FontWeight.w600,
                color: textColor,
                fontSize: 9,
              ),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}

enum AppBadgeVariant { success, warning, danger, info, primary, gray }

/// Counter tile used in the dark operational headers (Check In Point,
/// Validasi SJ). Shared so the header rhythm cannot drift between pages.
class AppStatTile extends StatelessWidget {
  const AppStatTile({
    required this.label,
    required this.value,
    required this.dotColor,
    super.key,
  });
  final String label;
  final int value;
  final Color dotColor;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(AppTheme.space3),
    decoration: BoxDecoration(
      color: context.colors.foreground.withValues(alpha: 0.07),
      borderRadius: AppTheme.radiusLg,
      border: Border.all(
        color: context.colors.foreground.withValues(alpha: 0.1),
      ),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          children: [
            Container(
              width: 6,
              height: 6,
              decoration: BoxDecoration(
                color: dotColor,
                shape: BoxShape.circle,
              ),
            ),
            const SizedBox(width: 6),
            Expanded(
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: GoogleFonts.roboto(
                  fontSize: 10.5,
                  height: 1.2,
                  color: context.colors.textMuted,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 6),
        Text(
          '$value',
          style: GoogleFonts.roboto(
            fontSize: 22,
            height: 1.1,
            fontWeight: FontWeight.w700,
            color: context.colors.foreground,
          ),
        ),
      ],
    ),
  );
}

/// Loading overlay
class AppLoadingOverlay extends StatelessWidget {
  const AppLoadingOverlay({
    required this.isLoading,
    required this.child,
    super.key,
    this.message,
  });
  final bool isLoading;
  final Widget child;
  final String? message;

  @override
  Widget build(BuildContext context) => Stack(
    children: [
      child,
      if (isLoading)
        Container(
          color: Colors.black.withValues(alpha: 0.3),
          child: Center(
            child: Container(
              padding: const EdgeInsets.all(AppTheme.space6),
              decoration: BoxDecoration(
                color: context.colors.surfaceCard,
                borderRadius: AppTheme.radiusXl,
                boxShadow: const [AppTheme.shadowXl],
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const CircularProgressIndicator(
                    strokeWidth: 3,
                    valueColor: AlwaysStoppedAnimation<Color>(
                      AppTheme.primary600,
                    ),
                  ),
                  if (message != null) ...[
                    const SizedBox(height: AppTheme.space4),
                    Text(
                      message!,
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: context.colors.textSecondary,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
    ],
  );
}

/// Error display widget
class AppErrorDisplay extends StatelessWidget {
  const AppErrorDisplay({
    required this.message,
    super.key,
    this.onRetry,
    this.retryText,
  });
  final String message;
  final VoidCallback? onRetry;
  final String? retryText;

  @override
  Widget build(BuildContext context) {
    var theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.all(AppTheme.space4),
      decoration: BoxDecoration(
        color: context.colors.dangerWell,
        borderRadius: AppTheme.radiusXl,
        border: Border.all(color: context.colors.danger),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              // Chip lebih dalam di atas sumur danger agar ikonnya mencolok.
              color: context.colors.danger.withValues(alpha: 0.25),
              borderRadius: AppTheme.radiusLg,
            ),
            child: Icon(
              Icons.error_outline_rounded,
              size: 16,
              color: context.colors.dangerText,
            ),
          ),
          const SizedBox(width: AppTheme.space3),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  message,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: context.colors.dangerText,
                  ),
                ),
                if (onRetry != null) ...[
                  const SizedBox(height: AppTheme.space3),
                  AppTextButton(
                    text: retryText ?? 'Coba Lagi',
                    onPressed: onRetry,
                    style: theme.textTheme.labelMedium?.copyWith(
                      fontWeight: FontWeight.w600,
                      color: context.colors.danger,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Empty state widget
class AppEmptyState extends StatelessWidget {
  const AppEmptyState({
    required this.icon,
    required this.title,
    super.key,
    this.subtitle,
    this.action,
  });
  final IconData icon;
  final String title;
  final String? subtitle;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    var theme = Theme.of(context);

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppTheme.space8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 80,
              height: 80,
              decoration: BoxDecoration(
                color: context.colors.primaryWell,
                borderRadius: AppTheme.radiusFull,
              ),
              child: Icon(
                icon,
                size: 40,
                color: context.colors.primaryWellText,
              ),
            ),
            const SizedBox(height: AppTheme.space6),
            Text(
              title,
              style: theme.textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w700,
                color: context.colors.foreground,
              ),
              textAlign: TextAlign.center,
            ),
            if (subtitle != null) ...[
              const SizedBox(height: AppTheme.space2),
              Text(
                subtitle!,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: context.colors.textMuted,
                ),
                textAlign: TextAlign.center,
              ),
            ],
            if (action != null) ...[
              const SizedBox(height: AppTheme.space6),
              action!,
            ],
          ],
        ),
      ),
    );
  }
}

/// Divider with text
class AppSectionDivider extends StatelessWidget {
  const AppSectionDivider({required this.text, super.key, this.color});
  final String text;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    var theme = Theme.of(context);

    return Row(
      children: [
        Expanded(
          child: Divider(
            color: color ?? context.colors.gray200,
            thickness: 1,
            height: 1,
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppTheme.space4),
          child: Text(
            text,
            style: theme.textTheme.labelSmall?.copyWith(
              color: color ?? context.colors.gray50,
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
        Expanded(
          child: Divider(
            color: color ?? context.colors.gray200,
            thickness: 1,
            height: 1,
          ),
        ),
      ],
    );
  }
}
