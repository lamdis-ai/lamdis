import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db.js';
import { actions } from '@lamdis/db/schema';
import {
  outcomeTypes,
  proofExpectations,
  outcomeInstances,
  evidenceEvents,
} from '@lamdis/db/schema';
import { actionExecutions, decisionDossiers } from '@lamdis/db/schema';
import { eq, and, like, inArray } from 'drizzle-orm';
import crypto from 'crypto';

function resolveOrgId(req: FastifyRequest, reply: FastifyReply): string | null {
  const { orgId } = req.params as { orgId?: string };
  if (!orgId) {
    reply.code(400).send({ error: 'Missing orgId' });
    return null;
  }
  return orgId;
}

const DEMO_ACTION_DEFS = [
  { actionId: 'demo-send-email', title: 'Send Email', description: 'Send transactional or notification emails', method: 'POST', path: '/email/send' },
  { actionId: 'demo-create-ticket', title: 'Create Support Ticket', description: 'Open a ticket in the support system', method: 'POST', path: '/tickets' },
  { actionId: 'demo-update-crm', title: 'Update CRM Record', description: 'Update customer record in CRM', method: 'PUT', path: '/crm/contacts/{id}' },
  { actionId: 'demo-process-payment', title: 'Process Payment', description: 'Initiate or refund a payment transaction', method: 'POST', path: '/payments/process' },
  { actionId: 'demo-generate-pdf', title: 'Generate PDF Document', description: 'Generate a PDF report or certificate', method: 'POST', path: '/documents/generate' },
  { actionId: 'demo-slack-message', title: 'Send Slack Message', description: 'Post a message to a Slack channel', method: 'POST', path: '/slack/messages' },
  { actionId: 'demo-update-db', title: 'Update Database Record', description: 'Directly update an internal database record', method: 'PUT', path: '/db/records/{table}/{id}' },
  { actionId: 'demo-verify-identity', title: 'Verify Identity', description: 'Run identity verification check via third-party', method: 'POST', path: '/identity/verify' },
  { actionId: 'demo-schedule-followup', title: 'Schedule Follow-up', description: 'Schedule a follow-up task or reminder', method: 'POST', path: '/calendar/events' },
  { actionId: 'demo-close-account', title: 'Close Account', description: 'Mark an account as closed and trigger cleanup', method: 'POST', path: '/accounts/{id}/close' },
];

const DEMO_OUTCOME_DEFS = [
  {
    name: 'Customer Account Closure',
    description: 'Ensure customer account closure requests are processed completely with all compliance requirements met, final statements generated, and retention offers attempted.',
    riskClass: 'high',
    category: 'financial',
    successCriteria: [
      { name: 'All balances settled', description: 'Outstanding balances paid or credited to zero', threshold: 1.0, unit: '%' },
      { name: 'Compliance docs generated', description: 'Final statement and tax documents created', threshold: 1.0, unit: '%' },
      { name: 'Retention offer attempted', description: 'Customer was offered at least one retention incentive', threshold: 0.95, unit: '%' },
    ],
    keyDecisions: [
      { name: 'Approve closure', description: 'Final approval to close the account', automationMode: 'supervised', requiresHumanApproval: true },
      { name: 'Issue final refund', description: 'Calculate and issue remaining balance refund', automationMode: 'autonomous', requiresHumanApproval: false },
      { name: 'Escalate to retention', description: 'Route to retention team if high-value customer', automationMode: 'supervised', requiresHumanApproval: false },
    ],
    automationBoundaries: [
      { name: 'High-value account threshold', description: 'Accounts over $50k require manual approval', maxAutonomyLevel: 'supervised', escalationTrigger: 'balance > 50000' },
      { name: 'Regulatory hold', description: 'Accounts under investigation cannot be auto-closed', maxAutonomyLevel: 'manual', escalationTrigger: 'regulatory_hold = true' },
    ],
    connectedActions: ['demo-close-account', 'demo-send-email', 'demo-generate-pdf', 'demo-update-crm', 'demo-process-payment'],
  },
  {
    name: 'Insurance Claim Resolution',
    description: 'Track insurance claims from filing through investigation, adjudication, and settlement, ensuring regulatory compliance and fair outcomes.',
    riskClass: 'critical',
    category: 'compliance',
    successCriteria: [
      { name: 'Claim adjudicated within SLA', description: 'Decision made within 30-day regulatory window', threshold: 0.98, unit: '%' },
      { name: 'Documentation complete', description: 'All required claim documents collected and verified', threshold: 1.0, unit: '%' },
      { name: 'Fraud screening passed', description: 'Automated and manual fraud checks completed', threshold: 1.0, unit: '%' },
      { name: 'Claimant notified', description: 'Claimant received decision notification', threshold: 1.0, unit: '%' },
    ],
    keyDecisions: [
      { name: 'Approve claim payout', description: 'Authorize claim settlement payment', automationMode: 'supervised', requiresHumanApproval: true },
      { name: 'Flag for investigation', description: 'Route suspicious claims to SIU', automationMode: 'autonomous', requiresHumanApproval: false },
    ],
    automationBoundaries: [
      { name: 'Payout limit', description: 'Claims over $10k require adjuster review', maxAutonomyLevel: 'supervised', escalationTrigger: 'amount > 10000' },
      { name: 'Fraud score threshold', description: 'Fraud score > 0.7 blocks auto-approval', maxAutonomyLevel: 'manual', escalationTrigger: 'fraud_score > 0.7' },
      { name: 'Regulatory audit trail', description: 'All decisions must have complete dossier', maxAutonomyLevel: 'supervised', escalationTrigger: 'missing_dossier' },
    ],
    connectedActions: ['demo-send-email', 'demo-create-ticket', 'demo-generate-pdf', 'demo-process-payment', 'demo-verify-identity'],
  },
  {
    name: 'Employee Onboarding Completion',
    description: 'Ensure new employees complete all onboarding steps: IT provisioning, training modules, compliance certifications, and team introductions.',
    riskClass: 'medium',
    category: 'operational',
    successCriteria: [
      { name: 'IT systems provisioned', description: 'All required system accesses granted', threshold: 1.0, unit: '%' },
      { name: 'Training completed', description: 'Required training modules finished', threshold: 0.95, unit: '%' },
      { name: 'Compliance certs signed', description: 'All compliance documents acknowledged', threshold: 1.0, unit: '%' },
    ],
    keyDecisions: [
      { name: 'Grant system access', description: 'Provision access to internal systems', automationMode: 'autonomous', requiresHumanApproval: false },
      { name: 'Assign training path', description: 'Select role-appropriate training modules', automationMode: 'autonomous', requiresHumanApproval: false },
      { name: 'Confirm onboarding complete', description: 'Mark onboarding as finished after all steps done', automationMode: 'supervised', requiresHumanApproval: true },
    ],
    automationBoundaries: [
      { name: 'Elevated access review', description: 'Admin-level access requires manager approval', maxAutonomyLevel: 'supervised', escalationTrigger: 'access_level = admin' },
    ],
    connectedActions: ['demo-send-email', 'demo-slack-message', 'demo-update-db', 'demo-schedule-followup', 'demo-create-ticket'],
  },
];

const CHECK_TYPES = ['event_presence', 'event_sequence', 'confirmation_level', 'judge', 'includes', 'regex', 'json_path', 'timing'] as const;

function buildProofExpectations(outcomeName: string): Array<{ name: string; checkType: string; description: string; severity: string }> {
  if (outcomeName === 'Customer Account Closure') {
    return [
      { name: 'Closure request received', checkType: 'event_presence', description: 'Initial closure request event must be received', severity: 'error' },
      { name: 'Balance verification sequence', checkType: 'event_sequence', description: 'Balance check → settlement → zero-balance events in order', severity: 'error' },
      { name: 'Compliance grade met', checkType: 'confirmation_level', description: 'Compliance review must reach grade B or higher', severity: 'error' },
      { name: 'Retention offer quality', checkType: 'judge', description: 'LLM evaluates retention offer was genuine and appropriate', severity: 'warning' },
      { name: 'Final statement contains required fields', checkType: 'includes', description: 'Statement includes account summary and tax info', severity: 'error' },
      { name: 'Closure completed within SLA', checkType: 'timing', description: 'Closure completed within 5 business days', severity: 'warning' },
    ];
  }
  if (outcomeName === 'Insurance Claim Resolution') {
    return [
      { name: 'Claim filed event', checkType: 'event_presence', description: 'Claim filing event received from intake system', severity: 'error' },
      { name: 'Investigation workflow', checkType: 'event_sequence', description: 'Filing → assessment → adjudication events in order', severity: 'error' },
      { name: 'Evidence confirmation level', checkType: 'confirmation_level', description: 'Supporting evidence reaches grade A confirmation', severity: 'error' },
      { name: 'Fair adjudication review', checkType: 'judge', description: 'LLM reviews adjudication decision for fairness and compliance', severity: 'error' },
      { name: 'Claim ID format valid', checkType: 'regex', description: 'Claim ID matches expected CLM-YYYY-NNNNNN format', severity: 'warning' },
      { name: 'Settlement amount field present', checkType: 'json_path', description: '$.settlement.amount exists and is positive', severity: 'error' },
    ];
  }
  // Employee Onboarding
  return [
    { name: 'Onboarding initiated', checkType: 'event_presence', description: 'HR system emitted onboarding start event', severity: 'error' },
    { name: 'Provisioning sequence', checkType: 'event_sequence', description: 'Account created → access granted → training assigned', severity: 'error' },
    { name: 'Training completion confirmed', checkType: 'includes', description: 'Training report contains "all modules completed"', severity: 'error' },
    { name: 'Compliance doc pattern', checkType: 'regex', description: 'Signed document references match DOC-\\d{4} pattern', severity: 'warning' },
    { name: 'Onboarding completed on time', checkType: 'timing', description: 'Full onboarding completed within 14 days', severity: 'warning' },
  ];
}

const PROOF_STATUSES = ['gathering', 'partial', 'proven'] as const;

function buildEvidenceEvents(instanceId: string, orgId: string, outcomeName: string, instanceIndex: number): Array<any> {
  const now = Date.now();
  const base = now - 86400000 * (3 - instanceIndex); // stagger by days
  const events = [];
  const eventTypes = outcomeName === 'Customer Account Closure'
    ? ['closure.requested', 'balance.checked', 'retention.offered', 'settlement.processed', 'compliance.reviewed', 'statement.generated', 'account.closed']
    : outcomeName === 'Insurance Claim Resolution'
    ? ['claim.filed', 'documents.collected', 'fraud.screened', 'assessment.started', 'adjudication.completed', 'settlement.approved', 'claimant.notified']
    : ['onboarding.initiated', 'account.created', 'access.granted', 'training.assigned', 'training.progress', 'compliance.signed', 'onboarding.completed'];

  const count = 5 + instanceIndex * 2; // 5-9 events
  for (let i = 0; i < Math.min(count, eventTypes.length); i++) {
    events.push({
      orgId,
      outcomeInstanceId: instanceId,
      eventType: eventTypes[i],
      eventSource: 'demo-simulator',
      payload: { demo: true, step: i + 1, detail: `Demo event for ${outcomeName}`, timestamp: new Date(base + i * 3600000).toISOString() },
      confirmationLevel: i < 3 ? 'A' : 'B',
      sequenceNumber: i + 1,
      emittedAt: new Date(base + i * 3600000),
      receivedAt: new Date(base + i * 3600000 + 500),
      processedAt: new Date(base + i * 3600000 + 1000),
    });
  }
  return events;
}

const routes: FastifyPluginAsync = async (app) => {
  // Legacy demo protected endpoint
  app.get('/demo/protected', async (req, reply) => {
    const auth = req.headers['authorization'];
    if (!auth || typeof auth !== 'string' || !/^Bearer\s+/.test(auth)) {
      return reply.code(401).send({ error: 'Unauthorized: missing Bearer token' });
    }
    const token = auth.replace(/^Bearer\s+/i, '').trim();
    return { ok: true, tokenPreview: token.slice(0, 6) + '\u2026', message: 'Demo protected resource access granted.' };
  });

  // =========================================================================
  // DEMO PROVISION
  // =========================================================================
  app.post('/orgs/:orgId/demo/provision', async (req, reply) => {
    const orgId = resolveOrgId(req, reply);
    if (!orgId) return;

    // Idempotency: check if demo actions already exist
    const existingDemoActions = await db.select().from(actions)
      .where(and(eq(actions.orgId, orgId), like(actions.actionId, 'demo-%')));

    if (existingDemoActions.length > 0) {
      return reply.send({ success: true, message: 'Demo data already provisioned', created: { outcomeTypes: [], actions: existingDemoActions.length, instances: 0, events: 0, executions: 0 } });
    }

    // Create mock actions
    const createdActions: any[] = [];
    for (const def of DEMO_ACTION_DEFS) {
      const [a] = await db.insert(actions).values({
        orgId,
        actionId: def.actionId,
        title: def.title,
        description: def.description,
        method: def.method,
        path: def.path,
        isMock: true,
        staticResponse: { content: JSON.stringify({ success: true, demo: true, action: def.actionId }), content_type: 'application/json', status: 200 },
      }).returning();
      createdActions.push(a);
    }

    const actionIdMap: Record<string, string> = {};
    for (const a of createdActions) {
      actionIdMap[a.actionId] = a.id;
    }

    // Create outcome types
    const createdOutcomeTypes: any[] = [];
    const outcomeTypeMap: Record<string, string> = {};

    for (const def of DEMO_OUTCOME_DEFS) {
      const connectedSystems = def.connectedActions.map(aid => ({
        systemId: actionIdMap[aid],
        name: createdActions.find(a => a.actionId === aid)?.title || aid,
        role: 'action',
      }));

      const [ot] = await db.insert(outcomeTypes).values({
        orgId,
        name: def.name,
        description: def.description,
        riskClass: def.riskClass,
        category: def.category,
        successCriteria: def.successCriteria.map(c => ({ description: `${c.name}: ${c.description} (${c.threshold}${c.unit})`, weight: c.threshold })),
        keyDecisions: def.keyDecisions.map(d => ({ name: d.name, description: d.description, automatable: d.automationMode === 'autonomous' })),
        automationBoundaries: {
          maxAutoApproveRisk: def.riskClass,
          requireHumanAbove: 0.8,
          allowedAutoActions: def.connectedActions.slice(0, 3),
        },
        connectedSystems,
      }).returning();
      createdOutcomeTypes.push(ot);
      outcomeTypeMap[def.name] = ot.id;
    }

    // Create proof expectations
    let totalProofs = 0;
    for (const def of DEMO_OUTCOME_DEFS) {
      const proofs = buildProofExpectations(def.name);
      for (const proof of proofs) {
        await db.insert(proofExpectations).values({
          orgId,
          outcomeTypeId: outcomeTypeMap[def.name],
          name: proof.name,
          description: proof.description,
          checkType: proof.checkType as any,
          severity: proof.severity as any,
          category: 'compliance' as any,
          config: {},
          requiredEvidenceLevel: 'A' as any,
          judgeThreshold: 0.75,
          onPass: [],
          onFail: [],
        });
        totalProofs++;
      }
    }

    // Create outcome instances (2-3 per type)
    const createdInstances: any[] = [];
    let totalEvents = 0;
    let totalExecutions = 0;
    let totalDossiers = 0;

    for (const def of DEMO_OUTCOME_DEFS) {
      const outcomeTypeId = outcomeTypeMap[def.name];
      const instanceCount = def.name === 'Insurance Claim Resolution' ? 3 : 2;

      for (let i = 0; i < instanceCount; i++) {
        const proofStatus = PROOF_STATUSES[i % PROOF_STATUSES.length];
        const confidence = proofStatus === 'proven' ? 0.95 : proofStatus === 'partial' ? 0.6 : 0.2;

        const [inst] = await db.insert(outcomeInstances).values({
          orgId,
          outcomeTypeId,
          environment: 'demo',
          trigger: 'demo-provision',
          status: proofStatus === 'proven' ? 'completed' : 'active',
          proofStatus,
          confidenceScore: confidence,
          automationMode: i === 0 ? 'autonomous' : 'supervised',
          eventCount: 0,
        }).returning();
        createdInstances.push(inst);

        // Create evidence events
        const events = buildEvidenceEvents(inst.id, orgId, def.name, i);
        for (const evt of events) {
          await db.insert(evidenceEvents).values(evt);
          totalEvents++;
        }

        // Update event count
        await db.update(outcomeInstances).set({ eventCount: events.length, firstEventAt: events[0]?.emittedAt, lastEventAt: events[events.length - 1]?.emittedAt }).where(eq(outcomeInstances.id, inst.id));

        // Create action executions (2-3 per instance)
        const actionStatuses = ['completed', 'proposed', 'blocked'] as const;
        const instanceActions = def.connectedActions.slice(0, 2 + i);
        for (let j = 0; j < instanceActions.length && j < 3; j++) {
          const aId = actionIdMap[instanceActions[j]];
          if (!aId) continue;
          const [exec] = await db.insert(actionExecutions).values({
            orgId,
            outcomeInstanceId: inst.id,
            actionId: aId,
            proposedBy: 'system',
            status: actionStatuses[j % actionStatuses.length],
            proofThresholdMet: j === 0,
            riskClass: def.riskClass,
            blockedReason: j === 2 ? 'Exceeded automation boundary threshold' : undefined,
            executionLog: j === 0 ? { steps: [{ step: 'execute', status: 'completed', at: new Date().toISOString() }], result: { success: true } } : undefined,
            startedAt: j === 0 ? new Date() : undefined,
            completedAt: j === 0 ? new Date() : undefined,
          }).returning();
          totalExecutions++;

          // Create dossier for completed/proposed executions
          if (j < 2) {
            await db.insert(decisionDossiers).values({
              orgId,
              outcomeInstanceId: inst.id,
              actionExecutionId: exec.id,
              decisionType: j === 0 ? 'auto_executed' : 'action_proposed',
              summary: j === 0 ? `Automatically executed ${instanceActions[j].replace('demo-', '')} based on proof threshold` : `Proposed ${instanceActions[j].replace('demo-', '')} pending approval`,
              confidenceScore: confidence,
              factsConsidered: [{ fact: 'Demo evidence collected', source: 'demo-simulator', weight: 1.0 }],
              evidenceIds: [],
              proofChain: [],
              actor: 'system',
            });
            totalDossiers++;
          }
        }
      }
    }

    return reply.code(201).send({
      success: true,
      created: {
        outcomeTypes: createdOutcomeTypes,
        actions: createdActions.length,
        proofExpectations: totalProofs,
        instances: createdInstances.length,
        events: totalEvents,
        executions: totalExecutions,
        dossiers: totalDossiers,
      },
    });
  });

  // =========================================================================
  // DEMO SIMULATE
  // =========================================================================
  app.post('/orgs/:orgId/demo/simulate/:outcomeTypeId', async (req, reply) => {
    const orgId = resolveOrgId(req, reply);
    if (!orgId) return;
    const { outcomeTypeId } = req.params as { outcomeTypeId: string };

    // Look up outcome type
    const [ot] = await db.select().from(outcomeTypes)
      .where(and(eq(outcomeTypes.id, outcomeTypeId), eq(outcomeTypes.orgId, orgId)))
      .limit(1);
    if (!ot) return reply.code(404).send({ error: 'Outcome type not found' });

    // Look up proof expectations for this outcome type
    const proofs = await db.select().from(proofExpectations)
      .where(eq(proofExpectations.outcomeTypeId, outcomeTypeId));

    // Look up connected actions
    const connectedSystems = (ot.connectedSystems as any[]) || [];
    const connectedActionIds = connectedSystems
      .filter((s: any) => s.systemId)
      .map((s: any) => s.systemId)
      .slice(0, 3);

    let connectedActionRows: any[] = [];
    if (connectedActionIds.length > 0) {
      connectedActionRows = await db.select().from(actions)
        .where(inArray(actions.id, connectedActionIds));
    }

    // Determine event types based on outcome name
    const eventTypeMap: Record<string, Array<{ type: string; source: string; description: string; level: string }>> = {
      'Customer Account Closure': [
        { type: 'closure.requested', source: 'customer-portal', description: 'Customer submitted account closure request via self-service portal', level: 'A' },
        { type: 'balance.checked', source: 'billing-system', description: 'Outstanding balance verified: $142.50 remaining', level: 'B' },
        { type: 'retention.offered', source: 'retention-engine', description: 'Retention offer presented: 3 months free + loyalty bonus', level: 'B' },
        { type: 'retention.declined', source: 'customer-portal', description: 'Customer declined retention offer, confirmed closure intent', level: 'C' },
        { type: 'settlement.processed', source: 'payment-gateway', description: 'Final balance of $142.50 settled via original payment method', level: 'D' },
        { type: 'compliance.reviewed', source: 'compliance-engine', description: 'Data retention requirements verified, 7-year archive initiated', level: 'D' },
        { type: 'statement.generated', source: 'document-service', description: 'Final account statement and tax documents generated', level: 'E' },
      ],
      'Insurance Claim Resolution': [
        { type: 'claim.filed', source: 'claims-intake', description: 'New auto insurance claim filed: rear-end collision, estimated $8,200', level: 'A' },
        { type: 'documents.collected', source: 'document-service', description: 'Police report, photos, and repair estimate received', level: 'B' },
        { type: 'fraud.screened', source: 'fraud-detection', description: 'Automated fraud screening passed (score: 0.12, threshold: 0.7)', level: 'C' },
        { type: 'assessment.started', source: 'adjudication-engine', description: 'Claim assessment initiated, comparing against policy limits', level: 'B' },
        { type: 'adjudication.completed', source: 'adjudication-engine', description: 'Claim approved: $7,850 within policy coverage limits', level: 'D' },
        { type: 'settlement.approved', source: 'finance-system', description: 'Payment of $7,850 authorized to claimant bank account', level: 'D' },
        { type: 'claimant.notified', source: 'notification-service', description: 'Email and SMS sent to claimant with settlement details', level: 'E' },
      ],
      'Employee Onboarding Completion': [
        { type: 'onboarding.initiated', source: 'hr-system', description: 'New hire onboarding started for Software Engineer role', level: 'A' },
        { type: 'account.created', source: 'it-provisioning', description: 'Active Directory account created, email provisioned', level: 'B' },
        { type: 'access.granted', source: 'it-provisioning', description: 'Access granted to GitHub, Slack, Jira, and internal tools', level: 'C' },
        { type: 'training.assigned', source: 'lms-system', description: '5 required training modules assigned: security, compliance, code standards, tooling, culture', level: 'B' },
        { type: 'training.progress', source: 'lms-system', description: '4 of 5 modules completed, 1 remaining (security certification)', level: 'C' },
        { type: 'compliance.signed', source: 'docusign', description: 'NDA, IP agreement, and acceptable use policy signed', level: 'D' },
      ],
    };

    const events = eventTypeMap[ot.name] || eventTypeMap['Customer Account Closure']!;

    // Create the instance
    const passedCount = Math.min(proofs.length, events.length - 1);
    const pendingCount = Math.max(0, proofs.length - passedCount);

    const [inst] = await db.insert(outcomeInstances).values({
      orgId,
      outcomeTypeId,
      environment: 'demo',
      trigger: 'demo-simulate',
      status: 'active',
      proofStatus: 'partial' as any,
      confidenceScore: 0.78,
      automationMode: 'autonomous',
      eventCount: events.length,
      checkResults: proofs.map((p, i) => ({
        checkId: p.id,
        checkName: p.name,
        status: i < passedCount ? 'passed' : 'pending',
        score: i < passedCount ? 0.85 + Math.random() * 0.14 : undefined,
        reasoning: i < passedCount
          ? `Evidence confirmed: ${p.description || p.name}`
          : `Awaiting additional evidence for: ${p.name}`,
        evidenceLevel: i < 3 ? 'A' : 'B',
        evaluatedAt: i < passedCount ? new Date().toISOString() : undefined,
      })),
      totals: {
        passed: passedCount,
        failed: 0,
        skipped: 0,
        error: 0,
      },
    }).returning();

    // Create evidence events with realistic payloads
    const now = Date.now();
    for (let i = 0; i < events.length; i++) {
      const evt = events[i];
      await db.insert(evidenceEvents).values({
        orgId,
        outcomeInstanceId: inst.id,
        eventType: evt.type,
        eventSource: evt.source,
        payload: {
          description: evt.description,
          simulatedAt: new Date(now + i * 3000).toISOString(),
          outcomeType: ot.name,
        },
        confirmationLevel: evt.level as any,
        sequenceNumber: i + 1,
        emittedAt: new Date(now + i * 3000),
        receivedAt: new Date(now + i * 3000 + 200),
        processedAt: new Date(now + i * 3000 + 500),
      });
    }

    // Update timestamps
    await db.update(outcomeInstances).set({
      firstEventAt: new Date(now),
      lastEventAt: new Date(now + (events.length - 1) * 3000),
      evaluatedAt: new Date(),
    }).where(eq(outcomeInstances.id, inst.id));

    // Create action executions from connected actions
    let executionCount = 0;
    for (let j = 0; j < Math.min(connectedActionRows.length, 2); j++) {
      const action = connectedActionRows[j];
      const isCompleted = j === 0;
      const [exec] = await db.insert(actionExecutions).values({
        orgId,
        outcomeInstanceId: inst.id,
        actionId: action.id,
        proposedBy: 'system',
        status: isCompleted ? 'completed' : 'proposed',
        proofThresholdMet: isCompleted,
        riskClass: ot.riskClass || 'medium',
        executionLog: isCompleted ? {
          steps: [
            { step: 'validate_inputs', status: 'completed', at: new Date(now + 2000).toISOString() },
            { step: 'execute_action', status: 'completed', at: new Date(now + 4000).toISOString() },
            { step: 'verify_result', status: 'completed', at: new Date(now + 5000).toISOString() },
          ],
          result: { success: true, message: `${action.title} completed successfully` },
        } : undefined,
        startedAt: isCompleted ? new Date(now + 2000) : undefined,
        completedAt: isCompleted ? new Date(now + 5000) : undefined,
      }).returning();
      executionCount++;

      // Create decision dossier
      await db.insert(decisionDossiers).values({
        orgId,
        outcomeInstanceId: inst.id,
        actionExecutionId: exec.id,
        decisionType: isCompleted ? 'auto_executed' : 'action_proposed',
        summary: isCompleted
          ? `Automatically executed "${action.title}" because ${passedCount} of ${proofs.length} proof expectations were met (confidence: 78%). The proof threshold for autonomous action was satisfied.`
          : `Proposed "${action.title}" for human review. While evidence is accumulating (${passedCount}/${proofs.length} proofs met), this action requires manual approval per the automation boundary rules for ${ot.riskClass}-risk outcomes.`,
        confidenceScore: 0.78,
        factsConsidered: [
          { fact: `${passedCount} of ${proofs.length} proof expectations met`, source: 'proof-evaluator', weight: 0.8 },
          { fact: `${events.length} evidence events received and processed`, source: 'event-pipeline', weight: 0.6 },
          { fact: `Outcome risk class: ${ot.riskClass}`, source: 'outcome-definition', weight: 0.9 },
        ],
        evidenceIds: [],
        proofChain: proofs.slice(0, passedCount).map(p => ({
          expectationId: p.id,
          met: true,
          confidence: 0.85 + Math.random() * 0.14,
          reasoning: `Evidence confirmed: ${p.name}`,
        })),
        actor: 'system',
      });
    }

    // Build simulation script for progressive frontend playback
    const script: any[] = [];
    script.push({ type: 'narration', text: `Starting simulation: ${ot.name}`, delay: 0 });
    script.push({ type: 'narration', text: `This outcome has ${proofs.length} proof expectations and ${connectedActionRows.length} connected actions. Waiting for evidence from connected systems...`, delay: 2000 });

    let proofsMet = 0;
    const totalProofs = proofs.length;
    let proofsProcessed = 0;

    // Interleave events with proof evaluations
    for (let i = 0; i < events.length; i++) {
      const evt = events[i];
      script.push({ type: 'event', eventType: evt.type, source: evt.source, description: evt.description, level: evt.level, delay: 2500 });

      // Evaluate 1-2 proofs per event (distribute proofs across events)
      const proofsPerEvent = Math.ceil(totalProofs / events.length);
      for (let p = 0; p < proofsPerEvent && proofsProcessed < totalProofs; p++) {
        const proof = proofs[proofsProcessed];
        if (proofsProcessed < passedCount) {
          script.push({ type: 'analyzing', text: `Evaluating "${proof.name}" (${proof.checkType}) against this evidence...`, delay: 1500 });
          proofsMet++;
          const score = 0.85 + Math.random() * 0.14;
          script.push({
            type: 'proof_result',
            name: proof.name,
            proofId: proof.id,
            checkType: proof.checkType,
            status: 'passed',
            reasoning: `Evidence confirmed: ${proof.description || proof.name}`,
            score,
            delay: 1200,
          });
          const confidence = Math.round((proofsMet / totalProofs) * 100);
          script.push({ type: 'confidence_update', confidence, passed: proofsMet, total: totalProofs, delay: 800 });
        } else {
          script.push({ type: 'analyzing', text: `Checking "${proof.name}" — needs more evidence...`, delay: 1500 });
          script.push({
            type: 'proof_result',
            name: proof.name,
            proofId: proof.id,
            checkType: proof.checkType,
            status: 'pending',
            reasoning: `Awaiting additional evidence for: ${proof.name}`,
            delay: 1000,
          });
        }
        proofsProcessed++;
      }
    }

    // Show action decisions after all events/proofs
    const finalConfidence = Math.round((proofsMet / totalProofs) * 100);
    script.push({ type: 'narration', text: `Evidence gathering complete. ${proofsMet}/${totalProofs} proof expectations met (${finalConfidence}% confidence). Evaluating automated actions...`, delay: 2000 });

    for (let j = 0; j < Math.min(connectedActionRows.length, 2); j++) {
      const action = connectedActionRows[j];
      const isCompleted = j === 0 && proofsMet > 0;
      script.push({
        type: 'action',
        actionName: action.title,
        actionId: action.actionId,
        status: isCompleted ? 'completed' : 'proposed',
        reasoning: isCompleted
          ? `Automatically executed "${action.title}" because ${proofsMet} of ${totalProofs} proof expectations were met (confidence: ${finalConfidence}%). The proof threshold for autonomous action was satisfied.`
          : `Proposed "${action.title}" for human review. ${proofsMet < totalProofs ? `Only ${proofsMet}/${totalProofs} proofs met — ` : ''}this action requires manual approval per the automation boundary rules for ${ot.riskClass}-risk outcomes.`,
        delay: 2000,
      });
    }

    script.push({
      type: 'complete',
      summary: `${proofsMet}/${totalProofs} proofs met \u2022 ${finalConfidence}% confidence \u2022 ${executionCount} actions taken`,
      delay: 1500,
    });

    return reply.send({
      instanceId: inst.id,
      outcomeTypeId,
      outcomeName: ot.name,
      riskClass: ot.riskClass,
      category: ot.category,
      script,
      summary: {
        events: events.length,
        proofsEvaluated: proofs.length,
        proofsPassed: passedCount,
        actionsExecuted: executionCount,
      },
    });
  });

  // =========================================================================
  // DEMO RESET
  // =========================================================================
  app.delete('/orgs/:orgId/demo/reset', async (req, reply) => {
    const orgId = resolveOrgId(req, reply);
    if (!orgId) return;

    // Find demo actions
    const demoActions = await db.select({ id: actions.id, actionId: actions.actionId }).from(actions)
      .where(and(eq(actions.orgId, orgId), like(actions.actionId, 'demo-%')));

    if (demoActions.length === 0) {
      return reply.send({ success: true, message: 'No demo data found' });
    }

    const demoActionIds = demoActions.map(a => a.id);

    // Find demo outcome types by name
    const demoOutcomeNames = DEMO_OUTCOME_DEFS.map(d => d.name);
    const demoOutcomes = await db.select({ id: outcomeTypes.id }).from(outcomeTypes)
      .where(eq(outcomeTypes.orgId, orgId));
    const demoOutcomeIds = demoOutcomes
      .filter(o => true) // We'll delete by connected actions reference
      .map(o => o.id);

    // Find outcome types that match demo names
    const matchingOutcomes: string[] = [];
    for (const name of demoOutcomeNames) {
      const rows = await db.select({ id: outcomeTypes.id }).from(outcomeTypes)
        .where(and(eq(outcomeTypes.orgId, orgId), eq(outcomeTypes.name, name)));
      matchingOutcomes.push(...rows.map(r => r.id));
    }

    // Find instances for demo outcomes
    if (matchingOutcomes.length > 0) {
      for (const otId of matchingOutcomes) {
        const instances = await db.select({ id: outcomeInstances.id }).from(outcomeInstances)
          .where(eq(outcomeInstances.outcomeTypeId, otId));

        for (const inst of instances) {
          // Delete evidence events
          await db.delete(evidenceEvents).where(eq(evidenceEvents.outcomeInstanceId, inst.id));
          // Delete action executions and dossiers
          const execs = await db.select({ id: actionExecutions.id }).from(actionExecutions)
            .where(eq(actionExecutions.outcomeInstanceId, inst.id));
          for (const exec of execs) {
            await db.delete(decisionDossiers).where(eq(decisionDossiers.actionExecutionId, exec.id));
          }
          await db.delete(actionExecutions).where(eq(actionExecutions.outcomeInstanceId, inst.id));
        }

        // Delete instances
        await db.delete(outcomeInstances).where(eq(outcomeInstances.outcomeTypeId, otId));
        // Delete proof expectations
        await db.delete(proofExpectations).where(eq(proofExpectations.outcomeTypeId, otId));
      }

      // Delete outcome types
      for (const otId of matchingOutcomes) {
        await db.delete(outcomeTypes).where(and(eq(outcomeTypes.id, otId), eq(outcomeTypes.orgId, orgId)));
      }
    }

    // Delete demo actions
    for (const a of demoActions) {
      await db.delete(actions).where(eq(actions.id, a.id));
    }

    return reply.send({
      success: true,
      deleted: {
        actions: demoActions.length,
        outcomeTypes: matchingOutcomes.length,
      },
    });
  });
};

export default routes;
