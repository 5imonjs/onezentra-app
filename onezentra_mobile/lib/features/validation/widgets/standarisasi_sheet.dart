import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

import 'package:onezentra_mobile/core/theme/app_theme.dart';
import 'package:onezentra_mobile/features/validation/models/validation_models.dart';
import 'package:onezentra_mobile/features/validation/providers/validation_provider.dart';
import 'package:onezentra_mobile/shared/widgets/app_widgets.dart';

/// Bottom sheet untuk input standarisasi tumpukan satu produk.
class StandarisasiSheet extends StatefulWidget {
  const StandarisasiSheet({
    required this.item,
    required this.canCreate,
    super.key,
  });
  final SjValidationItem item;
  final bool canCreate;

  @override
  State<StandarisasiSheet> createState() => _StandarisasiSheetState();
}

class _StandarisasiSheetState extends State<StandarisasiSheet> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _tierController = TextEditingController(
    text: '${widget.item.standarisasi?.tier ?? 1}',
  );
  late final TextEditingController _tinggiController = TextEditingController(
    text: '${widget.item.standarisasi?.tinggiTumpukan ?? 1}',
  );
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _tierController.dispose();
    _tinggiController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    var item = widget.item;
    var standarisasi = item.standarisasi;
    var pending = standarisasi?.status == 'pending';

    return Container(
      decoration: BoxDecoration(
        color: context.colors.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        border: Border.all(color: context.colors.gray300),
      ),
      padding: EdgeInsets.only(
        left: AppTheme.space5,
        right: AppTheme.space5,
        top: AppTheme.space4,
        bottom: MediaQuery.of(context).viewInsets.bottom + AppTheme.space5,
      ),
      child: SafeArea(
        top: false,
        child: SingleChildScrollView(
          child: Form(
            key: _formKey,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(
                      color: context.colors.gray300,
                      borderRadius: AppTheme.radiusFull,
                    ),
                  ),
                ),
                const SizedBox(height: AppTheme.space4),
                Row(
                  children: [
                    Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(
                        color: context.colors.warningText.withValues(
                          alpha: 0.12,
                        ),
                        borderRadius: AppTheme.radiusLg,
                      ),
                      child: Icon(
                        Icons.layers_rounded,
                        size: 20,
                        color: context.colors.warningText,
                      ),
                    ),
                    const SizedBox(width: AppTheme.space3),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Standarisasi Tumpukan',
                            style: GoogleFonts.roboto(
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                              color: context.colors.foreground,
                            ),
                          ),
                          Text(
                            item.namaBarang ?? item.kodeBarang ?? 'Produk',
                            style: GoogleFonts.robotoMono(
                              fontSize: 12,
                              color: context.colors.textSecondary,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          if (item.npnId != null)
                            Text(
                              'NPN: #${item.npnId}',
                              style: GoogleFonts.robotoMono(
                                fontSize: 11,
                                color: context.colors.textMuted,
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: AppTheme.space4),
                if (item.npnId == null)
                  _noticeBox(
                    'Produk NPN belum tertaut. Pilih produk dari master NPN '
                    'di Flutter agar petugas dapat mengisi standarisasi tumpukan.',
                    isError: true,
                  )
                else if (pending)
                  _noticeBox(
                    'Sudah dikirim — tier ${standarisasi?.tier ?? '-'} × '
                    'tinggi ${standarisasi?.tinggiTumpukan ?? '-'} '
                    'menunggu approve BLC. Validasi otomatis terbuka '
                    'setelah disetujui.',
                    isError: false,
                  )
                else if (!widget.canCreate)
                  _noticeBox(
                    'Anda tidak memiliki izin standarisasi.create untuk '
                    'mengirim standarisasi. Minta peran yang berwenang.',
                    isError: true,
                  )
                else ...[
                  Text(
                    'Produk ini belum punya standarisasi yang disetujui. '
                    'Isi sekali — dikirim untuk approve BLC.',
                    style: GoogleFonts.roboto(
                      fontSize: 12.5,
                      height: 1.4,
                      color: context.colors.textSecondary,
                    ),
                  ),
                  const SizedBox(height: AppTheme.space4),
                  Row(
                    children: [
                      Expanded(
                        child: AppTextField(
                          key: const ValueKey('standarisasi_tier'),
                          controller: _tierController,
                          label: 'Tier',
                          hint: '1',
                          prefixIcon: Icons.layers_rounded,
                          keyboardType: TextInputType.number,
                          validator: (value) {
                            var tier = int.tryParse((value ?? '').trim());
                            if (tier == null || tier < 1) {
                              return 'Isi tier ≥ 1';
                            }
                            return null;
                          },
                        ),
                      ),
                      const SizedBox(width: AppTheme.space3),
                      Expanded(
                        child: AppTextField(
                          key: const ValueKey('standarisasi_tinggi'),
                          controller: _tinggiController,
                          label: 'Tinggi tumpukan',
                          hint: '1',
                          prefixIcon: Icons.height_rounded,
                          keyboardType: TextInputType.number,
                          validator: (value) {
                            var tinggi = int.tryParse((value ?? '').trim());
                            if (tinggi == null || tinggi < 1) {
                              return 'Isi tinggi ≥ 1';
                            }
                            return null;
                          },
                        ),
                      ),
                    ],
                  ),
                ],
                if (_error != null) ...[
                  const SizedBox(height: AppTheme.space3),
                  _noticeBox(_error!, isError: true),
                ],
                const SizedBox(height: AppTheme.space4),
                if (item.npnId != null && !pending && widget.canCreate)
                  AppPrimaryButton(
                    text: 'Kirim untuk Approve BLC',
                    isLoading: _saving,
                    onPressed: _saving ? null : _save,
                  )
                else
                  AppSecondaryButton(
                    text: 'Tutup',
                    onPressed: () => Navigator.of(context).pop(false),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _noticeBox(String message, {required bool isError}) {
    var background = isError
        ? context.colors.dangerWell
        : context.colors.warningWell;
    var border = isError
        ? context.colors.dangerText
        : context.colors.warningText;
    var textColor = isError
        ? context.colors.dangerText
        : context.colors.warningText;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AppTheme.space3),
      decoration: BoxDecoration(
        color: background,
        borderRadius: AppTheme.radiusLg,
        border: Border.all(color: border),
      ),
      child: Text(
        message,
        style: GoogleFonts.roboto(
          fontSize: 12.5,
          height: 1.4,
          color: textColor,
        ),
      ),
    );
  }

  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false)) {
      return;
    }
    var npnId = widget.item.npnId;
    if (npnId == null) {
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    var provider = context.read<ValidationProvider>();
    var success = await provider.submitStandarisasi(
      npnId: npnId,
      tier: int.parse(_tierController.text.trim()),
      tinggiTumpukan: int.parse(_tinggiController.text.trim()),
    );
    if (!mounted) {
      return;
    }
    if (success) {
      Navigator.of(context).pop(true);
    } else {
      setState(() {
        _saving = false;
        _error =
            provider.message?.message ?? 'Gagal menyimpan. Silakan coba lagi.';
      });
    }
  }
}
