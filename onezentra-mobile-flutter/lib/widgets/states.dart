import 'package:flutter/material.dart';
import 'package:onezentra_mobile/theme/app_colors.dart';

/// Keadaan "belum ada apa-apa" — dipakai saat daftar/riwayat kosong.
///
/// Web hanya menampilkan teks; mobile memberi ikon + konteks + aksi supaya
/// operator tahu apa yang harus dilakukan berikutnya, bukan hanya bahwa data
/// tidak ada.
class EmptyState extends StatelessWidget {
  const EmptyState({
    super.key,
    required this.title,
    this.message,
    this.icon = Icons.inbox_outlined,
    this.action,
  });

  final String title;
  final String? message;
  final IconData icon;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 28, 20, 28),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 52,
            height: 52,
            decoration: const BoxDecoration(
              color: AppColors.gray100,
              shape: BoxShape.circle,
            ),
            alignment: Alignment.center,
            child: Icon(icon, size: 24, color: AppColors.gray400),
          ),
          const SizedBox(height: 12),
          Text(
            title,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 14.5,
              fontWeight: FontWeight.w700,
              color: AppColors.gray700,
            ),
          ),
          if (message != null) ...[
            const SizedBox(height: 4),
            Text(
              message!,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 13,
                height: 1.4,
                color: AppColors.gray500,
              ),
            ),
          ],
          if (action != null) ...[const SizedBox(height: 14), action!],
        ],
      ),
    );
  }
}

/// Nada pesan — menentukan latar, border, dan teks sekaligus supaya pasangan
/// warnanya tidak bisa terbalik di satu widget (pola yang sama dengan
/// nada pill di `status_pill.dart`).
enum MessageTone { success, warning, error, info, neutral }

extension MessageToneColors on MessageTone {
  /// (latar, border, teks)
  (Color, Color, Color) get colors => switch (this) {
    MessageTone.success => (
      AppColors.successBg,
      AppColors.successBorder,
      AppColors.success,
    ),
    MessageTone.warning => (
      AppColors.warningBg,
      AppColors.warningBorder,
      AppColors.warningText,
    ),
    MessageTone.error => (
      AppColors.errorBg,
      AppColors.errorBorder,
      AppColors.errorText,
    ),
    MessageTone.info => (
      AppColors.primary50,
      AppColors.primary200,
      AppColors.primary800,
    ),
    MessageTone.neutral => (
      AppColors.gray50,
      AppColors.gray200,
      AppColors.gray600,
    ),
  };
}

/// Kartu pesan satu nada — hasil aksi, error server, atau catatan.
class MessageCard extends StatelessWidget {
  const MessageCard({
    super.key,
    required this.message,
    this.tone = MessageTone.info,
    this.icon,
    this.trailing,
    this.liveRegion = true,
  });

  final String message;
  final MessageTone tone;

  /// Ikonstatus di kiri; tanpa ini pesan tampil polos seperti blok warna
  /// di web.
  final IconData? icon;

  /// Aksi kecil di kanan (mis. "Coba lagi").
  final Widget? trailing;

  /// Pesan hasil aksi muncul tiba-tiba di mata operator yang sedang memindai —
  /// ditandai live region supaya screen reader membacanya tanpa harus menebak
  /// apa yang berubah.
  final bool liveRegion;

  @override
  Widget build(BuildContext context) {
    final (background, border, foreground) = tone.colors;
    final card = Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: background,
        border: Border.all(color: border),
        borderRadius: BorderRadius.circular(AppRadius.chip),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 18, color: foreground),
            const SizedBox(width: 8),
          ],
          Expanded(
            child: Text(
              message,
              style: TextStyle(
                color: foreground,
                fontSize: 13,
                height: 1.35,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          if (trailing != null) ...[const SizedBox(width: 4), trailing!],
        ],
      ),
    );
    if (!liveRegion) {
      return card;
    }
    return Semantics(liveRegion: true, child: card);
  }
}

/// Kartu error dengan aksi coba lagi — padanan blok merah `Coba lagi` di web
/// (`PendingActions`, `validasi-sj`).
class ErrorCard extends StatelessWidget {
  const ErrorCard({
    super.key,
    required this.message,
    this.onRetry,
    this.retryLabel = 'Coba lagi',
  });

  final String message;
  final VoidCallback? onRetry;
  final String retryLabel;

  @override
  Widget build(BuildContext context) {
    return MessageCard(
      message: message,
      tone: MessageTone.error,
      icon: Icons.error_outline,
      // Kegagalan memuat biasanya menyusul aksi pengguna (tarik-torefresh,
      // ganti filter) dan tidak memindahkan fokus ke mana pun — tanpa live
      // region, pengguna screen reader menekan ulang dan melihat daftar
      // kosong tanpa tahu bahwa pemuatannya yang gagal.
      liveRegion: true,
      trailing: onRetry == null
          ? null
          : TextButton(
              onPressed: onRetry,
              style: TextButton.styleFrom(
                foregroundColor: AppColors.errorText,
                minimumSize: const Size(0, 32),
                padding: const EdgeInsets.symmetric(horizontal: 8),
              ),
              child: Text(
                retryLabel,
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
            ),
    );
  }
}

/// Placeholder kotak yang berdenyut saat data dimuat — padanan `animate-pulse`
/// di web. Animasi dilewati bila pengguna mengaktifkan "reduce motion".
class SkeletonBox extends StatefulWidget {
  const SkeletonBox({
    super.key,
    this.width,
    this.height = 16,
    this.radius = 10,
  });

  final double? width;
  final double height;
  final double radius;

  @override
  State<SkeletonBox> createState() => _SkeletonBoxState();
}

class _SkeletonBoxState extends State<SkeletonBox>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final reduceMotion = MediaQuery.disableAnimationsOf(context);
    if (reduceMotion) {
      return Container(
        width: widget.width,
        height: widget.height,
        decoration: BoxDecoration(
          color: AppColors.gray100,
          borderRadius: BorderRadius.circular(widget.radius),
        ),
      );
    }
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) {
        return Container(
          width: widget.width,
          height: widget.height,
          decoration: BoxDecoration(
            color: Color.lerp(
              AppColors.gray100,
              AppColors.gray200,
              _controller.value,
            ),
            borderRadius: BorderRadius.circular(widget.radius),
          ),
        );
      },
    );
  }
}

/// Deretan [SkeletonBox] untuk menggantikan spinner telanjang saat daftar
/// sedang dimuat.
class SkeletonList extends StatelessWidget {
  const SkeletonList({super.key, this.rows = 3});

  final int rows;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (var i = 0; i < rows; i++) ...[
          const SkeletonBox(height: 14, width: 120),
          const SizedBox(height: 10),
          const SkeletonBox(height: 12),
          if (i < rows - 1) const SizedBox(height: 18),
        ],
      ],
    );
  }
}

/// Placeholder satu kartu statistik saat total belum dimuat.
class SkeletonStatTile extends StatelessWidget {
  const SkeletonStatTile({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(AppRadius.panel),
        border: Border.all(color: AppColors.gray200),
      ),
      child: const Row(
        children: [
          SkeletonBox(width: 36, height: 36, radius: AppRadius.chip),
          SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SkeletonBox(width: 34, height: 18),
                SizedBox(height: 6),
                SkeletonBox(width: 60, height: 10),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
