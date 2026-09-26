import 'package:flutter/material.dart';

/// Permukaan yang bisa ditekan: ripple Material + scale halus saat ditekan.
///
/// Web memberi umpan balik `hover:-translate-y-0.5` + `transition` pada kartu
/// (`card-hover` di `globals.css`); di layar sentuh bentuk alurnya dibalik —
/// kartu ditekan sedikit lalu kembali, plus ripple di permukaan yang ditekuk.
///
/// Skala **dilewati** bila pengguna mengaktifkan "reduce motion"
/// (`MediaQuery.disableAnimations`) atau OS sedang dalam keadaan transisi —
/// umpan balik tekan tetap ada lewat ripple, jadi tidak ada konsekuensi
/// fungsional.
class Pressable extends StatefulWidget {
  const Pressable({
    super.key,
    required this.child,
    required this.onTap,
    this.color = Colors.white,
    this.borderRadius = BorderRadius.zero,
    this.border = BorderSide.none,
    this.pressedScale = 0.97,
    this.semanticLabel,
    this.enabled = true,
  });

  final Widget child;
  final VoidCallback onTap;
  final Color color;
  final BorderRadius borderRadius;
  final BorderSide border;

  /// Seberapa mengecil kartu saat ditekan (1 = tidak bergerak).
  final double pressedScale;

  /// Label yang dibaca screen reader sebagai pengganti isi visual.
  final String? semanticLabel;
  final bool enabled;

  @override
  State<Pressable> createState() => _PressableState();
}

class _PressableState extends State<Pressable> {
  bool _pressed = false;

  void _setPressed(bool value) {
    if (_pressed == value) {
      return;
    }
    setState(() => _pressed = value);
  }

  @override
  Widget build(BuildContext context) {
    final reduceMotion = MediaQuery.disableAnimationsOf(context);
    final shape = RoundedRectangleBorder(
      borderRadius: widget.borderRadius,
      side: widget.border,
    );
    final content = widget.child;
    final scaled = (!reduceMotion && _pressed && widget.enabled)
        ? AnimatedScale(
            scale: widget.pressedScale,
            duration: const Duration(milliseconds: 120),
            curve: Curves.easeOut,
            child: content,
          )
        : content;

    return Semantics(
      button: true,
      enabled: widget.enabled,
      label: widget.semanticLabel,
      // Kalau ada [semanticLabel], label itu *menggantikan* seluruh teks anak,
      // bukan menambahkannya. Tanpa ini screen reader membaca ringkasan lalu
      // mengulang isi kartu persis sama dalam satu perubahan fokus — dua kali
      // kerja untuk mata yang sudah lelah. Kartu tanpa label tetap membaca
      // semua isinya seperti biasa.
      excludeSemantics: widget.semanticLabel != null,
      child: Material(
        color: widget.color,
        shape: shape,
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: widget.enabled ? widget.onTap : null,
          onTapDown: widget.enabled ? (_) => _setPressed(true) : null,
          onTapUp: widget.enabled ? (_) => _setPressed(false) : null,
          onTapCancel: widget.enabled ? () => _setPressed(false) : null,
          child: scaled,
        ),
      ),
    );
  }
}
