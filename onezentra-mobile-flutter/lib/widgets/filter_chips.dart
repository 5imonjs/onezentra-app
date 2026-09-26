import 'package:flutter/material.dart';
import 'package:onezentra_mobile/theme/app_colors.dart';

/// Chip filter status — padanan deretan filter di `SearchInput` web
/// (`filters` + `activeFilter`).
///
/// Nilai `null` pada [options] berarti "Semua": tidak dikirim ke backend, jadi
/// daftar tidak perlu memeriksa filter sama sekali. Chip aktif memakai
/// `bg-primary-600` + teks putih seperti `globals.css`.
class StatusFilterChips extends StatelessWidget {
  const StatusFilterChips({
    super.key,
    required this.options,
    required this.active,
    required this.onChanged,
  });

  /// `(nilai, label)` — `null` untuk "Semua".
  final List<(String?, String)> options;
  final String? active;
  final ValueChanged<String?> onChanged;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final (value, label) in options)
          FilterChip(
            label: Text(label),
            selected: active == value,
            showCheckmark: false,
            onSelected: (_) => onChanged(value),
            backgroundColor: AppColors.gray50,
            selectedColor: AppColors.primary600,
            side: BorderSide(
              color: active == value ? AppColors.primary600 : AppColors.gray200,
            ),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(999),
            ),
            labelStyle: TextStyle(
              fontSize: 12.5,
              fontWeight: FontWeight.w700,
              color: active == value ? Colors.white : AppColors.gray700,
            ),
          ),
      ],
    );
  }
}
