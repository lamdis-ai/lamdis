"use client";

import { useState, useEffect, useCallback } from 'react';
import { FiFilter, FiDownload, FiSearch, FiChevronLeft, FiChevronRight, FiClock, FiUser, FiFileText, FiAlertTriangle, FiInfo, FiAlertCircle, FiRefreshCw } from 'react-icons/fi';

interface AuditLog {
  id: string;
  timestamp: string;
  action: string;
  category: string;
  severity: string;
  actor: {
    email?: string;
    role?: string;
    type?: string;
  };
  resource?: {
    type?: string;
    id?: string;
    name?: string;
  };
  changedFields?: string[];
  details?: Record<string, any>;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

const SEVERITY_COLORS = {
  info: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  warning: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  critical: 'bg-red-500/20 text-red-300 border-red-500/30',
};

const SEVERITY_ICONS = {
  info: FiInfo,
  warning: FiAlertTriangle,
  critical: FiAlertCircle,
};

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filters
  const [search, setSearch] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('');
  const [selectedAction, setSelectedAction] = useState<string>('');
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [page, setPage] = useState(1);
  
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [availableActions, setAvailableActions] = useState<string[]>([]);
  const [availableUsers, setAvailableUsers] = useState<{email: string, sub?: string}[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  
  // Export state
  const [exporting, setExporting] = useState(false);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '25');

      if (search) params.set('search', search);
      if (selectedCategory) params.set('categories', selectedCategory);
      if (selectedSeverity) params.set('severity', selectedSeverity);
      if (selectedAction) params.set('actions', selectedAction);
      if (selectedUser) params.set('actorSub', selectedUser);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      params.set('sortBy', 'timestamp');
      params.set('sortOrder', 'desc');

      const res = await fetch(`/api/orgs/audit?${params}`, { cache: 'no-store' });
      
      // Get response text first, then parse
      const text = await res.text();
      if (!text) {
        if (res.ok) {
          // Empty but OK response - treat as no logs
          setLogs([]);
          setPagination(null);
          setAvailableCategories([]);
          setLoading(false);
          return;
        }
        throw new Error(`Empty response from server (status: ${res.status})`);
      }
      
      let data;
      try {
        data = JSON.parse(text);
      } catch (parseError) {
        console.error('[audit/page] Failed to parse JSON:', text.substring(0, 200));
        throw new Error(`Invalid response from server: ${text.substring(0, 100)}`);
      }
      
      if (!res.ok) {
        throw new Error(data?.error || data?.message || 'Failed to fetch audit logs');
      }
      
      setLogs(data.logs || []);
      setPagination(data.pagination);
      
      if (data.filters?.categories) {
        setAvailableCategories(data.filters.categories);
      }
      
      // Extract unique actions and users from logs for filter dropdowns
      const logsArray = (data.logs || []) as AuditLog[];
      const uniqueActions = Array.from(new Set(logsArray.map(l => l.action))).sort();
      const userMap = new Map<string, {email: string, sub?: string}>();
      logsArray.forEach(l => {
        if (l.actor?.email) {
          userMap.set(l.actor.email, { email: l.actor.email, sub: (l.actor as any)?.sub });
        }
      });
      const uniqueUsers = Array.from(userMap.values());
      
      // Merge with existing to build up filter options over time
      setAvailableActions(prev => Array.from(new Set([...prev, ...uniqueActions])).sort());
      setAvailableUsers(prev => {
        const map = new Map(prev.map(u => [u.email, u]));
        uniqueUsers.forEach(u => map.set(u.email, u));
        return Array.from(map.values()).sort((a, b) => a.email.localeCompare(b.email));
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [page, search, selectedCategory, selectedSeverity, selectedAction, selectedUser, startDate, endDate]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleExport = async (format: 'json' | 'csv') => {
    setExporting(true);

    try {
      const body: any = { format };
      if (startDate) body.startDate = startDate;
      if (endDate) body.endDate = endDate;
      if (selectedCategory) body.categories = [selectedCategory];
      if (selectedSeverity) body.severity = [selectedSeverity];
      if (selectedAction) body.actions = [selectedAction];
      if (selectedUser) body.actorSub = selectedUser;
      if (search) body.search = search;

      const res = await fetch(`/api/orgs/audit/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      
      if (!res.ok) {
        throw new Error('Export failed');
      }
      
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-export.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setExporting(false);
    }
  };

  const formatTimestamp = (ts: string) => {
    const date = new Date(ts);
    return date.toLocaleString();
  };

  const formatAction = (action: string) => {
    return action.replace(/\./g, ' › ').replace(/_/g, ' ');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Audit Log</h1>
            <p className="text-slate-400 mt-1">Track all changes and activities in your organization</p>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchLogs()}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition"
            >
              <FiRefreshCw className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
            
            <div className="relative">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition ${
                  showFilters || selectedCategory || selectedSeverity || selectedAction || selectedUser || startDate || endDate
                    ? 'bg-fuchsia-600 hover:bg-fuchsia-500'
                    : 'bg-slate-800 hover:bg-slate-700'
                }`}
              >
                <FiFilter />
                Filters
                {(selectedCategory || selectedSeverity || selectedAction || selectedUser || startDate || endDate) && (
                  <span className="ml-1 px-1.5 py-0.5 text-xs bg-white/20 rounded-full">
                    {[selectedCategory, selectedSeverity, selectedAction, selectedUser, startDate, endDate].filter(Boolean).length}
                  </span>
                )}
              </button>
            </div>
            
            <div className="relative group">
              <button
                disabled={exporting}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition disabled:opacity-50"
              >
                <FiDownload />
                Export
              </button>
              <div className="absolute right-0 top-full mt-1 bg-slate-800 rounded-lg shadow-xl border border-slate-700 hidden group-hover:block z-10">
                <button
                  onClick={() => handleExport('json')}
                  className="block w-full px-4 py-2 text-left hover:bg-slate-700 rounded-t-lg"
                >
                  Export as JSON
                </button>
                <button
                  onClick={() => handleExport('csv')}
                  className="block w-full px-4 py-2 text-left hover:bg-slate-700 rounded-b-lg"
                >
                  Export as CSV
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <div className="mb-6 p-4 rounded-xl bg-slate-900 border border-slate-800">
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Search</label>
                <div className="relative">
                  <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                    placeholder="Search..."
                    className="w-full pl-10 pr-3 py-2 rounded-lg bg-slate-800 border border-slate-700 focus:border-fuchsia-500 focus:ring-1 focus:ring-fuchsia-500 outline-none text-sm"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm text-slate-400 mb-1">User</label>
                <select
                  value={selectedUser}
                  onChange={(e) => { setSelectedUser(e.target.value); setPage(1); }}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 focus:border-fuchsia-500 outline-none text-sm"
                >
                  <option value="">All users</option>
                  {availableUsers.map(user => (
                    <option key={user.email} value={user.sub || user.email}>{user.email}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm text-slate-400 mb-1">Action</label>
                <select
                  value={selectedAction}
                  onChange={(e) => { setSelectedAction(e.target.value); setPage(1); }}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 focus:border-fuchsia-500 outline-none text-sm"
                >
                  <option value="">All actions</option>
                  {availableActions.map(action => (
                    <option key={action} value={action}>{action.replace(/\./g, ' › ').replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm text-slate-400 mb-1">Category</label>
                <select
                  value={selectedCategory}
                  onChange={(e) => { setSelectedCategory(e.target.value); setPage(1); }}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 focus:border-fuchsia-500 outline-none text-sm"
                >
                  <option value="">All categories</option>
                  {availableCategories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm text-slate-400 mb-1">Severity</label>
                <select
                  value={selectedSeverity}
                  onChange={(e) => { setSelectedSeverity(e.target.value); setPage(1); }}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 focus:border-fuchsia-500 outline-none text-sm"
                >
                  <option value="">All severities</option>
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-sm text-slate-400 mb-1">From</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 focus:border-fuchsia-500 outline-none text-sm"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm text-slate-400 mb-1">To</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 focus:border-fuchsia-500 outline-none text-sm"
                  />
                </div>
              </div>
            </div>
            
            <div className="mt-3 flex justify-end">
              <button
                onClick={() => {
                  setSearch('');
                  setSelectedCategory('');
                  setSelectedSeverity('');
                  setSelectedAction('');
                  setSelectedUser('');
                  setStartDate('');
                  setEndDate('');
                  setPage(1);
                }}
                className="text-sm text-slate-400 hover:text-slate-200"
              >
                Clear filters
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-900/30 border border-red-500/30 text-red-300">
            {error}
          </div>
        )}

        {/* Logs Table */}
        <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-400">Timestamp</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-400">Action</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-400">Category</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-400">Actor</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-400">Resource</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-400">Severity</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                      <FiRefreshCw className="inline-block animate-spin mr-2" />
                      Loading audit logs...
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                      No audit logs found
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => {
                    const SeverityIcon = SEVERITY_ICONS[log.severity as keyof typeof SEVERITY_ICONS] || FiInfo;
                    return (
                      <tr
                        key={log.id}
                        className="border-b border-slate-800/50 hover:bg-slate-800/30 cursor-pointer transition"
                        onClick={() => window.location.href = `/dashboard/activity/audit/${log.id}`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 text-sm">
                            <FiClock className="text-slate-500" />
                            <span>{formatTimestamp(log.timestamp)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm font-medium capitalize">
                            {formatAction(log.action)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-slate-400 capitalize">{log.category}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 text-sm">
                            <FiUser className="text-slate-500" />
                            <span>{log.actor?.email || 'System'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {log.resource ? (
                            <div className="flex items-center gap-2 text-sm">
                              <FiFileText className="text-slate-500" />
                              <span>{log.resource.name || log.resource.type}</span>
                            </div>
                          ) : (
                            <span className="text-slate-500 text-sm">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs border ${SEVERITY_COLORS[log.severity as keyof typeof SEVERITY_COLORS] || SEVERITY_COLORS.info}`}>
                            <SeverityIcon size={12} />
                            {log.severity}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="px-4 py-3 border-t border-slate-800 flex items-center justify-between">
              <div className="text-sm text-slate-400">
                Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} results
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={pagination.page <= 1}
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  <FiChevronLeft />
                </button>
                <span className="text-sm">
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                  disabled={!pagination.hasMore}
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  <FiChevronRight />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
