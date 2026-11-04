import 'dart:async';

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'package:onezentra_mobile/core/theme/app_theme.dart';
import 'package:onezentra_mobile/features/validation/models/validation_models.dart';
import 'package:onezentra_mobile/features/validation/providers/validation_provider.dart';

/// Satu baris saran hasil pencarian nama di master NPN — menampilkan nama
/// (dan kode) sehingga operator mengetuk pilihan yang benar tanpa membuka
/// keyboard numerik atau memindai apa pun.
class NpnSuggestionTile extends StatelessWidget {
  const NpnSuggestionTile({
    required this.product,
    required this.onTap,
    this.enabled = true,
    super.key,
  });

  final NpnProduct product;
  final VoidCallback onTap;
  final bool enabled;

  @override
  Widget build(BuildContext context) => InkWell(
    onTap: enabled ? onTap : null,
    child: Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: AppTheme.space3,
        vertical: AppTheme.space2,
      ),
      child: Row(
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: AppTheme.primary500.withValues(alpha: 0.12),
              borderRadius: AppTheme.radiusLg,
            ),
            child: const Icon(
              Icons.inventory_2_rounded,
              color: AppTheme.primary500,
              size: 18,
            ),
          ),
          const SizedBox(width: AppTheme.space3),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  product.displayName,
                  style: GoogleFonts.roboto(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: context.colors.foreground,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                if (product.kodeBarang != null)
                  Text(
                    product.kodeBarang!,
                    style: GoogleFonts.robotoMono(
                      fontSize: 11,
                      color: context.colors.textMuted,
                    ),
                  ),
              ],
            ),
          ),
          Icon(
            Icons.chevron_right_rounded,
            size: 18,
            color: context.colors.textSecondary,
          ),
        ],
      ),
    ),
  );
}

class NpnProductPicker extends StatefulWidget {
  const NpnProductPicker({required this.provider, super.key});

  final ValidationProvider provider;

  @override
  State<NpnProductPicker> createState() => _NpnProductPickerState();
}

class _NpnProductPickerState extends State<NpnProductPicker> {
  final _queryController = TextEditingController();
  Timer? _searchDebounce;
  List<NpnProduct> _products = const [];
  bool _searching = false;
  String? _error;
  int _requestId = 0;

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _queryController.dispose();
    super.dispose();
  }

  void _onQueryChanged(String value) {
    _searchDebounce?.cancel();
    var query = value.trim();
    if (query.length < 2) {
      _requestId++;
      setState(() {
        _products = const [];
        _searching = false;
        _error = null;
      });
      return;
    }

    setState(() {
      _searching = true;
      _error = null;
    });
    _searchDebounce = Timer(
      const Duration(milliseconds: 350),
      () => _searchProducts(query),
    );
  }

  Future<void> _searchProducts(String query) async {
    var requestId = ++_requestId;
    var products = await widget.provider.searchProduct(query);
    if (!mounted || requestId != _requestId) {
      return;
    }
    setState(() {
      _products = products;
      _searching = false;
      _error = widget.provider.productSearchError;
    });
  }

  @override
  Widget build(BuildContext context) => Container(
    height: MediaQuery.sizeOf(context).height * 0.72,
    decoration: BoxDecoration(
      color: context.colors.surface,
      borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      border: Border.all(color: context.colors.border),
    ),
    padding: EdgeInsets.only(
      left: AppTheme.space4,
      right: AppTheme.space4,
      top: AppTheme.space4,
      bottom: MediaQuery.viewInsetsOf(context).bottom + AppTheme.space4,
    ),
    child: SafeArea(
      top: false,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Pilih produk dari master NPN',
            style: GoogleFonts.roboto(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: context.colors.foreground,
            ),
          ),
          const SizedBox(height: AppTheme.space2),
          TextField(
            controller: _queryController,
            autofocus: true,
            onChanged: _onQueryChanged,
            decoration: const InputDecoration(
              labelText: 'Nama, kode, atau barcode',
              prefixIcon: Icon(Icons.search_rounded),
              border: OutlineInputBorder(borderRadius: AppTheme.radiusLg),
            ),
          ),
          const SizedBox(height: AppTheme.space3),
          Expanded(
            child: _searching
                ? const Center(child: CircularProgressIndicator())
                : _error != null
                ? Center(
                    child: Text(
                      _error!,
                      textAlign: TextAlign.center,
                      style: TextStyle(color: context.colors.dangerText),
                    ),
                  )
                : _products.isNotEmpty
                ? ListView.separated(
                    itemCount: _products.length,
                    separatorBuilder: (_, _) =>
                        Divider(height: 1, color: context.colors.border),
                    itemBuilder: (context, index) {
                      var product = _products[index];
                      return NpnSuggestionTile(
                        product: product,
                        onTap: () => Navigator.of(context).pop(product),
                      );
                    },
                  )
                : Center(
                    child: Text(
                      _queryController.text.trim().length < 2
                          ? 'Ketik minimal 2 karakter untuk mencari produk.'
                          : 'Produk tidak ditemukan. Coba nama atau kode lain.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: context.colors.textMuted),
                    ),
                  ),
          ),
        ],
      ),
    ),
  );
}
