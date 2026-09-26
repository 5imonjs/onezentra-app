import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:onezentra_mobile/theme/app_colors.dart';
import 'package:onezentra_mobile/widgets/page_header.dart';
import 'package:onezentra_mobile/widgets/pressable.dart';
import 'package:onezentra_mobile/widgets/section_card.dart';
import 'package:onezentra_mobile/widgets/states.dart';
import 'package:onezentra_mobile/widgets/stat_tile.dart';
import 'package:onezentra_mobile/widgets/status_pill.dart';
import 'package:onezentra_mobile/widgets/tile_grid.dart';

Widget host(Widget child, {bool reduceMotion = false}) {
  return MaterialApp(
    home: MediaQuery(
      data: MediaQueryData(disableAnimations: reduceMotion),
      child: Scaffold(body: SingleChildScrollView(child: child)),
    ),
  );
}

/// Aksi kosong untuk widget yang hanya diam-diam diuji (mis. pengujian
/// semantics), bukan untuk menguji perilaku ketukan.
void _noopTap() {}

void main() {
  group('Pressable', () {
    testWidgets('menjalankan aksi saat diketuk', (tester) async {
      var taps = 0;
      await tester.pumpWidget(
        host(Pressable(onTap: () => taps++, child: const Text('Ketuk'))),
      );

      await tester.tap(find.text('Ketuk'));
      await tester.pump();

      expect(taps, 1);
    });

    testWidgets('tidak bereaksi saat nonaktif', (tester) async {
      var taps = 0;
      await tester.pumpWidget(
        host(
          Pressable(
            onTap: () => taps++,
            enabled: false,
            child: const Text('x'),
          ),
        ),
      );

      await tester.tap(find.text('x'));
      await tester.pump();

      expect(taps, 0);
    });

    testWidgets('reduce motion tidak memicu error tanpa animasi', (
      tester,
    ) async {
      await tester.pumpWidget(
        host(
          Pressable(onTap: () {}, child: const Text('x')),
          reduceMotion: true,
        ),
      );
      await tester.tap(find.text('x'));
      await tester.pump();

      expect(tester.takeException(), isNull);
    });

    testWidgets('semanticLabel menggantikan, bukan menambah, teks anak', (
      tester,
    ) async {
      await tester.pumpWidget(
        host(
          Pressable(
            onTap: () {},
            semanticLabel: 'Beras Premium, belum diperiksa',
            child: const Text('BRG-1'),
          ),
        ),
      );

      final semantics = tester.getSemantics(find.byType(Pressable));
      expect(semantics.label, 'Beras Premium, belum diperiksa');
      expect(
        semantics.label,
        isNot(contains('BRG-1')),
        reason:
            'membaca ringkasan lalu mengulang isi anak di perubahan fokus yang '
            'sama adalah dua kali pekerjaan tanpa nilai tambah',
      );
    });

    testWidgets('tanpa semanticLabel seluruh isi kartu tetap terbaca', (
      tester,
    ) async {
      await tester.pumpWidget(
        host(const Pressable(onTap: _noopTap, child: Text('BRG-1'))),
      );

      expect(tester.getSemantics(find.byType(Pressable)).label, 'BRG-1');
    });
  });

  group('SectionCard', () {
    testWidgets('kartu yang bisa diketuk memanggil aksi', (tester) async {
      var taps = 0;
      await tester.pumpWidget(
        host(SectionCard(onTap: () => taps++, child: const Text('Isi'))),
      );

      await tester.tap(find.text('Isi'));
      await tester.pump();

      expect(taps, 1);
    });

    testWidgets('kartu biasa tidak punya aksi', (tester) async {
      await tester.pumpWidget(host(const SectionCard(child: Text('Isi'))));

      await tester.tap(find.text('Isi'));
      await tester.pump();

      expect(tester.takeException(), isNull);
    });
  });

  group('StatTile', () {
    testWidgets('angka, label uppercase, dan tren ditampilkan', (tester) async {
      await tester.pumpWidget(
        host(
          const StatTile(
            label: 'Check In Point',
            icon: Icons.location_on_outlined,
            tone: ModuleTone.sky,
            value: 12345,
            delta: 7,
          ),
        ),
      );

      expect(
        find.text('12.345'),
        findsOneWidget,
        reason: 'angka memakai pemisah ribuan gaya Indonesia',
      );
      expect(find.text('CHECK IN POINT'), findsOneWidget);
      expect(find.text('+7 minggu ini'), findsOneWidget);
    });

    testWidgets('failed menampilkan "–" dengan border peringatan', (
      tester,
    ) async {
      await tester.pumpWidget(
        host(
          const StatTile(
            label: 'Gate',
            icon: Icons.location_on_outlined,
            tone: ModuleTone.sky,
            value: 9,
            state: StatState.failed,
          ),
        ),
      );

      expect(find.text('–'), findsOneWidget);
      expect(
        find.text('9'),
        findsNothing,
        reason: 'angka lama tidak boleh tampil seolah-olah valid',
      );
    });

    testWidgets('loading menampilkan "…" tanpa tren', (tester) async {
      await tester.pumpWidget(
        host(
          const StatTile(
            label: 'Gate',
            icon: Icons.location_on_outlined,
            tone: ModuleTone.sky,
            value: 9,
            delta: 3,
            state: StatState.loading,
          ),
        ),
      );

      expect(find.text('…'), findsOneWidget);
      expect(find.text('+3 minggu ini'), findsNothing);
    });

    testWidgets('nilai 0 diredupkan dan tidak menampilkan tren', (
      tester,
    ) async {
      await tester.pumpWidget(
        host(
          const StatTile(
            label: 'Gate',
            icon: Icons.location_on_outlined,
            tone: ModuleTone.sky,
            value: 0,
          ),
        ),
      );

      final value = tester.widget<Text>(find.text('0'));
      expect(value.style?.color, AppColors.gray300);
    });

    testWidgets('kartu peringatan menampilkan baris keterangan', (
      tester,
    ) async {
      await tester.pumpWidget(
        host(
          const StatTile(
            label: 'Kritis / Kedaluwarsa',
            icon: Icons.warning_amber_rounded,
            tone: ModuleTone.danger,
            valueText: '12',
            hint: '3 kritis perlu tindakan',
          ),
        ),
      );

      expect(find.text('12'), findsOneWidget);
      expect(find.text('3 kritis perlu tindakan'), findsOneWidget);
      // Nilai peringatan boleh berupa teks, bukan bilangan.
      expect(find.textContaining('jam'), findsNothing);
    });
  });

  group('StatusPill', () {
    testWidgets('menampilkan label dan titik status', (tester) async {
      await tester.pumpWidget(
        host(
          const StatusPill(label: 'SCHEDULED', tone: PillTone.info, dot: true),
        ),
      );

      expect(find.text('SCHEDULED'), findsOneWidget);
      expect(find.byType(StatusPill), findsOneWidget);
    });

    test('nada punya pasangan warna latar & teks', () {
      for (final tone in PillTone.values) {
        expect(
          tone.background,
          isNot(tone.foreground),
          reason: '$tone harus kontras dengan latar sendiri',
        );
      }
    });
  });

  group('Status', () {
    testWidgets('empty state menampilkan judul, pesan, dan aksi', (
      tester,
    ) async {
      await tester.pumpWidget(
        host(
          EmptyState(
            title: 'Belum ada dokumen',
            message: 'Scan PO untuk mulai',
            action: TextButton(onPressed: () {}, child: const Text('Scan')),
          ),
        ),
      );

      expect(find.text('Belum ada dokumen'), findsOneWidget);
      expect(find.text('Scan PO untuk mulai'), findsOneWidget);
      expect(find.text('Scan'), findsOneWidget);
    });

    testWidgets('error card menjalankan coba lagi', (tester) async {
      var retries = 0;
      await tester.pumpWidget(
        host(ErrorCard(message: 'Gagal memuat', onRetry: () => retries++)),
      );

      expect(find.text('Gagal memuat'), findsOneWidget);
      await tester.tap(find.text('Coba lagi'));
      await tester.pump();

      expect(retries, 1);
    });

    testWidgets('error card tanpa aksi tidak menampilkan tombol', (
      tester,
    ) async {
      await tester.pumpWidget(host(const ErrorCard(message: 'Gagal')));

      expect(find.text('Coba lagi'), findsNothing);
    });

    testWidgets('skeleton berdenyut dan berhenti saat reduce motion', (
      tester,
    ) async {
      await tester.pumpWidget(
        host(const SkeletonBox(width: 40, height: 12), reduceMotion: true),
      );
      expect(tester.takeException(), isNull);

      await tester.pumpWidget(host(const SkeletonBox(width: 40, height: 12)));
      await tester.pump(const Duration(milliseconds: 400));
      expect(tester.takeException(), isNull);
    });

    testWidgets('skeleton statistik mengisi satu kartu penuh', (tester) async {
      await tester.pumpWidget(host(const SkeletonStatTile()));

      expect(find.byType(SkeletonBox), findsNWidgets(3));
    });

    testWidgets('message card menampilkan pesan sesuai nadanya', (
      tester,
    ) async {
      await tester.pumpWidget(
        host(
          const MessageCard(
            message: 'Gate IN tersimpan',
            tone: MessageTone.success,
            icon: Icons.check_circle_outline,
          ),
        ),
      );

      expect(find.text('Gate IN tersimpan'), findsOneWidget);
      expect(find.byIcon(Icons.check_circle_outline), findsOneWidget);
      // Pesan hasil aksimuncul tiba-tiba saat operator sedang memindai, jadi
      // harus diumumkan screen reader, bukan hanya terlihat.
      expect(
        find.byWidgetPredicate(
          (w) => w is Semantics && w.properties.liveRegion == true,
        ),
        findsOneWidget,
      );
    });

    test('nada pesan punya latar, border, dan teks yang berbeda', () {
      for (final tone in MessageTone.values) {
        final (background, border, foreground) = tone.colors;
        expect(
          background,
          isNot(border),
          reason: '$tone border harus terlihat',
        );
        expect(
          background,
          isNot(foreground),
          reason: '$tone teks harus kontras dengan latar sendiri',
        );
      }
    });
  });

  group('PageHeader', () {
    testWidgets('judul, aksen, subjudul, dan chip info tampil', (tester) async {
      await tester.pumpWidget(
        host(
          const PageHeader(
            title: 'Selamat pagi,',
            accent: 'Budi Santoso',
            subtitle: 'Sabtu, 26 September 2026',
            icon: Icons.warehouse_outlined,
            iconSolid: true,
            chips: [
              HeaderChip(
                icon: Icons.warehouse_outlined,
                label: 'GD-01 • Jakarta',
              ),
            ],
          ),
        ),
      );

      // Aksen menempel pada judul sebagai satu kesatuan teks (bukan dua Text
      // terpisah), supaya pemotongan ellipsis berlaku untuk keduanya.
      expect(find.text('Selamat pagi, Budi Santoso'), findsOneWidget);
      expect(find.text('Sabtu, 26 September 2026'), findsOneWidget);
      expect(find.text('GD-01 • Jakarta'), findsOneWidget);
    });

    testWidgets('chip statistik menampilkan angka modul', (tester) async {
      await tester.pumpWidget(
        host(
          const PageHeader(
            title: 'Check In Point',
            stats: [
              HeaderStat(label: 'Hari ini', value: '2'),
              HeaderStat(label: 'Selesai', value: '12'),
            ],
          ),
        ),
      );

      expect(find.text('Hari ini'), findsOneWidget);
      expect(find.text('2'), findsOneWidget);
      expect(find.text('Selesai'), findsOneWidget);
      expect(find.text('12'), findsOneWidget);
    });

    testWidgets('sedang memuat menampilkan "…", bukan angka placeholder', (
      tester,
    ) async {
      await tester.pumpWidget(
        host(
          const PageHeader(
            title: 'Check In Point',
            statsLoading: true,
            stats: [HeaderStat(label: 'Total', value: '9')],
          ),
        ),
      );

      expect(find.text('…'), findsOneWidget);
      expect(find.text('9'), findsNothing);
    });

    testWidgets('gagal dimuat menampilkan "—" + alasan + coba lagi', (
      tester,
    ) async {
      var retries = 0;
      await tester.pumpWidget(
        host(
          PageHeader(
            title: 'Check In Point',
            statsError: 'Server sedang sibuk.',
            onStatsRetry: () => retries++,
            stats: const [HeaderStat(label: 'Total', value: '9')],
          ),
        ),
      );

      expect(find.text('—'), findsOneWidget);
      expect(
        find.textContaining('Statistik gagal dimuat: Server sedang sibuk.'),
        findsOneWidget,
      );
      // Label chip tetap tampil: operator harus tahu itu angka, bukan field
      // yang gagal dirender.
      expect(find.text('Total'), findsOneWidget);

      await tester.tap(find.text('Coba lagi'));
      await tester.pump();
      expect(retries, 1);
    });

    testWidgets('tanpa chip dan tanpa statistik tetap valid', (tester) async {
      await tester.pumpWidget(
        host(const PageHeader(title: 'Validasi Dokumen')),
      );

      expect(find.text('Validasi Dokumen'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('isi terpanjang tidak meluber di layar 320px', (tester) async {
      tester.view.physicalSize = const Size(320, 2000);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);

      await tester.pumpWidget(
        host(
          const PageHeader(
            title: 'Validasi Dokumen Pengiriman Barang Milik PT Sinar',
            accent: 'Abdul, ditambah Mohammed Al-Farsi',
            subtitle:
                'Kontrol fisik produk, quantity, kondisi, dan expired date '
                'di lapangan untuk setiap dokumen yang masuk.',
            icon: Icons.task_alt,
            leading: Icon(Icons.arrow_back, color: Colors.white),
            trailing: Icon(Icons.qr_code_scanner, color: Colors.white),
            chips: [
              HeaderChip(
                icon: Icons.warehouse_outlined,
                label: 'GD-01 • Gudang Pusat Surabaya Timur',
              ),
            ],
            stats: [
              HeaderStat(label: 'Hari ini', value: '1.048'),
              HeaderStat(label: 'Berjalan', value: '1208'),
              HeaderStat(label: 'Selesai', value: '3'),
              HeaderStat(label: 'Total', value: '12088'),
            ],
          ),
        ),
      );

      expect(tester.takeException(), isNull);
    });
  });

  group('TileGrid', () {
    Widget tile(String label, {double height = 60}) => SizedBox(
      height: height,
      child: SectionCard(child: Text(label)),
    );

    testWidgets('menyamakan tinggi kartu dalam satu baris', (tester) async {
      await tester.pumpWidget(
        host(
          TileGrid(
            tiles: [
              tile('rendah', height: 40),
              tile('tinggi', height: 120),
              tile('baris dua a', height: 70),
              tile('baris dua b', height: 50),
            ],
          ),
        ),
      );

      final cards = find.byType(SectionCard);
      expect(
        tester.getSize(cards.at(0)).height,
        tester.getSize(cards.at(1)).height,
        reason: 'baris pertama ikut tinggi kartu paling tinggi',
      );
      expect(
        tester.getSize(cards.at(2)).height,
        tester.getSize(cards.at(3)).height,
        reason: 'baris kedua punya aturan yang sama',
      );
      expect(
        tester.getSize(cards.at(0)).width,
        tester.getSize(cards.at(1)).width,
        reason: 'dua kolom sama lebar',
      );
    });

    testWidgets('baris terakhir yang tidak penuh tetap terbagi rata', (
      tester,
    ) async {
      await tester.pumpWidget(
        host(
          const TileGrid(
            tiles: [
              SectionCard(child: Text('satu')),
              SectionCard(child: Text('dua')),
              SectionCard(child: Text('tiga')),
            ],
          ),
        ),
      );

      final cards = find.byType(SectionCard);
      expect(cards, findsNWidgets(3));
      expect(
        tester.getSize(cards.at(2)).width,
        tester.getSize(cards.at(0)).width,
        reason: 'kartu ketiga tetap selebar kolomnya',
      );
    });

    testWidgets('kartu tinggi tidak terpotong di layar sempit & teks besar', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(320, 2000);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);

      await tester.pumpWidget(
        MediaQuery(
          data: const MediaQueryData(textScaler: TextScaler.linear(1.3)),
          child: MaterialApp(
            home: Scaffold(
              body: TileGrid(
                tiles: const [
                  StatTile(
                    label: 'Standar Umur',
                    icon: Icons.schedule,
                    tone: ModuleTone.indigo,
                    value: 1208,
                    hint: 'NPN tanpa standar umur, perlu review QC',
                  ),
                  StatTile(
                    label: 'Gate',
                    icon: Icons.location_on_outlined,
                    tone: ModuleTone.sky,
                    value: 0,
                  ),
                ],
              ),
            ),
          ),
        ),
      );

      expect(
        tester.takeException(),
        isNull,
        reason: 'tinggi kartu mengikuti isi, bukan rasio tetap',
      );
    });

    testWidgets('daftar kosong tidak menyisakan ruang', (tester) async {
      await tester.pumpWidget(host(const TileGrid(tiles: [])));

      expect(find.byType(TileGrid), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });
}
