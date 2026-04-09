"use client";

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useOrg } from '@/lib/orgContext';
import { FiArrowLeft, FiClock, FiUser, FiFileText, FiInfo, FiAlertTriangle, FiAlertCircle, FiRefreshCw, FiLayers, FiGitCommit } from 'react-icons/fi';

interface AuditLogDetail {
  id: string;
  timestamp: string;
  action: string;
  category: string;
  severity: string;
  actor: {
    sub?: string;
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
  metadata?: {
    ipAddressHash?: string;
    userAgent?: string;
    source?: string;
    correlationId?: string;
  };
  before?: Record<string, any>;
  after?: Record<string, any>;
  integrityHash?: string;
  previousHash?: string;
  compliance?: {
    frameworks?: string[];
    retentionRequired?: boolean;
    exportedAt?: string;
    exportedBy?: string;
  };
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

export default function AuditDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { currentOrg } = useOrg();
  const auditId = params?.auditId as string;
  
  const [log, setLog] = useState<AuditLogDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchLog() {
      if (!currentOrg?.orgId || !auditId) return;
      
      setLoading(true);
      setError(null);
      
      try {
        const res = await fetch(`/api/orgs/audit/${auditId}`, {
          headers: { 'x-org-id': currentOrg.orgId },
        });
        
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error('Audit log not found');
          }
          const data = await res.json();
          throw new Error(data.error || 'Failed to fetch audit log');
        }
        
        const data = await res.json();
        setLog(data.log);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    
    fetchLog();
  }, [currentOrg?.orgId, auditId]);

  const formatTimestamp = (ts: string) => {
    const date = new Date(ts);
    return date.toLocaleString(undefined, {
      dateStyle: 'full',
      timeStyle: 'long',
    });
  };

  const formatAction = (action: string) => {
    return action.replace(/\./g, ' › ').replace(/_/g, ' ');
  };

  const renderJsonValue = (value: any) => {
    if (value === null) return <span className="text-slate-500">null</span>;
    if (value === undefined) return <span className="text-slate-500">undefined</span>;
    if (typeof value === 'object') {
      return (
        <pre className="text-xs bg-slate-950 p-3 rounded-lg overflow-x-auto border border-slate-700">
          {JSON.stringify(value, null, 2)}
        </pre>
      );
    }
    return <span>{String(value)}</span>;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-center py-24">
            <FiRefreshCw className="animate-spin mr-2" />
            Loading audit log...
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => router.push('/dashboard/activity/audit')}
            className="flex items-center gap-2 text-slate-400 hover:text-slate-200 mb-6"
          >
            <FiArrowLeft />
            Back to Audit Log
          </button>
          <div className="p-6 rounded-xl bg-red-900/30 border border-red-500/30 text-red-300">
            {error}
          </div>
        </div>
      </div>
    );
  }

  if (!log) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => router.push('/dashboard/activity/audit')}
            className="flex items-center gap-2 text-slate-400 hover:text-slate-200 mb-6"
          >
            <FiArrowLeft />
            Back to Audit Log
          </button>
          <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 text-center">
            Audit log not found
          </div>
        </div>
      </div>
    );
  }

  const SeverityIcon = SEVERITY_ICONS[log.severity as keyof typeof SEVERITY_ICONS] || FiInfo;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Back button */}
        <button
          onClick={() => router.push('/dashboard/activity/audit')}
          className="flex items-center gap-2 text-slate-400 hover:text-slate-200 mb-6"
        >
          <FiArrowLeft />
          Back to Audit Log
        </button>

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold capitalize">
              {formatAction(log.action)}
            </h1>
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs border ${SEVERITY_COLORS[log.severity as keyof typeof SEVERITY_COLORS] || SEVERITY_COLORS.info}`}>
              <SeverityIcon size={12} />
              {log.severity}
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm text-slate-400">
            <span className="flex items-center gap-1">
              <FiClock />
              {formatTimestamp(log.timestamp)}
            </span>
            <span className="capitalize">{log.category}</span>
          </div>
        </div>

        {/* Main content */}
        <div className="space-y-6">
          {/* Actor Information */}
          <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 bg-slate-800/50">
              <h2 className="font-semibold flex items-center gap-2">
                <FiUser />
                Actor
              </h2>
            </div>
            <div className="p-4 grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-slate-400 mb-1">Email</div>
                <div>{log.actor?.email || <span className="text-slate-500">—</span>}</div>
              </div>
              <div>
                <div className="text-sm text-slate-400 mb-1">Role</div>
                <div className="capitalize">{log.actor?.role || <span className="text-slate-500">—</span>}</div>
              </div>
              <div>
                <div className="text-sm text-slate-400 mb-1">Type</div>
                <div className="capitalize">{log.actor?.type || <span className="text-slate-500">—</span>}</div>
              </div>
              {log.actor?.sub && (
                <div>
                  <div className="text-sm text-slate-400 mb-1">Subject ID</div>
                  <div className="font-mono text-sm">{log.actor.sub}</div>
                </div>
              )}
            </div>
          </div>

          {/* Resource Information */}
          {log.resource && (
            <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800 bg-slate-800/50">
                <h2 className="font-semibold flex items-center gap-2">
                  <FiFileText />
                  Resource
                </h2>
              </div>
              <div className="p-4 grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-slate-400 mb-1">Type</div>
                  <div className="capitalize">{log.resource.type || <span className="text-slate-500">—</span>}</div>
                </div>
                <div>
                  <div className="text-sm text-slate-400 mb-1">Name</div>
                  <div>{log.resource.name || <span className="text-slate-500">—</span>}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-sm text-slate-400 mb-1">ID</div>
                  <div className="font-mono text-sm">{log.resource.id || <span className="text-slate-500">—</span>}</div>
                </div>
              </div>
            </div>
          )}

          {/* Changed Fields */}
          {log.changedFields && log.changedFields.length > 0 && (
            <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800 bg-slate-800/50">
                <h2 className="font-semibold flex items-center gap-2">
                  <FiLayers />
                  Changed Fields
                </h2>
              </div>
              <div className="p-4">
                <div className="flex flex-wrap gap-2">
                  {log.changedFields.map((field) => (
                    <span key={field} className="px-3 py-1 rounded-full bg-slate-800 text-sm font-mono">
                      {field}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Before/After Comparison */}
          {(log.before || log.after) && (
            <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800 bg-slate-800/50">
                <h2 className="font-semibold flex items-center gap-2">
                  <FiGitCommit />
                  Changes
                </h2>
              </div>
              <div className="grid grid-cols-2 divide-x divide-slate-800">
                <div className="p-4">
                  <div className="text-sm text-slate-400 mb-2 font-medium">Before</div>
                  {log.before ? renderJsonValue(log.before) : <span className="text-slate-500">—</span>}
                </div>
                <div className="p-4">
                  <div className="text-sm text-slate-400 mb-2 font-medium">After</div>
                  {log.after ? renderJsonValue(log.after) : <span className="text-slate-500">—</span>}
                </div>
              </div>
            </div>
          )}

          {/* Details */}
          {log.details && Object.keys(log.details).length > 0 && (
            <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800 bg-slate-800/50">
                <h2 className="font-semibold flex items-center gap-2">
                  <FiInfo />
                  Details
                </h2>
              </div>
              <div className="p-4">
                {renderJsonValue(log.details)}
              </div>
            </div>
          )}

          {/* Metadata */}
          {log.metadata && (
            <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800 bg-slate-800/50">
                <h2 className="font-semibold">Metadata</h2>
              </div>
              <div className="p-4 grid grid-cols-2 gap-4">
                {log.metadata.source && (
                  <div>
                    <div className="text-sm text-slate-400 mb-1">Source</div>
                    <div className="capitalize">{log.metadata.source}</div>
                  </div>
                )}
                {log.metadata.userAgent && (
                  <div className="col-span-2">
                    <div className="text-sm text-slate-400 mb-1">User Agent</div>
                    <div className="text-sm font-mono text-slate-300 break-all">{log.metadata.userAgent}</div>
                  </div>
                )}
                {log.metadata.ipAddressHash && (
                  <div>
                    <div className="text-sm text-slate-400 mb-1">IP Address Hash</div>
                    <div className="text-sm font-mono">{log.metadata.ipAddressHash}</div>
                  </div>
                )}
                {log.metadata.correlationId && (
                  <div>
                    <div className="text-sm text-slate-400 mb-1">Correlation ID</div>
                    <div className="text-sm font-mono">{log.metadata.correlationId}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Integrity Information */}
          {(log.integrityHash || log.previousHash) && (
            <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800 bg-slate-800/50">
                <h2 className="font-semibold">Integrity</h2>
              </div>
              <div className="p-4 space-y-3">
                {log.integrityHash && (
                  <div>
                    <div className="text-sm text-slate-400 mb-1">Integrity Hash</div>
                    <div className="text-xs font-mono text-slate-300 break-all">{log.integrityHash}</div>
                  </div>
                )}
                {log.previousHash && (
                  <div>
                    <div className="text-sm text-slate-400 mb-1">Previous Hash</div>
                    <div className="text-xs font-mono text-slate-300 break-all">{log.previousHash}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Compliance Information */}
          {log.compliance && (
            <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800 bg-slate-800/50">
                <h2 className="font-semibold">Compliance</h2>
              </div>
              <div className="p-4 grid grid-cols-2 gap-4">
                {log.compliance.frameworks && log.compliance.frameworks.length > 0 && (
                  <div>
                    <div className="text-sm text-slate-400 mb-1">Frameworks</div>
                    <div className="flex flex-wrap gap-1">
                      {log.compliance.frameworks.map((fw) => (
                        <span key={fw} className="px-2 py-0.5 rounded bg-slate-800 text-xs">{fw}</span>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <div className="text-sm text-slate-400 mb-1">Retention Required</div>
                  <div>{log.compliance.retentionRequired ? 'Yes' : 'No'}</div>
                </div>
                {log.compliance.exportedAt && (
                  <div>
                    <div className="text-sm text-slate-400 mb-1">Exported At</div>
                    <div>{formatTimestamp(log.compliance.exportedAt)}</div>
                  </div>
                )}
                {log.compliance.exportedBy && (
                  <div>
                    <div className="text-sm text-slate-400 mb-1">Exported By</div>
                    <div>{log.compliance.exportedBy}</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
