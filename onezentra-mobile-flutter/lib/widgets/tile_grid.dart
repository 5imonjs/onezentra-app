import 'package:flutter/material.dart';

/// Grid kartu 2 kolom yang **tinggi kartu mengikuti isi kartu**.
///
/// `GridView` + `childAspectRatio` memaksa tinggi tetap. Begitu skala font
/// sistem membesar (1.3x di ponsel lama) atau label modul lebih panjang,
/// angka di dalam kartu justru terpotong — padahal angka itulah yang paling
/// dibutuhkan operator di lapangan.
///
/// [IntrinsicHeight] menyamakan tinggi kartu dalam satu baris (baris pertama
/// yang paling tinggi menentukan), jadi grid tetap rapi tanpa mengorbankan
/// isi. Semua kartu dalam satu baris juga meregang ke tinggi yang sama lewat
/// `CrossAxisAlignment.stretch`.
class TileGrid extends StatelessWidget {
  const TileGrid({
    super.key,
    required this.tiles,
    this.columns = 2,
    this.spacing = 12,
  });

  final List<Widget> tiles;
  final int columns;
  final double spacing;

  @override
  Widget build(BuildContext context) {
    if (tiles.isEmpty) {
      return const SizedBox.shrink();
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var start = 0; start < tiles.length; start += columns) ...[
          if (start > 0) SizedBox(height: spacing),
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (var slot = 0; slot < columns; slot++) ...[
                  if (slot > 0) SizedBox(width: spacing),
                  // Slot kosong di baris terakhir tetap diberi lebar kolom,
                  // supaya satu kartu sisa baris tidak melar memenuhi baris.
                  Expanded(
                    child: start + slot < tiles.length
                        ? tiles[start + slot]
                        : const SizedBox.shrink(),
                  ),
                ],
              ],
            ),
          ),
        ],
      ],
    );
  }
}
