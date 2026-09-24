'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';

const menuItems = [
  { name: 'Dashboard', path: '/dashboard', icon: 'home', permission: 'dashboard.view', roles: [] as string[] },
];

const operasionalMenus = [
  { name: 'Receiving', path: '/receiving', icon: 'receive', permission: 'receiving.view' },
  { name: 'Penerimaan', path: '/penerimaan', icon: 'clipboard', permission: 'penerimaan.view' },
  { name: 'Rencana Kirim', path: '/rencana-kirim', icon: 'truck', permission: 'rencana_kirim.view' },
  { name: 'Gate Check', path: '/gate', icon: 'gate', permission: 'gate.view' },
  { name: 'Validasi Dokumen', path: '/validasi-sj', icon: 'check', permission: 'sj_validation.view' },
  { name: 'Opname Expired', path: '/opname-expired', icon: 'check', permission: 'opname.view' },
];

const masterDataMenus = [
  { name: 'NPN', path: '/npn', icon: 'package', permission: 'npn.view' },
  { name: 'Standar Umur', path: '/standar-umur', icon: 'clock', permission: 'standar_umur.view' },
  { name: 'Standarisasi', path: '/standarisasi', icon: 'grid', permission: 'standarisasi.view' },
];

const biayaMenus = [
  { name: 'Biaya THL', path: '/biaya-thl', icon: 'coins', permission: 'biaya_thl.view' },
  { name: 'Biaya Retribusi', path: '/biaya-retribusi', icon: 'file-dollar', permission: 'biaya_retribusi.view' },
  { name: 'Tarif Retribusi', path: '/tarif-retribusi', icon: 'coins', permission: 'retribusi_rates.manage' },
];

const reportItems = [
  { name: 'Rencana Kirim', path: '/reports/rencana-kirim', icon: 'truck', permission: 'reports.view' },
  { name: 'Penerimaan', path: '/reports/penerimaan', icon: 'clipboard', permission: 'reports.view' },
  { name: 'Selisih Qty', path: '/reports/selisih-qty', icon: 'chart', permission: 'reports.view' },
  { name: 'Biaya THL', path: '/reports/biaya-thl', icon: 'coins', permission: 'reports.biaya_thl' },
  { name: 'Biaya Retribusi', path: '/reports/biaya-retribusi', icon: 'file-dollar', permission: 'reports.biaya_retribusi' },
  { name: 'Opname Expired', path: '/reports/opname-expired', icon: 'clock', permission: 'reports.view' },
];

const systemItems = [
  { name: 'Users', path: '/users', icon: 'users', permission: 'users.view' },
  { name: 'Roles & Permissions', path: '/roles', icon: 'shield', permission: 'roles.view' },
  { name: 'Pengaturan Approval', path: '/approval-settings', icon: 'shield', permission: 'approval.view' },
  { name: 'Setting Email', path: '/email-settings', icon: 'mail', permission: 'emails.view' },
  { name: 'Penerima Email', path: '/email-recipients', icon: 'mail-user', permission: 'emails.view' },
];

const Icon = ({ name, className = '' }: { name: string; className?: string }) => {
  const icons: { [key: string]: React.ReactNode } = {
    home: <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" /></svg>,
    clipboard: <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" /></svg>,
    package: <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>,
    layers: <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L12 12.75 6.429 9.75m11.142 0l4.179 2.25-9.75 5.25-9.75-5.25 4.179-2.25" /></svg>,
    grid: <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg>,
    clock: <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    truck: <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" /></svg>,
    gate: <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>,
    receive: <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>,
    shield: <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>,
    lock: <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>,
    users: <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>,
    menu: <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>,
    menuOpen: <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>,
    mail: <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>,
    mailUser: <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>,
    road: <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 14.25l1.5-1.5M14.25 9.75l1.5-1.5" /></svg>,
    check: <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    chart: <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>,
    'file-dollar': <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>,
    coins: <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.472-1.08 1.472-2.836 0-3.924-.477-.379-1.08-.421-1.629-.326a13.06 13.06 0 00-3.55.813.825.825 0 01-.83.284 1.501 1.501 0 01-.83-1.283c0-.21.05-.423.146-.616.66-.978 1.364-2.073 1.364-3.226 0-.978-.78-1.753-1.753-1.753-.978 0-1.753.78-1.753 1.753 0 .538.21 1.048.546 1.463a3.762 3.762 0 00.208.247c.175.181.381.303.603.303.222 0 .423-.122.603-.303a3.762 3.762 0 00.208-.247c.334-.416.546-.926.546-1.463 0-.978-.78-1.753-1.753-1.753-.978 0-1.753.78-1.753 1.753 0 .538.21 1.048.546 1.463a3.763 3.763 0 00-.208.247c-.175.181-.381.303-.603.303-.222 0-.423-.122-.603-.303a3.762 3.762 0 00-.208-.247C8.32 8.355 8 9.434 8 10.56c0 .354.062.695.177 1.024a3.762 3.762 0 00-.208.247c-.175.181-.381.303-.603.303-.222 0-.423-.122-.603-.303a3.762 3.762 0 00-.208-.247C4.53 9.434 4 10.512 4 11.64c0 .219.038.43.108.636.07.206.154.403.25.587.212.382.518.715.903.97a10.028 10.028 0 003.55.813.825.825 0 01-.83.284 1.501 1.501 0 01-.83-1.283c0-.21.05-.423.146-.616.66-.978 1.364-2.073 1.364-3.226 0-.978-.78-1.753-1.753-1.753-.978 0-1.753.78-1.753 1.753 0 .538.21 1.048.546 1.463a3.762 3.762 0 00.208.247c.175.181.381.303.603.303.222 0 .423-.122.603-.303" /></svg>,
    fileDollar: <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.5 1.5 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18v-.008zM15 12h.008v.008H15V12z" /></svg>,
  };
  return icons[name] || null;
};

interface NavItemProps {
  href: string;
  label: string;
  icon?: string;
  isActive: boolean;
  isExpanded: boolean;
}

function NavItem({ href, label, icon, isActive, isExpanded }: NavItemProps) {
  return (
    <Link
      href={href}
      title={!isExpanded ? label : undefined}
      aria-current={isActive ? 'page' : undefined}
      className={`group relative flex items-center rounded-lg text-[13.5px] font-medium transition-colors duration-150 ${
        !isExpanded ? 'justify-center p-3' : 'px-3 py-2.5 gap-3'
      } ${
        isActive
          ? 'bg-primary-500/10 text-white'
          : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'
      }`}
    >
      {isActive && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-[18px] w-[3px] rounded-r-full bg-linear-to-b from-primary-400 to-primary-600" />
      )}
      {icon && (
        <Icon
          name={icon}
          className={`w-5 h-5 shrink-0 transition-colors duration-150 ${
            isActive ? 'text-primary-300' : 'text-slate-500 group-hover:text-slate-300'
          }`}
        />
      )}
      {isExpanded && <span className="whitespace-nowrap">{label}</span>}
    </Link>
  );
}

function NavSubItem({ href, label, icon, isActive, isExpanded }: NavItemProps) {
  return (
    <Link
      href={href}
      title={!isExpanded ? label : undefined}
      aria-current={isActive ? 'page' : undefined}
      className={`group relative flex items-center gap-2.5 rounded-lg py-2 pr-3 text-[13px] font-medium transition-colors duration-150 ${
        isActive
          ? 'bg-linear-to-r from-primary-500/15 to-primary-500/5 text-white'
          : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'
      }`}
    >
      {isActive && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-[16px] w-[3px] rounded-r-full bg-linear-to-b from-primary-400 to-primary-600" />
      )}
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ring-4 ring-transparent transition-colors duration-150 ${
        isActive ? 'bg-primary-400' : 'bg-slate-600 group-hover:bg-slate-400'
      }`} />
      {icon && (
        <Icon
          name={icon}
          className={`w-[17px] h-[17px] shrink-0 transition-colors duration-150 ${
            isActive ? 'text-primary-300' : 'text-slate-500 group-hover:text-slate-300'
          }`}
        />
      )}
      {isExpanded && <span className="whitespace-nowrap">{label}</span>}
    </Link>
  );
}

interface GroupItem {
  name: string;
  path: string;
  icon: string;
  permission: string;
}

interface CollapsibleGroupProps {
  title: string;
  icon: string;
  items: GroupItem[];
  isExpanded: boolean;
  pathname: string;
  hasPermission: (slug: string) => boolean;
  open: boolean;
  onToggle: () => void;
  onExpandRequest?: () => void;
  accent?: boolean;
}

function CollapsibleGroup({ title, icon, items, isExpanded, pathname, hasPermission, open, onToggle, onExpandRequest, accent = false }: CollapsibleGroupProps) {
  const visibleItems = items.filter((m) => hasPermission(m.permission));
  if (visibleItems.length === 0) return null;

  const isActiveAny = visibleItems.some((m) => pathname === m.path);

  if (!isExpanded) {
    // Jangan navigasi diam-diam: klik ikon membuka sidebar agar user memilih menu.
    return (
      <button
        type="button"
        onClick={() => onExpandRequest?.()}
        title={title}
        className={`relative flex justify-center w-full p-3 rounded-lg transition-colors duration-150 ${
          isActiveAny
            ? 'bg-primary-500/10 text-primary-300'
            : 'text-slate-500 hover:bg-white/5 hover:text-slate-100'
        }`}
      >
        {isActiveAny && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 h-[18px] w-[3px] rounded-r-full bg-linear-to-b from-primary-400 to-primary-600" />
        )}
        <Icon name={icon} className="w-5 h-5 shrink-0" />
      </button>
    );
  }

  return (
    <div>
      <button
        onClick={onToggle}
        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 w-full transition-all duration-150 ${
          accent
            ? 'bg-emerald-500/10 text-emerald-300 border-l-2 border-emerald-500'
            : open
              ? 'bg-white/5 text-white'
              : isActiveAny
                ? 'text-white hover:bg-white/5'
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'
        }`}
      >
        <Icon
          name={icon}
          className={`w-[18px] h-[18px] shrink-0 transition-colors duration-150 ${
            accent ? 'text-emerald-400' : isActiveAny || open ? 'text-primary-300' : 'text-slate-500'
          }`}
        />
        <span className={`flex-1 text-left text-[11px] font-bold uppercase tracking-[0.12em] ${accent ? 'text-emerald-300' : ''}`}>{title}</span>
        <span className={`text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded-md transition-colors duration-150 ${
          open ? 'bg-primary-500/15 text-primary-300' : 'bg-white/5 text-slate-400'
        }`}>
          {visibleItems.length}
        </span>
        <svg
          className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="relative mt-1 ml-5 pl-3 space-y-0.5">
          <span className="absolute left-0 top-1 bottom-1 w-px bg-linear-to-b from-slate-700/80 via-slate-700/50 to-transparent pointer-events-none" />
          {visibleItems.map((child) => (
            <NavSubItem
              key={child.path}
              href={child.path}
              label={child.name}
              icon={child.icon}
              isActive={pathname === child.path}
              isExpanded={isExpanded}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
  onHoverChange?: (isHovered: boolean) => void;
  mobileOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isCollapsed, onToggle, onHoverChange, mobileOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { hasPermission, user, logout } = useAuthStore();
  const [isHovered, setIsHovered] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const sectionKeyOf = useCallback((path: string) => {
    const groups: { key: string; items: GroupItem[] }[] = [
      { key: 'operasional', items: operasionalMenus },
      { key: 'master-data', items: masterDataMenus },
      { key: 'keuangan', items: biayaMenus },
      { key: 'laporan', items: reportItems },
      { key: 'sistem', items: systemItems },
    ];
    return groups.find((g) => g.items.some((m) => m.path === path))?.key ?? null;
  }, []);

  const [openSection, setOpenSection] = useState<string | null>(() => sectionKeyOf(pathname));

  useEffect(() => {
    const key = sectionKeyOf(pathname);
    if (key) setOpenSection(key);
  }, [pathname, sectionKeyOf]);

  // Hover-expand hanya untuk perangkat ber-pointer presisi (desktop).
  // Di layar sentuh, tap memicu mouseenter dan bisa mengunci sidebar terbuka.
  const canHover = () => typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches;

  const handleMouseEnter = useCallback(() => {
    if (!canHover()) return;
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setIsHovered(true);
    onHoverChange?.(true);
  }, [onHoverChange]);

  const handleMouseLeave = useCallback(() => {
    if (!canHover()) return;
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovered(false);
      onHoverChange?.(false);
    }, 150);
  }, [onHoverChange]);

  // Drawer mobile selalu tampil penuh saat terbuka; logika rail hanya untuk desktop.
  const isExpanded = mobileOpen || !isCollapsed || isHovered;

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileOpen, onClose]);

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  return (
    <aside
      id="primary-navigation"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      aria-label="Navigasi utama"
      className={`fixed top-0 left-0 h-dvh bg-linear-to-b from-slate-900 via-slate-900 to-slate-950 text-white flex flex-col z-40 sidebar-transition shadow-2xl lg:shadow-none ${
        mobileOpen ? 'translate-x-0 visible' : '-translate-x-full invisible lg:visible lg:translate-x-0'
      } ${
        isExpanded ? 'w-[280px] max-w-[85vw] lg:max-w-none lg:w-[260px]' : 'w-[280px] max-w-[85vw] lg:max-w-none lg:w-[72px]'
      }`}
    >
      <div className={`border-b border-slate-800/80 flex items-center ${isExpanded ? 'justify-between px-5 py-4' : 'justify-center py-4'}`}>
        {isExpanded ? (
          <div className="relative h-14 flex-1 min-w-0 animate-fade-in">
            <Image src="/LOGO.png" alt="ONEZENTRA" fill sizes="200px" className="object-contain object-left" />
          </div>
        ) : (
          <div className="relative w-9 h-9 rounded-xl bg-white/[0.06] ring-1 ring-white/10 overflow-hidden">
            <Image src="/LOGO.png" alt="ONEZENTRA" fill sizes="36px" className="object-contain p-1" />
          </div>
        )}
        {isExpanded && (
          mobileOpen ? (
            <button
              onClick={onClose}
              aria-label="Tutup navigasi"
              className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors min-w-[44px] min-h-[44px]"
            >
              <Icon name="menuOpen" className="w-5 h-5" />
            </button>
          ) : (
            <button
              onClick={onToggle}
              aria-label="Sembunyikan sidebar"
              className="w-9 h-9 hidden lg:flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors min-w-[44px] min-h-[44px]"
            >
              <Icon name="menu" className="w-5 h-5" />
            </button>
          )
        )}
      </div>

      <nav className="flex-1 px-3 pb-4 overflow-y-auto overflow-x-hidden overscroll-contain [scrollbar-width:thin] [scrollbar-color:rgba(148,163,184,0.25)_transparent]">
        <div className="space-y-1">
          {menuItems.map((item) => {
            if (!hasPermission(item.permission)) return null;
            return (
              <NavItem
                key={item.path}
                href={item.path}
                label={item.name}
                icon={item.icon}
                isActive={pathname === item.path}
                isExpanded={isExpanded}
              />
            );
          })}
        </div>

        <div className="mt-3 space-y-1">
          <CollapsibleGroup
            title="Operasional"
            icon="road"
            items={operasionalMenus}
            isExpanded={isExpanded}
            pathname={pathname}
            hasPermission={hasPermission}
            open={openSection === 'operasional'}
            onToggle={() => setOpenSection(openSection === 'operasional' ? null : 'operasional')}
            onExpandRequest={onToggle}
          />

          <div className="mx-3 my-1.5 h-px bg-linear-to-r from-transparent via-slate-700/60 to-transparent" />

          <CollapsibleGroup
            title="Data Master"
            icon="layers"
            items={masterDataMenus}
            isExpanded={isExpanded}
            pathname={pathname}
            hasPermission={hasPermission}
            open={openSection === 'master-data'}
            onToggle={() => setOpenSection(openSection === 'master-data' ? null : 'master-data')}
            onExpandRequest={onToggle}
          />

          <div className="mx-3 my-1.5 h-px bg-linear-to-r from-transparent via-slate-700/60 to-transparent" />

          <CollapsibleGroup
            title="Keuangan"
            icon="coins"
            items={biayaMenus}
            isExpanded={isExpanded}
            pathname={pathname}
            hasPermission={hasPermission}
            open={openSection === 'keuangan'}
            onToggle={() => setOpenSection(openSection === 'keuangan' ? null : 'keuangan')}
            accent
            onExpandRequest={onToggle}
          />

          <div className="mx-3 my-1.5 h-px bg-linear-to-r from-transparent via-slate-700/60 to-transparent" />

          <CollapsibleGroup
            title="Laporan"
            icon="chart"
            items={reportItems}
            isExpanded={isExpanded}
            pathname={pathname}
            hasPermission={hasPermission}
            open={openSection === 'laporan'}
            onToggle={() => setOpenSection(openSection === 'laporan' ? null : 'laporan')}
            onExpandRequest={onToggle}
          />

          <div className="mx-3 my-1.5 h-px bg-linear-to-r from-transparent via-slate-700/60 to-transparent" />

          <CollapsibleGroup
            title="Sistem"
            icon="shield"
            items={systemItems}
            isExpanded={isExpanded}
            pathname={pathname}
            hasPermission={hasPermission}
            open={openSection === 'sistem'}
            onToggle={() => setOpenSection(openSection === 'sistem' ? null : 'sistem')}
            onExpandRequest={onToggle}
          />
        </div>
      </nav>

      {user && (
        <div className="border-t border-slate-800/80 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className={`flex items-center gap-3 ${!isExpanded ? 'justify-center' : 'px-2 py-1.5 rounded-xl bg-white/5 ring-1 ring-white/5'}`}>
            <Link href="/dashboard/profile" aria-label="Buka profil saya" className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-9 h-9 bg-linear-to-br from-primary-500 to-primary-600 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 shadow-lg shadow-primary-600/20 ring-1 ring-white/10">
                {user.full_name?.charAt(0) || 'A'}
              </div>
              {isExpanded && (
                <div className="flex-1 min-w-0 animate-fade-in">
                  <p className="text-sm font-semibold text-white truncate">{user.full_name}</p>
                  <p className="text-xs text-slate-400 truncate">{user.roles?.[0]?.name || user.level}</p>
                </div>
              )}
            </Link>
            {isExpanded && (
              <button
                onClick={handleLogout}
                aria-label="Logout"
                className="shrink-0 p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}