import 'package:flutter/material.dart';
import 'package:onezentra_mobile/core/theme/app_theme.dart';

/// Custom text field matching the web app's input-field style
class AppTextField extends StatelessWidget {
  final TextEditingController? controller;
  final String? label;
  final String? hint;
  final IconData? prefixIcon;
  final Widget? suffixIcon;
  final bool obscureText;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final String? Function(String?)? validator;
  final void Function(String?)? onSaved;
  final void Function(String)? onChanged;
  final void Function()? onEditingComplete;
  final bool enabled;
  final int? maxLines;
  final int? maxLength;
  final FocusNode? focusNode;
  final bool autofocus;

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
    this.onSaved,
    this.onChanged,
    this.onEditingComplete,
    this.enabled = true,
    this.maxLines = 1,
    this.maxLength,
    this.focusNode,
    this.autofocus = false,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (label != null) ...[
          Text(
            label!,
            style: theme.textTheme.labelLarge?.copyWith(
              fontWeight: FontWeight.w600,
              color: AppTheme.gray700,
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
          onSaved: onSaved,
          onChanged: onChanged,
          onEditingComplete: onEditingComplete,
          enabled: enabled,
          maxLines: maxLines,
          maxLength: maxLength,
          focusNode: focusNode,
          autofocus: autofocus,
          style: theme.textTheme.bodyMedium?.copyWith(
            color: AppTheme.foreground,
          ),
          decoration: InputDecoration(
            hintText: hint,
            prefixIcon: prefixIcon != null
                ? Icon(prefixIcon, size: 20, color: AppTheme.gray400)
                : null,
            suffixIcon: suffixIcon,
            counterText: '',
            filled: true,
            fillColor: AppTheme.surfaceCard,
            contentPadding: const EdgeInsets.symmetric(
              horizontal: AppTheme.space4,
              vertical: AppTheme.space3,
            ),
            border: OutlineInputBorder(
              borderRadius: AppTheme.radiusXl,
              borderSide: const BorderSide(color: AppTheme.gray200, width: 1),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: AppTheme.radiusXl,
              borderSide: const BorderSide(color: AppTheme.gray200, width: 1),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: AppTheme.radiusXl,
              borderSide: const BorderSide(
                color: AppTheme.primary500,
                width: 2,
              ),
            ),
            errorBorder: OutlineInputBorder(
              borderRadius: AppTheme.radiusXl,
              borderSide: const BorderSide(color: AppTheme.danger, width: 1),
            ),
            focusedErrorBorder: OutlineInputBorder(
              borderRadius: AppTheme.radiusXl,
              borderSide: const BorderSide(color: AppTheme.danger, width: 2),
            ),
            disabledBorder: OutlineInputBorder(
              borderRadius: AppTheme.radiusXl,
              borderSide: const BorderSide(color: AppTheme.gray200, width: 1),
            ),
            labelStyle: theme.textTheme.bodyMedium?.copyWith(
              color: AppTheme.gray600,
            ),
            hintStyle: theme.textTheme.bodyMedium?.copyWith(
              color: AppTheme.gray400,
            ),
            errorStyle: theme.textTheme.bodySmall?.copyWith(
              color: AppTheme.danger,
            ),
            floatingLabelBehavior: FloatingLabelBehavior.auto,
            prefixIconColor: AppTheme.gray400,
            suffixIconColor: AppTheme.gray400,
          ),
        ),
      ],
    );
  }
}

/// Primary button matching the web app's btn-primary style
class AppPrimaryButton extends StatelessWidget {
  final String text;
  final VoidCallback? onPressed;
  final bool isLoading;
  final bool isFullWidth;
  final double? width;
  final double height;
  final IconData? leadingIcon;
  final IconData? trailingIcon;

  const AppPrimaryButton({
    super.key,
    required this.text,
    this.onPressed,
    this.isLoading = false,
    this.isFullWidth = true,
    this.width,
    this.height = 52,
    this.leadingIcon,
    this.trailingIcon,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    final button = ElevatedButton(
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
                Text(text),
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
  final String text;
  final VoidCallback? onPressed;
  final bool isLoading;
  final bool isFullWidth;
  final double? width;
  final double height;
  final IconData? leadingIcon;
  final IconData? trailingIcon;

  const AppSecondaryButton({
    super.key,
    required this.text,
    this.onPressed,
    this.isLoading = false,
    this.isFullWidth = true,
    this.width,
    this.height = 52,
    this.leadingIcon,
    this.trailingIcon,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    final button = OutlinedButton(
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
                Text(text),
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
  final String text;
  final VoidCallback? onPressed;
  final TextStyle? style;

  const AppTextButton({
    super.key,
    required this.text,
    this.onPressed,
    this.style,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

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
  final Widget child;
  final EdgeInsetsGeometry? padding;
  final EdgeInsetsGeometry? margin;
  final Color? color;
  final List<BoxShadow>? shadows;
  final BorderRadius? borderRadius;
  final Border? border;
  final VoidCallback? onTap;

  const AppCard({
    super.key,
    required this.child,
    this.padding,
    this.margin,
    this.color,
    this.shadows,
    this.borderRadius,
    this.border,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final card = Container(
      padding: padding ?? const EdgeInsets.all(AppTheme.space6),
      margin: margin,
      decoration: BoxDecoration(
        color: color ?? AppTheme.surfaceCard,
        borderRadius: borderRadius ?? AppTheme.radius2xl,
        border: border ?? Border.all(color: AppTheme.gray100, width: 1),
        boxShadow:
            shadows ??
            [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.05),
                offset: const Offset(0, 1),
                blurRadius: 3,
              ),
            ],
      ),
      child: child,
    );

    if (onTap != null) {
      return Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: borderRadius ?? AppTheme.radius2xl,
          child: card,
        ),
      );
    }

    return card;
  }
}

/// Badge widget matching the web app's badge style
class AppBadge extends StatelessWidget {
  final String text;
  final AppBadgeVariant variant;
  final IconData? icon;

  const AppBadge({
    super.key,
    required this.text,
    this.variant = AppBadgeVariant.info,
    this.icon,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    Color backgroundColor;
    Color textColor;
    Color borderColor;

    switch (variant) {
      case AppBadgeVariant.success:
        backgroundColor = const Color(0xFFECFDF5); // emerald-50
        textColor = const Color(0xFF047857); // emerald-700
        borderColor = const Color(0xFFA7F3D0); // emerald-200
        break;
      case AppBadgeVariant.warning:
        backgroundColor = const Color(0xFFFFFBE6); // amber-50
        textColor = const Color(0xFFB45309); // amber-700
        borderColor = const Color(0xFFFDE68A); // amber-200
        break;
      case AppBadgeVariant.danger:
        backgroundColor = const Color(0xFFFEF2F2); // red-50
        textColor = const Color(0xFFB91C1C); // red-700
        borderColor = const Color(0xFFFECACA); // red-200
        break;
      case AppBadgeVariant.info:
        backgroundColor = const Color(0xFFEFF6FF); // blue-50
        textColor = const Color(0xFF1D4ED8); // blue-700
        borderColor = const Color(0xFFBFDBFE); // blue-200
        break;
      case AppBadgeVariant.primary:
        backgroundColor = AppTheme.primary50;
        textColor = AppTheme.primary700;
        borderColor = AppTheme.primary200;
        break;
      case AppBadgeVariant.gray:
        backgroundColor = AppTheme.gray100;
        textColor = AppTheme.gray700;
        borderColor = AppTheme.gray200;
        break;
    }

    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppTheme.space3,
        vertical: AppTheme.space1,
      ),
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: AppTheme.radiusFull,
        border: Border.all(color: borderColor, width: 1),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 12, color: textColor),
            const SizedBox(width: AppTheme.space1),
          ],
          Text(
            text,
            style: theme.textTheme.labelSmall?.copyWith(
              fontWeight: FontWeight.w600,
              color: textColor,
            ),
          ),
        ],
      ),
    );
  }
}

enum AppBadgeVariant { success, warning, danger, info, primary, gray }

/// Loading overlay
class AppLoadingOverlay extends StatelessWidget {
  final bool isLoading;
  final Widget child;
  final String? message;

  const AppLoadingOverlay({
    super.key,
    required this.isLoading,
    required this.child,
    this.message,
  });

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        child,
        if (isLoading)
          Container(
            color: Colors.black.withValues(alpha: 0.3),
            child: Center(
              child: Container(
                padding: const EdgeInsets.all(AppTheme.space6),
                decoration: BoxDecoration(
                  color: AppTheme.surfaceCard,
                  borderRadius: AppTheme.radiusXl,
                  boxShadow: [AppTheme.shadowXl],
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
                          color: AppTheme.gray600,
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
}

/// Error display widget
class AppErrorDisplay extends StatelessWidget {
  final String message;
  final VoidCallback? onRetry;
  final String? retryText;

  const AppErrorDisplay({
    super.key,
    required this.message,
    this.onRetry,
    this.retryText,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.all(AppTheme.space4),
      decoration: BoxDecoration(
        color: const Color(0xFFFEF2F2), // red-50
        borderRadius: AppTheme.radiusXl,
        border: Border.all(color: const Color(0xFFFECACA), width: 1), // red-200
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: const Color(0xFFFEE2E2), // red-100
              borderRadius: AppTheme.radiusLg,
            ),
            child: const Icon(
              Icons.error_outline_rounded,
              size: 16,
              color: AppTheme.danger,
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
                    color: const Color(0xFFDC2626), // red-600
                  ),
                ),
                if (onRetry != null) ...[
                  const SizedBox(height: AppTheme.space3),
                  AppTextButton(
                    text: retryText ?? 'Coba Lagi',
                    onPressed: onRetry,
                    style: theme.textTheme.labelMedium?.copyWith(
                      fontWeight: FontWeight.w600,
                      color: AppTheme.danger,
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
  final IconData icon;
  final String title;
  final String? subtitle;
  final Widget? action;

  const AppEmptyState({
    super.key,
    required this.icon,
    required this.title,
    this.subtitle,
    this.action,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

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
                color: AppTheme.primary50,
                borderRadius: AppTheme.radiusFull,
              ),
              child: Icon(icon, size: 40, color: AppTheme.primary600),
            ),
            const SizedBox(height: AppTheme.space6),
            Text(
              title,
              style: theme.textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w700,
                color: AppTheme.foreground,
              ),
              textAlign: TextAlign.center,
            ),
            if (subtitle != null) ...[
              const SizedBox(height: AppTheme.space2),
              Text(
                subtitle!,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: AppTheme.gray500,
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
  final String text;
  final Color? color;

  const AppSectionDivider({super.key, required this.text, this.color});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Row(
      children: [
        Expanded(
          child: Divider(
            color: color ?? AppTheme.gray200,
            thickness: 1,
            height: 1,
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppTheme.space4),
          child: Text(
            text,
            style: theme.textTheme.labelSmall?.copyWith(
              color: color ?? AppTheme.gray500,
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
        Expanded(
          child: Divider(
            color: color ?? AppTheme.gray200,
            thickness: 1,
            height: 1,
          ),
        ),
      ],
    );
  }
}
