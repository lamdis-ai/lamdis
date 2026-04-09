/**
 * Compliance Report Exporter
 *
 * Generates audit-ready export formats for test suite results.
 * Designed for compliance teams who need clear documentation
 * for auditors, regulators, and legal proceedings.
 */

import { db } from '../../db.js';
import { testRuns, testSuites, tests, organizations } from '@lamdis/db/schema';
import { eq, inArray } from 'drizzle-orm';

export interface ComplianceExportOptions {
  runId: string;
  format: 'pdf' | 'csv' | 'json';
  includeTranscripts?: boolean;
  includeJudgeReasoning?: boolean;
  includeTimestamps?: boolean;
  orgId?: string;
}

export interface TestResultItem {
  testId: string;
  testName: string;
  status: 'passed' | 'failed' | 'skipped' | 'error';
  score?: number;
  threshold?: number;
  reasoning?: string;
  transcript?: Array<{ role: string; content: string; timestamp?: string }>;
  assertions?: Array<{
    name?: string;
    pass: boolean;
    score?: number;
    threshold?: number;
    reasoning?: string;
    rubric?: string;
  }>;
  startedAt?: Date;
  finishedAt?: Date;
  durationMs?: number;
  error?: string;
}

export interface ComplianceReport {
  reportId: string;
  generatedAt: string;
  exportFormat: string;

  organization: {
    id: string;
    name: string;
  };

  suite: {
    id: string;
    name: string;
    description?: string;
  };

  run: {
    id: string;
    status: string;
    trigger: string;
    startedAt: string;
    finishedAt?: string;
    durationMs?: number;
  };

  summary: {
    totalTests: number;
    passed: number;
    failed: number;
    skipped: number;
    passRate: string;
  };

  results: TestResultItem[];

  auditInfo: {
    exportedBy?: string;
    exportedAt: string;
    checksum?: string;
  };
}

/**
 * Generate a compliance report from a test run
 */
export async function generateComplianceReport(opts: ComplianceExportOptions): Promise<ComplianceReport> {
  const { runId, format, includeTranscripts = true, includeJudgeReasoning = true } = opts;

  // Fetch run data
  const [run] = await db.select().from(testRuns).where(eq(testRuns.id, runId)).limit(1);
  if (!run) {
    throw new Error(`Run not found: ${runId}`);
  }

  // Fetch suite data
  const [suite] = run.suiteId
    ? await db.select().from(testSuites).where(eq(testSuites.id, run.suiteId)).limit(1)
    : [null];

  // Fetch org data
  const [org] = run.orgId
    ? await db.select().from(organizations).where(eq(organizations.id, run.orgId)).limit(1)
    : [null];

  // Fetch test names
  const items = run.items || [];
  const testIds = items.map((i: any) => i.testId).filter(Boolean);
  const testRows = testIds.length > 0
    ? await db.select().from(tests).where(inArray(tests.id, testIds))
    : [];
  const testNameMap = new Map(testRows.map(t => [t.id, t.name]));

  // Normalize result data
  const totals = run.totals || {} as any;

  // Calculate totals
  const totalTests = Number(totals.total) || items.length || 0;
  const passed = Number(totals.passed) || items.filter((i: any) => i.status === 'passed').length;
  const failed = Number(totals.failed) || items.filter((i: any) => i.status === 'failed').length;
  const skipped = Number(totals.skipped) || items.filter((i: any) => i.status === 'skipped').length;
  const passRate = totalTests > 0 ? ((passed / totalTests) * 100).toFixed(1) + '%' : '0%';

  // Process test results
  const results: TestResultItem[] = items.map((item: any) => {
    const testName = item.testName || testNameMap.get(String(item.testId)) || item.testId || 'Unknown Test';

    const assertions = [
      ...(Array.isArray(item.assertions) ? item.assertions : []),
      ...(Array.isArray(item.confirmations) ? item.confirmations : []),
    ].map((a: any) => ({
      name: a.name || a.rubric?.slice(0, 50) || 'Assertion',
      pass: a.pass,
      score: a.score,
      threshold: a.threshold,
      reasoning: includeJudgeReasoning ? a.reasoning : undefined,
      rubric: a.rubric,
    }));

    const transcript = includeTranscripts && Array.isArray(item.transcript)
      ? item.transcript.map((m: any) => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp,
        }))
      : undefined;

    const startedAt = item.startedAt ? new Date(item.startedAt) : undefined;
    const finishedAt = item.finishedAt ? new Date(item.finishedAt) : undefined;
    const durationMs = startedAt && finishedAt
      ? finishedAt.getTime() - startedAt.getTime()
      : undefined;

    return {
      testId: item.testId || '',
      testName,
      status: item.status || 'unknown',
      score: item.score,
      threshold: item.threshold,
      reasoning: includeJudgeReasoning ? item.reasoning : undefined,
      transcript,
      assertions,
      startedAt,
      finishedAt,
      durationMs,
      error: item.error?.message || item.error,
    };
  });

  // Calculate run duration
  const runStartedAt = run.startedAt ? new Date(run.startedAt) : undefined;
  const runFinishedAt = run.finishedAt ? new Date(run.finishedAt) : undefined;
  const runDurationMs = runStartedAt && runFinishedAt
    ? runFinishedAt.getTime() - runStartedAt.getTime()
    : undefined;

  const reportId = `CR-${Date.now().toString(36).toUpperCase()}-${runId.slice(-6).toUpperCase()}`;
  const generatedAt = new Date().toISOString();

  const report: ComplianceReport = {
    reportId,
    generatedAt,
    exportFormat: format,

    organization: {
      id: run.orgId || '',
      name: (org as any)?.name || (org as any)?.displayName || 'Organization',
    },

    suite: {
      id: run.suiteId || '',
      name: suite?.name || 'Test Suite',
      description: suite?.description || undefined,
    },

    run: {
      id: runId,
      status: run.status || 'unknown',
      trigger: run.trigger || 'manual',
      startedAt: runStartedAt?.toISOString() || '',
      finishedAt: runFinishedAt?.toISOString(),
      durationMs: runDurationMs,
    },

    summary: {
      totalTests,
      passed,
      failed,
      skipped,
      passRate,
    },

    results,

    auditInfo: {
      exportedAt: generatedAt,
      checksum: generateChecksum(runId, generatedAt),
    },
  };

  return report;
}

function generateChecksum(runId: string, timestamp: string): string {
  const input = `${runId}:${timestamp}`;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).toUpperCase().padStart(8, '0');
}

export function formatAsCSV(report: ComplianceReport): string {
  const lines: string[] = [];

  lines.push('# COMPLIANCE TEST REPORT');
  lines.push(`# Report ID: ${report.reportId}`);
  lines.push(`# Generated: ${report.generatedAt}`);
  lines.push(`# Organization: ${report.organization.name}`);
  lines.push(`# Suite: ${report.suite.name}`);
  lines.push(`# Run Status: ${report.run.status.toUpperCase()}`);
  lines.push(`# Pass Rate: ${report.summary.passRate}`);
  lines.push('');

  lines.push('SUMMARY');
  lines.push('Total Tests,Passed,Failed,Skipped,Pass Rate');
  lines.push(`${report.summary.totalTests},${report.summary.passed},${report.summary.failed},${report.summary.skipped},${report.summary.passRate}`);
  lines.push('');

  lines.push('TEST RESULTS');
  lines.push('Test Name,Status,Score,Threshold,Duration (ms),Error');

  for (const result of report.results) {
    const row = [
      escapeCSV(result.testName),
      result.status.toUpperCase(),
      result.score?.toFixed(2) || '',
      result.threshold?.toFixed(2) || '',
      result.durationMs?.toString() || '',
      escapeCSV(result.error || ''),
    ];
    lines.push(row.join(','));
  }

  lines.push('');
  lines.push('ASSERTION DETAILS');
  lines.push('Test Name,Assertion,Pass/Fail,Score,Threshold,Reasoning');

  for (const result of report.results) {
    if (result.assertions && result.assertions.length > 0) {
      for (const assertion of result.assertions) {
        const row = [
          escapeCSV(result.testName),
          escapeCSV(assertion.name || ''),
          assertion.pass ? 'PASS' : 'FAIL',
          assertion.score?.toFixed(2) || '',
          assertion.threshold?.toFixed(2) || '',
          escapeCSV(assertion.reasoning || ''),
        ];
        lines.push(row.join(','));
      }
    }
  }

  lines.push('');
  lines.push('# AUDIT INFORMATION');
  lines.push(`# Exported At: ${report.auditInfo.exportedAt}`);
  lines.push(`# Checksum: ${report.auditInfo.checksum}`);

  return lines.join('\n');
}

function escapeCSV(value: string): string {
  if (!value) return '';
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function formatAsJSON(report: ComplianceReport): string {
  return JSON.stringify(report, null, 2);
}

export function formatAsPDFHTML(report: ComplianceReport): string {
  const statusColor = report.run.status === 'passed' ? '#10b981' :
                      report.run.status === 'failed' ? '#ef4444' : '#6b7280';

  const formatDuration = (ms?: number) => {
    if (!ms) return 'N/A';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const mins = Math.floor(ms / 60000);
    const secs = Math.round((ms % 60000) / 1000);
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  };

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Compliance Test Report - ${report.reportId}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; line-height: 1.5; color: #1f2937; background: white; padding: 40px; }
    .header { border-bottom: 3px solid #1f2937; padding-bottom: 20px; margin-bottom: 30px; }
    .header h1 { font-size: 24px; font-weight: 700; color: #1f2937; margin-bottom: 8px; }
    .header-meta { display: flex; gap: 30px; flex-wrap: wrap; font-size: 11px; color: #6b7280; }
    .header-meta span { display: flex; gap: 5px; }
    .header-meta strong { color: #374151; }
    .status-badge { display: inline-block; padding: 4px 12px; border-radius: 4px; font-weight: 600; font-size: 12px; text-transform: uppercase; color: white; background: ${statusColor}; }
    .section { margin-bottom: 30px; }
    .section-title { font-size: 14px; font-weight: 700; color: #374151; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; margin-bottom: 15px; text-transform: uppercase; letter-spacing: 0.5px; }
    .summary-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 15px; }
    .summary-item { text-align: center; padding: 15px; border: 1px solid #e5e7eb; border-radius: 6px; }
    .summary-item .value { font-size: 28px; font-weight: 700; color: #1f2937; }
    .summary-item .label { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; }
    .summary-item.passed .value { color: #10b981; }
    .summary-item.failed .value { color: #ef4444; }
    .info-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
    .info-box { padding: 15px; background: #f9fafb; border-radius: 6px; }
    .info-box h3 { font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px; }
    .info-row { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #e5e7eb; }
    .info-row:last-child { border-bottom: none; }
    .info-row .label { color: #6b7280; }
    .info-row .value { font-weight: 500; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #e5e7eb; }
    th { background: #f9fafb; font-weight: 600; color: #374151; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px; }
    tr:hover { background: #f9fafb; }
    .status-cell { font-weight: 600; }
    .status-cell.passed { color: #10b981; }
    .status-cell.failed { color: #ef4444; }
    .status-cell.skipped { color: #6b7280; }
    .assertion-box { margin-top: 10px; padding: 10px; background: #f3f4f6; border-radius: 4px; font-size: 10px; }
    .assertion-item { display: flex; align-items: flex-start; gap: 8px; padding: 6px 0; border-bottom: 1px solid #e5e7eb; }
    .assertion-item:last-child { border-bottom: none; }
    .assertion-status { font-weight: 600; min-width: 40px; }
    .assertion-status.pass { color: #10b981; }
    .assertion-status.fail { color: #ef4444; }
    .assertion-content { flex: 1; }
    .assertion-name { font-weight: 500; margin-bottom: 2px; }
    .assertion-reasoning { color: #6b7280; font-style: italic; }
    .transcript-box { margin-top: 10px; border: 1px solid #e5e7eb; border-radius: 4px; max-height: 200px; overflow-y: auto; }
    .transcript-message { padding: 8px 12px; border-bottom: 1px solid #e5e7eb; }
    .transcript-message:last-child { border-bottom: none; }
    .transcript-message.user { background: #eff6ff; }
    .transcript-message.assistant { background: #f9fafb; }
    .transcript-role { font-size: 9px; font-weight: 600; text-transform: uppercase; color: #6b7280; margin-bottom: 4px; }
    .transcript-content { font-size: 10px; white-space: pre-wrap; word-break: break-word; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 2px solid #e5e7eb; font-size: 10px; color: #6b7280; }
    .footer-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
    .signature-line { margin-top: 30px; border-top: 1px solid #9ca3af; padding-top: 8px; }
    @media print { body { padding: 20px; } .section { page-break-inside: avoid; } .transcript-box { max-height: none; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>Compliance Test Report</h1>
    <div class="header-meta">
      <span><strong>Report ID:</strong> ${report.reportId}</span>
      <span><strong>Generated:</strong> ${new Date(report.generatedAt).toLocaleString()}</span>
      <span><strong>Status:</strong> <span class="status-badge">${report.run.status}</span></span>
    </div>
  </div>

  <div class="section">
    <div class="info-grid">
      <div class="info-box">
        <h3>Organization</h3>
        <div class="info-row"><span class="label">Name</span><span class="value">${escapeHTML(report.organization.name)}</span></div>
        <div class="info-row"><span class="label">ID</span><span class="value" style="font-family: monospace;">${report.organization.id}</span></div>
      </div>
      <div class="info-box">
        <h3>Test Suite</h3>
        <div class="info-row"><span class="label">Name</span><span class="value">${escapeHTML(report.suite.name)}</span></div>
        ${report.suite.description ? `<div class="info-row"><span class="label">Description</span><span class="value">${escapeHTML(report.suite.description)}</span></div>` : ''}
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Summary</div>
    <div class="summary-grid">
      <div class="summary-item"><div class="value">${report.summary.totalTests}</div><div class="label">Total Tests</div></div>
      <div class="summary-item passed"><div class="value">${report.summary.passed}</div><div class="label">Passed</div></div>
      <div class="summary-item failed"><div class="value">${report.summary.failed}</div><div class="label">Failed</div></div>
      <div class="summary-item"><div class="value">${report.summary.skipped}</div><div class="label">Skipped</div></div>
      <div class="summary-item"><div class="value">${report.summary.passRate}</div><div class="label">Pass Rate</div></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Run Information</div>
    <div class="info-grid">
      <div class="info-box">
        <div class="info-row"><span class="label">Run ID</span><span class="value" style="font-family: monospace;">${report.run.id}</span></div>
        <div class="info-row"><span class="label">Trigger</span><span class="value">${report.run.trigger}</span></div>
      </div>
      <div class="info-box">
        <div class="info-row"><span class="label">Started</span><span class="value">${report.run.startedAt ? new Date(report.run.startedAt).toLocaleString() : 'N/A'}</span></div>
        <div class="info-row"><span class="label">Duration</span><span class="value">${formatDuration(report.run.durationMs)}</span></div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Test Results</div>
    <table>
      <thead>
        <tr>
          <th style="width: 30%">Test Name</th>
          <th style="width: 10%">Status</th>
          <th style="width: 10%">Score</th>
          <th style="width: 10%">Duration</th>
          <th style="width: 40%">Details</th>
        </tr>
      </thead>
      <tbody>
        ${report.results.map(result => `
        <tr>
          <td><strong>${escapeHTML(result.testName)}</strong></td>
          <td class="status-cell ${result.status}">${result.status.toUpperCase()}</td>
          <td>${result.score != null ? result.score.toFixed(2) : '-'}</td>
          <td>${formatDuration(result.durationMs)}</td>
          <td>
            ${result.error ? `<div style="color: #ef4444;"><strong>Error:</strong> ${escapeHTML(result.error)}</div>` : ''}
            ${result.assertions && result.assertions.length > 0 ? `
            <div class="assertion-box">
              <strong>Assertions (${result.assertions.filter(a => a.pass).length}/${result.assertions.length} passed)</strong>
              ${result.assertions.map(a => `
              <div class="assertion-item">
                <span class="assertion-status ${a.pass ? 'pass' : 'fail'}">${a.pass ? 'PASS' : 'FAIL'}</span>
                <div class="assertion-content">
                  <div class="assertion-name">${escapeHTML(a.name || 'Unnamed assertion')}</div>
                  ${a.reasoning ? `<div class="assertion-reasoning">${escapeHTML(a.reasoning)}</div>` : ''}
                </div>
              </div>
              `).join('')}
            </div>
            ` : ''}
          </td>
        </tr>
        `).join('')}
      </tbody>
    </table>
  </div>

  ${report.results.some(r => r.transcript && r.transcript.length > 0) ? `
  <div class="section">
    <div class="section-title">Conversation Transcripts</div>
    ${report.results.filter(r => r.transcript && r.transcript.length > 0).map(result => `
    <div style="margin-bottom: 20px;">
      <h4 style="font-size: 12px; margin-bottom: 8px;">${escapeHTML(result.testName)}</h4>
      <div class="transcript-box">
        ${result.transcript!.map(m => `
        <div class="transcript-message ${m.role}">
          <div class="transcript-role">${m.role === 'user' ? 'Test User' : 'Assistant'}</div>
          <div class="transcript-content">${escapeHTML(m.content)}</div>
        </div>
        `).join('')}
      </div>
    </div>
    `).join('')}
  </div>
  ` : ''}

  <div class="footer">
    <div class="footer-grid">
      <div><strong>Report ID:</strong> ${report.reportId}<br><strong>Checksum:</strong> ${report.auditInfo.checksum}</div>
      <div><strong>Generated:</strong><br>${new Date(report.auditInfo.exportedAt).toLocaleString()}</div>
      <div><strong>Format:</strong> ${report.exportFormat.toUpperCase()}<br><strong>Version:</strong> 1.0</div>
    </div>
    <div class="signature-line"><strong>Reviewer Signature:</strong> ___________________________________ Date: _______________</div>
  </div>
</body>
</html>
  `.trim();
}

function escapeHTML(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Main export function
 */
export async function exportComplianceReport(opts: ComplianceExportOptions): Promise<{
  content: string;
  contentType: string;
  filename: string;
}> {
  const report = await generateComplianceReport(opts);

  let content: string;
  let contentType: string;
  let extension: string;

  switch (opts.format) {
    case 'csv':
      content = formatAsCSV(report);
      contentType = 'text/csv; charset=utf-8';
      extension = 'csv';
      break;
    case 'json':
      content = formatAsJSON(report);
      contentType = 'application/json; charset=utf-8';
      extension = 'json';
      break;
    case 'pdf':
    default:
      content = formatAsPDFHTML(report);
      contentType = 'text/html; charset=utf-8';
      extension = 'html';
      break;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `compliance-report-${report.reportId}-${timestamp}.${extension}`;

  return { content, contentType, filename };
}
