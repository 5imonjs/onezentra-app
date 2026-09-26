import 'package:flutter/material.dart';
import 'package:onezentra_mobile/theme/app_colors.dart';

/// Kartu penegas saat user membuka layar yang tidak diizinkan oleh role-nya.
///
/// Dipakai bersama oleh Check In Point & Validasi Dokumen supaya pesan
/// "tidak punya izin" konsisten di semua menu.
class DeniedCard extends StatelessWidget {
  const DeniedCard({super.key, required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.warningBg,
        border: Border.all(color: AppColors.warningBorder),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(
            Icons.lock_outline,
            size: 20,
            color: AppColors.warningText,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(
                color: AppColors.warningText,
                fontSize: 13.5,
                height: 1.35,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
