/**
 * Registry blok dashboard: menentukan blok mana yang tampil dan bagaimana
 * urutannya per peran.
 *
 * Sebelumnya urutan dirakit hardcode di `page.tsx` dan blok sistem (chart
 * aktivitas) tampil ke semua peran. Dengan registry ini, blok yang izinnya
 * tidak dimiliki tidak lagi dirender, dan peran operasional bisa
 * memprioritaskan blok pekerjaannya sendiri (mis. antrean biaya di atas).
 */
export type DashboardBlockKey =
  | 'biayaQueue'
  | 'pending'
  | 'alerts'
  | 'charts'
  | 'opname'
  | 'recent';

export interface DashboardBlockDef {
  key: DashboardBlockKey;
  /** Blok tampil bila user memiliki minimal salah satu permission ini. */
  anyPermissions: readonly string[];
}

export const DASHBOARD_BLOCKS: readonly DashboardBlockDef[] = [
  { key: 'biayaQueue', anyPermissions: ['approval.check', 'approval.approve', 'approval.rfah'] },
  { key: 'pending', anyPermissions: ['dashboard.view'] },
  { key: 'alerts', anyPermissions: ['dashboard.view'] },
  { key: 'charts', anyPermissions: ['users.view', 'rencana_kirim.view'] },
  { key: 'opname', anyPermissions: ['opname.view'] },
  {
    key: 'recent',
    anyPermissions: ['rencana_kirim.view', 'sj_validation.view', 'standarisasi.view', 'receiving.view'],
  },
];

export const DEFAULT_DASHBOARD_ORDER: readonly DashboardBlockKey[] = DASHBOARD_BLOCKS.map((block) => block.key);

/**
 * Urutan prioritas per peran (slug `user.level`). Blok yang tidak disebut
 * otomatis disisipkan mengikuti urutan default, jadi menambah blok baru tidak
 * pernah "hilang" hanya karena lupa memperbarui salah satu peran di sini.
 */
export const ROLE_DASHBOARD_ORDER: Readonly<Record<string, readonly DashboardBlockKey[]>> = {
  admin_master: ['pending', 'biayaQueue', 'alerts', 'charts', 'opname', 'recent'],
  admin_distirbusi: ['biayaQueue', 'pending', 'alerts', 'opname', 'recent', 'charts'],
  admin_planner: ['charts', 'pending', 'alerts', 'opname', 'recent', 'biayaQueue'],
  staff_logistic: ['biayaQueue', 'pending', 'alerts', 'opname', 'recent', 'charts'],
  blc: ['pending', 'alerts', 'charts', 'opname', 'recent', 'biayaQueue'],
  cheker: ['pending', 'alerts', 'opname', 'charts', 'recent', 'biayaQueue'],
  operator: ['pending', 'alerts', 'opname', 'charts', 'recent', 'biayaQueue'],
  bac: ['biayaQueue', 'pending', 'alerts', 'charts', 'opname', 'recent'],
  sac: ['biayaQueue', 'pending', 'alerts', 'charts', 'opname', 'recent'],
  rlh: ['biayaQueue', 'alerts', 'opname', 'recent', 'pending', 'charts'],
  rfah: ['biayaQueue', 'alerts', 'opname', 'recent', 'pending', 'charts'],
  rh: ['opname', 'alerts', 'recent', 'pending', 'charts', 'biayaQueue'],
};

export function dashboardBlockOrder(role: string | null | undefined): DashboardBlockKey[] {
  const preferred = role ? ROLE_DASHBOARD_ORDER[role] : undefined;
  if (!preferred) {
    return [...DEFAULT_DASHBOARD_ORDER];
  }

  const seen = new Set<DashboardBlockKey>(preferred);
  const missing = DEFAULT_DASHBOARD_ORDER.filter((key) => !seen.has(key));

  return [...preferred, ...missing];
}

export function visibleDashboardBlocks(
  role: string | null | undefined,
  hasPermission: (perm: string) => boolean,
): DashboardBlockKey[] {
  const permissionsByBlock = new Map(DASHBOARD_BLOCKS.map((block) => [block.key, block.anyPermissions]));

  return dashboardBlockOrder(role).filter((key) => {
    const permissions = permissionsByBlock.get(key);

    return !!permissions && permissions.some((perm) => hasPermission(perm));
  });
}
