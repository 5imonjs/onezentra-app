import 'package:flutter/material.dart';
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
    this.onSaved,
    this.onChanged,
    this.onEditingComplete,
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
  final void Function(String?)? onSaved;
  final void Function(String)? onChanged;
  final void Function()? onEditingComplete;
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
            border: const OutlineInputBorder(
              borderRadius: AppTheme.radiusXl,
              borderSide: BorderSide(color: AppTheme.gray200),
            ),
            enabledBorder: const OutlineInputBorder(
              borderRadius: AppTheme.radiusXl,
              borderSide: BorderSide(color: AppTheme.gray200),
            ),
            focusedBorder: const OutlineInputBorder(
              borderRadius: AppTheme.radiusXl,
              borderSide: BorderSide(color: AppTheme.primary500, width: 2),
            ),
            errorBorder: const OutlineInputBorder(
              borderRadius: AppTheme.radiusXl,
              borderSide: BorderSide(color: AppTheme.danger),
            ),
            focusedErrorBorder: const OutlineInputBorder(
              borderRadius: AppTheme.radiusXl,
              borderSide: BorderSide(color: AppTheme.danger, width: 2),
            ),
            disabledBorder: const OutlineInputBorder(
              borderRadius: AppTheme.radiusXl,
              borderSide: BorderSide(color: AppTheme.gray200),
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
    var card = Container(
      padding: padding ?? const EdgeInsets.all(AppTheme.space6),
      margin: margin,
      decoration: BoxDecoration(
        color: color ?? AppTheme.surfaceCard,
        borderRadius: borderRadius ?? AppTheme.radius2xl,
        border: border ?? Border.all(color: AppTheme.gray300),
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
        backgroundColor = AppTheme.successWell;
        textColor = AppTheme.successText;
        borderColor = AppTheme.success;
        break;
      case AppBadgeVariant.warning:
        backgroundColor = AppTheme.warningWell;
        textColor = AppTheme.warningText;
        borderColor = AppTheme.warning;
        break;
      case AppBadgeVariant.danger:
        backgroundColor = AppTheme.dangerWell;
        textColor = AppTheme.dangerText;
        borderColor = AppTheme.danger;
        break;
      case AppBadgeVariant.info:
        backgroundColor = AppTheme.infoWell;
        textColor = AppTheme.infoText;
        borderColor = AppTheme.info;
        break;
      case AppBadgeVariant.primary:
        backgroundColor = AppTheme.primary950;
        textColor = AppTheme.primary200;
        borderColor = AppTheme.primary700;
        break;
      case AppBadgeVariant.gray:
        backgroundColor = AppTheme.gray200;
        textColor = AppTheme.gray700;
        borderColor = AppTheme.gray300;
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
              decoration: const BoxDecoration(
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
                      style: Theme.of(
                        context,
                      ).textTheme.bodyMedium?.copyWith(color: AppTheme.gray600),
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
        color: AppTheme.dangerWell,
        borderRadius: AppTheme.radiusXl,
        border: Border.all(color: AppTheme.danger),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: const BoxDecoration(
              color: Color(0xFF450A0F),
              borderRadius: AppTheme.radiusLg,
            ),
            child: const Icon(
              Icons.error_outline_rounded,
              size: 16,
              color: AppTheme.dangerText,
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
                    color: AppTheme.dangerText,
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
              decoration: const BoxDecoration(
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
