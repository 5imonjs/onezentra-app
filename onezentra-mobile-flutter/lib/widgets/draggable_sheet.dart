import 'package:flutter/material.dart';
import 'package:onezentra_mobile/theme/app_colors.dart';

/// Bottom sheet bergaya "drag handle" berisi form panjang.
///
/// Dipakai dua layar yang butuh isian banyak (validasi item, standarisasi
/// tumpukan): sheet menentukan tingginya terhadap layar, isinya menggulir, dan
/// keyboard tetap mengangkat seluruh isi lewat [MediaQuery.viewInsetsOf] — tanpa
/// tiga hal itu form panjang akan tertutup keyboard di perangkat kecil.
class DraggableSheet extends StatelessWidget {
  const DraggableSheet({
    super.key,
    required this.children,
    this.initialChildSize = 0.85,
    this.maxChildSize = 0.95,
    this.minChildSize = 0.5,
    this.padding = const EdgeInsets.fromLTRB(20, 16, 20, 24),
  });

  /// Isi sheet, disusun vertikal di dalam satu `ListView`.
  final List<Widget> children;

  final double initialChildSize;
  final double maxChildSize;
  final double minChildSize;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: DraggableScrollableSheet(
        expand: false,
        initialChildSize: initialChildSize,
        maxChildSize: maxChildSize,
        minChildSize: minChildSize,
        builder: (context, scrollController) => Column(
          children: [
            const SizedBox(height: 8),
            Container(
              width: 44,
              height: 4,
              decoration: BoxDecoration(
                color: AppColors.gray300,
                borderRadius: BorderRadius.circular(999),
              ),
            ),
            Expanded(
              child: ListView(
                controller: scrollController,
                padding: padding,
                children: children,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
