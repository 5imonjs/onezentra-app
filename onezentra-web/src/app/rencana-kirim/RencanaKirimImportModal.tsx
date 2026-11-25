'use client';

import type { Dispatch, RefObject, SetStateAction } from 'react';
import Modal from '@/components/Modal';

interface RencanaKirimImportModalProps {
  showImport: boolean;
  setShowImport: Dispatch<SetStateAction<boolean>>;
  importing: boolean;
  selectedFile: File | null;
  setSelectedFile: Dispatch<SetStateAction<File | null>>;
  importResult: {
    message: string;
    ok?: boolean;
    total_rows?: number;
    matched?: number;
    skipped?: number;
    errors?: Array<{ row: number; message: string }>;
  } | null;
  setImportResult: Dispatch<SetStateAction<{
    message: string;
    ok?: boolean;
    total_rows?: number;
    matched?: number;
    skipped?: number;
    errors?: Array<{ row: number; message: string }>;
  } | null>>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  handleImportItems: () => void;
  handleItemTemplate: () => void;
}

export default function RencanaKirimImportModal({
  showImport, setShowImport, importing, selectedFile, setSelectedFile, importResult, setImportResult,
  fileInputRef, handleImportItems, handleItemTemplate,
}: RencanaKirimImportModalProps) {
  return (
      <Modal open={showImport} onClose={() => { setShowImport(false); setImportResult(null); setSelectedFile(null); }} title="Import Barang" subtitle="Upload file Excel untuk import daftar barang" size="md"
        footer={
          <>
            <button onClick={() => { setShowImport(false); setImportResult(null); setSelectedFile(null); }} className="btn-secondary">Batal</button>
            <button onClick={handleImportItems} disabled={!selectedFile || importing} className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
              <span className="flex items-center gap-2">
                {importing ? (
                  <>
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                    Importing...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
                    Import Sekarang
                  </>
                )}
              </span>
            </button>
          </>
        }
      >
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-semibold text-foreground">File Excel</label>
            <button onClick={handleItemTemplate} className="text-xs text-accent-text hover:text-accent-text font-medium flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-chip-primary transition-colors">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
              Download Template
            </button>
          </div>
          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 cursor-pointer ${selectedFile ? 'border-warning/30 bg-warning/10' : 'border-border hover:border-warning/30 hover:bg-popover'}`}
            onClick={() => fileInputRef.current?.click()}
          >
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} className="hidden" />
            {selectedFile ? (
              <div className="flex flex-col items-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-warning/10 flex items-center justify-center">
                  <svg className="w-7 h-7 text-warning" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{selectedFile.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">Klik untuk ganti file</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
                  <svg className="w-7 h-7 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Klik untuk pilih file</p>
                  <p className="text-xs text-muted-foreground mt-1">Mendukung .xlsx, .xls, .csv (maks 10MB)</p>
                </div>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Format: 1 baris = 1 barang. Kolom: Kode Barang, Nama Barang, Jumlah, Satuan, Keterangan. Qty minimal 1 — baris dengan qty di bawah 1 dilewati. Barang akan dicocokkan dengan data NPN.</p>

          {importResult && (
            <div className={`p-4 rounded-xl animate-fade-in ${importResult.ok ? 'bg-success/10 border border-success/30' : 'bg-destructive/10 border border-destructive/30'}`}>
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${importResult.ok ? 'bg-success/10' : 'bg-destructive/10'}`}>
                  {importResult.ok ? (
                    <svg className="w-5 h-5 text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                  ) : (
                    <svg className="w-5 h-5 text-destructive" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
                  )}
                </div>
                <div>
                  <p className={`text-sm font-medium ${importResult.ok ? 'text-success' : 'text-destructive'}`}>{importResult.message}</p>
                  {importResult.matched !== undefined && (
                    <div className="flex items-center gap-3 mt-2">
                      <span className="badge badge-success">Cocok: {importResult.matched} barang</span>
                      <span className="badge badge-info">Total: {importResult.total_rows} baris</span>
                      <span className="badge badge-warning">Skip: {importResult.skipped}</span>
                    </div>
                  )}
                  {importResult.errors && importResult.errors.length > 0 && (
                    <ul className="mt-3 space-y-1" aria-label="Baris yang dilewati saat import">
                      {importResult.errors.map((error, i) => (
                        <li key={`${error.row}-${i}`} className="text-xs text-destructive">
                          Baris {error.row}: {error.message}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>
  );
}
