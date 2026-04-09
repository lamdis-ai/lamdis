"use client";

import { useState, useRef, useEffect } from 'react';

interface ExportReportButtonProps {
  runId: string;
  className?: string;
}

export default function ExportReportButton({ runId, className = '' }: ExportReportButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleExport = async (format: 'pdf' | 'csv' | 'json') => {
    setIsExporting(true);
    setError(null);

    try {
      const url = `/api/runs/${encodeURIComponent(runId)}/export?format=${format}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || 'Export failed');
      }

      // Get filename from content-disposition header
      const contentDisposition = response.headers.get('content-disposition') || '';
      const filenameMatch = contentDisposition.match(/filename="(.+?)"/);
      const filename = filenameMatch?.[1] || `compliance-report-${runId.slice(-6)}.${format === 'pdf' ? 'html' : format}`;

      // Get the content
      const content = await response.text();
      
      // Create blob and download
      const blob = new Blob([content], { 
        type: response.headers.get('content-type') || 'text/plain' 
      });
      const downloadUrl = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);

      setIsOpen(false);
    } catch (e: any) {
      setError(e?.message || 'Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  const exportFormats = [
    {
      id: 'pdf',
      label: 'PDF Report',
      description: 'Print-ready HTML report',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      id: 'csv',
      label: 'CSV Spreadsheet',
      description: 'Excel-compatible data',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
        </svg>
      ),
    },
    {
      id: 'json',
      label: 'JSON Data',
      description: 'Machine-readable format',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
        </svg>
      ),
    },
  ];

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isExporting}
        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isExporting ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Exporting...
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export Report
            <svg className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50">
          <div className="p-3 border-b border-slate-700">
            <div className="text-xs font-medium text-slate-300 uppercase tracking-wide">Export for Compliance</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Audit-ready formats for regulators</div>
          </div>
          
          {error && (
            <div className="px-3 py-2 bg-rose-900/30 border-b border-rose-700/40">
              <div className="text-xs text-rose-300">{error}</div>
            </div>
          )}

          <div className="p-1">
            {exportFormats.map((format) => (
              <button
                key={format.id}
                onClick={() => handleExport(format.id as 'pdf' | 'csv' | 'json')}
                disabled={isExporting}
                className="w-full flex items-start gap-3 px-3 py-2.5 text-left rounded-md hover:bg-slate-700/50 transition-colors disabled:opacity-50"
              >
                <div className="flex-shrink-0 mt-0.5 text-slate-400">
                  {format.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-200">{format.label}</div>
                  <div className="text-xs text-slate-500">{format.description}</div>
                </div>
              </button>
            ))}
          </div>

          <div className="p-3 border-t border-slate-700 bg-slate-800/50 rounded-b-lg">
            <div className="flex items-start gap-2 text-[10px] text-slate-500">
              <svg className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <span>Reports include checksums for verification and are suitable for regulatory submissions.</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
