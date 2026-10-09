/**
 * Grid kartu dashboard yang menata dirinya otomatis.
 *
 * Jumlah kartu yang tampil bergantung pada permission user, jadi grid dengan
 * kolom tetap (mis. `xl:grid-cols-5`) menyisakan celah kosong begitu sebagian
 * permission dimatikan — kartu menggantung di kolom kiri dan baris terakhir
 * tidak penuh. `auto-fit` + `minmax` membuat kartu mengalir lalu merentang
 * mengisi lebar baris, berapa pun jumlah kartunya.
 */
export default function DashboardCardGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] sm:grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-3">
      {children}
    </div>
  );
}
