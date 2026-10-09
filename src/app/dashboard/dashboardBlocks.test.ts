import { describe, expect, it } from 'vitest';
import { DEFAULT_DASHBOARD_ORDER, dashboardBlockOrder, visibleDashboardBlocks } from './dashboardBlocks';

describe('dashboardBlocks', () => {
  it('menyisipkan blok default yang tidak disebut di urutan peran (tidak ada yang hilang)', () => {
    const order = dashboardBlockOrder('rlh');

    expect(new Set(order)).toEqual(new Set(DEFAULT_DASHBOARD_ORDER));
    expect(order[0]).toBe('biayaQueue');
  });

  it('menyembunyikan blok yang izinnya tidak dimiliki', () => {
    const blocks = visibleDashboardBlocks('rh', (perm) => perm === 'opname.view' || perm === 'dashboard.view');

    expect(blocks).toContain('opname');
    expect(blocks).not.toContain('charts');
    expect(blocks).not.toContain('biayaQueue');
  });

  it('memprioritaskan antrean biaya untuk peran approver', () => {
    expect(dashboardBlockOrder('rlh')[0]).toBe('biayaQueue');
    expect(dashboardBlockOrder('bac')[0]).toBe('biayaQueue');
  });

  it('peran tanpa urutan khusus memakai urutan default', () => {
    expect(dashboardBlockOrder(undefined)).toEqual([...DEFAULT_DASHBOARD_ORDER]);
  });
});
