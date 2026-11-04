import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'package:onezentra_mobile/core/network/network_status_provider.dart';
import 'package:onezentra_mobile/core/theme/app_theme.dart';

/// Menampilkan banner peringatan di atas seluruh halaman saat perangkat
/// kehilangan koneksi. Child adalah Navigator milik MaterialApp.
class NetworkBannerHost extends StatelessWidget {
  const NetworkBannerHost({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context) => Consumer<NetworkStatusProvider>(
    builder: (context, network, _) {
      if (!network.isOffline) {
        return child;
      }
      return Column(
        children: [
          Material(
            color: context.colors.warning,
            child: SafeArea(
              bottom: false,
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppTheme.space4,
                  vertical: AppTheme.space2,
                ),
                child: Row(
                  children: [
                    const Icon(
                      Icons.wifi_off_rounded,
                      size: 18,
                      color: AppTheme.ink900,
                    ),
                    const SizedBox(width: AppTheme.space2),
                    Expanded(
                      child: Text(
                        'Tidak ada koneksi internet. Periksa Wi-Fi atau data seluler.',
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: AppTheme.ink900,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          Expanded(
            // Banner sudah memakai SafeArea atas; jangan biarkan Scaffold di
            // bawahnya menambahkan padding status bar untuk kedua kalinya.
            child: MediaQuery.removePadding(
              context: context,
              removeTop: true,
              child: child,
            ),
          ),
        ],
      );
    },
  );
}
