'use client';

import StatusBadge from './StatusBadge';
import RowActions from './RowActions';
import { StandarisasiItem, StandarisasiRowHandlers, productLabel } from '../types';

interface StandarisasiTableRowProps {
  item: StandarisasiItem;
  rowNumber: number;
  selected: boolean;
  showDepot: boolean;
  canSelect: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canApprove: boolean;
  notifying: boolean;
  onToggleSelect: (id: number) => void;
  handlers: StandarisasiRowHandlers;
}

export default function StandarisasiTableRow({
  item,
  rowNumber,
  selected,
  showDepot,
  canSelect,
  canEdit,
  canDelete,
  canApprove,
  notifying,
  onToggleSelect,
  handlers,
}: StandarisasiTableRowProps) {
  const product = productLabel(item.npn);

  return (
    <tr className={`hover:bg-slate-50/50 transition-colors ${selected ? 'bg-primary-50/40' : rowNumber % 2 === 0 ? 'bg-gray-50/30' : 'bg-white'}`}>
      {canSelect && (
        <td className="table-cell text-center">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(item.id)}
            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            aria-label={`Pilih standarisasi ${product} BOS ID ${item.npn?.BOSnetszProductId || '-'}`}
          />
        </td>
      )}
      <td className="table-cell text-sm text-slate-500 text-center tabular-nums">{rowNumber}</td>
      <td className="table-cell">
        <span className="font-mono text-sm font-medium text-slate-800">{item.npn?.BOSnetszProductId || '-'}</span>
      </td>
      <td className="table-cell">
        <span className="text-sm text-slate-600">{product}</span>
      </td>
      <td className="table-cell">
        <span className="text-sm text-slate-600 font-mono">{item.npn?.szBarcode || '-'}</span>
      </td>
      <td className="table-cell text-center">
        <span className="text-sm font-semibold text-primary-600 tabular-nums">{item.tier ?? '-'}</span>
      </td>
      <td className="table-cell text-center">
        <span className="text-sm font-semibold text-amber-600 tabular-nums">{item.tinggi_tumpukan ?? '-'}</span>
      </td>
      <td className="table-cell text-center">
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg bg-primary-50 text-primary-700 text-xs font-semibold tabular-nums">
          {item.total_tier_tinggi ?? '-'}
        </span>
      </td>
      <td className="table-cell">
        <StatusBadge status={item.status} />
      </td>
      {showDepot && (
        <td className="table-cell">
          <span className="text-sm text-slate-600">{item.nama_depo || item.kode_depo || '-'}</span>
        </td>
      )}
      <td className="table-cell">
        <span className="text-sm text-slate-600">{item.requested_by_email || '-'}</span>
      </td>
      <td className="table-cell text-right">
        <RowActions
          item={item}
          canEdit={canEdit}
          canDelete={canDelete}
          canApprove={canApprove}
          notifying={notifying}
          onView={() => handlers.onView(item)}
          onEdit={() => handlers.onEdit(item)}
          onDelete={() => handlers.onDelete(item)}
          onApprove={() => handlers.onApprove(item)}
          onReject={() => handlers.onReject(item)}
          onNotify={() => handlers.onNotify(item)}
        />
      </td>
    </tr>
  );
}
