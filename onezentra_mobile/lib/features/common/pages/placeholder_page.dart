import 'package:flutter/material.dart';

import 'package:onezentra_mobile/core/theme/app_theme.dart';
import 'package:onezentra_mobile/shared/widgets/app_widgets.dart';

/// Placeholder Page for modules not yet implemented
class PlaceholderPage extends StatelessWidget {

  const PlaceholderPage({
    required this.title, required this.icon, super.key,
    this.color,
  });
  final String title;
  final IconData icon;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    var theme = Theme.of(context);
    var accentColor = color ?? AppTheme.primary600;

    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        title: Text(title),
        elevation: 0,
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(AppTheme.space8),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 120,
                height: 120,
                decoration: BoxDecoration(
                  color: accentColor.withValues(alpha: 0.15),
                  borderRadius: AppTheme.radiusFull,
                ),
                child: Icon(
                  icon,
                  size: 60,
                  color: accentColor,
                ),
              ),
              const SizedBox(height: AppTheme.space8),
              Text(
                title,
                style: theme.textTheme.displaySmall?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: AppTheme.foreground,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: AppTheme.space3),
              Text(
                'Modul ini sedang dalam pengembangan',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: AppTheme.gray500,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: AppTheme.space3),
              Text(
                'Fitur akan segera tersedia di update mendatang',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: AppTheme.gray400,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: AppTheme.space8),
              AppSecondaryButton(
                text: 'Kembali ke Dashboard',
                onPressed: () => Navigator.of(context).popUntil((route) => route.isFirst),
                isFullWidth: false,
                leadingIcon: Icons.arrow_back_rounded,
              ),
            ],
          ),
        ),
      ),
    );
  }
}