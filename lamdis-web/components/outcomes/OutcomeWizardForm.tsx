"use client";
import { useEffect, useState } from 'react';
import Card from '@/components/base/Card';
import { PROOF_TYPE_CONFIG } from '@/lib/proofTypes';

const riskClasses = ['critical', 'high', 'medium', 'low', 'minimal'];
const automationModes = ['autonomous', 'supervised', 'manual'];

const inputCls = "w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500";
const selectCls = "rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500";
const labelCls = "block text-xs font-medium text-slate-400 mb-1";

const TOTAL_STEPS = 6;

const stepMeta = [
  { num: 1, label: 'Name & Description', color: 'fuchsia' },
  { num: 2, label: 'Success Criteria', color: 'violet' },
  { num: 3, label: 'Key Decisions', color: 'cyan' },
  { num: 4, label: 'Automation Boundaries', color: 'emerald' },
  { num: 5, label: 'Proof Expectations', color: 'amber' },
  { num: 6, label: 'Connected Systems', color: 'rose' },
];

interface SuccessCriterion {
  id: string;
  name: string;
  description: string;
  threshold: number;
  unit: string;
}

interface KeyDecision {
  id: string;
  name: string;
  description: string;
  automationMode: string;
  requiresHumanApproval: boolean;
}

interface AutomationBoundary {
  id: string;
  name: string;
  description: string;
  maxAutonomyLevel: string;
  escalationTrigger: string;
}

interface ProofExpectation {
  id: string;
  name: string;
  proofType: string;
  description: string;
  required: boolean;
}

interface ConnectedSystem {
  id: string;
  name: string;
  role: string;
  endpoint: string;
  systemId?: string;
}

export interface OutcomeFormData {
  name: string;
  description: string;
  riskClass: string;
  category: string;
  successCriteria: SuccessCriterion[];
  keyDecisions: KeyDecision[];
  boundaries: AutomationBoundary[];
  proofExpectations: ProofExpectation[];
  connectedSystems: ConnectedSystem[];
}

interface ActionItem {
  id: string;
  actionId: string;
  title: string;
  description?: string;
  isMock?: boolean;
}

interface OutcomeWizardFormProps {
  mode: 'create' | 'edit';
  initialData?: Partial<OutcomeFormData>;
  onSubmit: (data: OutcomeFormData) => Promise<void>;
  submitLabel: string;
}

export default function OutcomeWizardForm({ mode, initialData, onSubmit, submitLabel }: OutcomeWizardFormProps) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: initialData?.name || '',
    description: initialData?.description || '',
    riskClass: initialData?.riskClass || 'medium',
    category: initialData?.category || 'operational',
  });

  const [successCriteria, setSuccessCriteria] = useState<SuccessCriterion[]>(
    initialData?.successCriteria?.map(c => ({ ...c, id: c.id || crypto.randomUUID() })) || []
  );
  const [keyDecisions, setKeyDecisions] = useState<KeyDecision[]>(
    initialData?.keyDecisions?.map(d => ({ ...d, id: d.id || crypto.randomUUID() })) || []
  );
  const [boundaries, setBoundaries] = useState<AutomationBoundary[]>(
    initialData?.boundaries?.map(b => ({ ...b, id: b.id || crypto.randomUUID() })) || []
  );
  const [proofExpectations, setProofExpectations] = useState<ProofExpectation[]>(
    initialData?.proofExpectations?.map(p => ({ ...p, id: p.id || crypto.randomUUID() })) || []
  );
  const [connectedSystems, setConnectedSystems] = useState<ConnectedSystem[]>(
    initialData?.connectedSystems?.map(s => ({ ...s, id: s.id || crypto.randomUUID() })) || []
  );

  // Actions fetched for step 6
  const [availableActions, setAvailableActions] = useState<ActionItem[]>([]);
  const [actionsLoading, setActionsLoading] = useState(false);
  const [showCustomSystem, setShowCustomSystem] = useState(false);

  useEffect(() => {
    if (step === 6 && availableActions.length === 0 && !actionsLoading) {
      setActionsLoading(true);
      fetch('/api/orgs/actions', { cache: 'no-store' })
        .then(r => r.json())
        .then(data => {
          const list = Array.isArray(data) ? data : data?.actions || [];
          setAvailableActions(list);
        })
        .catch(() => {})
        .finally(() => setActionsLoading(false));
    }
  }, [step, availableActions.length, actionsLoading]);

  const addCriterion = () => setSuccessCriteria(prev => [...prev, { id: crypto.randomUUID(), name: '', description: '', threshold: 0.95, unit: '%' }]);
  const updateCriterion = (id: string, updates: Partial<SuccessCriterion>) => setSuccessCriteria(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  const removeCriterion = (id: string) => setSuccessCriteria(prev => prev.filter(c => c.id !== id));

  const addDecision = () => setKeyDecisions(prev => [...prev, { id: crypto.randomUUID(), name: '', description: '', automationMode: 'supervised', requiresHumanApproval: false }]);
  const updateDecision = (id: string, updates: Partial<KeyDecision>) => setKeyDecisions(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
  const removeDecision = (id: string) => setKeyDecisions(prev => prev.filter(d => d.id !== id));

  const addBoundary = () => setBoundaries(prev => [...prev, { id: crypto.randomUUID(), name: '', description: '', maxAutonomyLevel: 'supervised', escalationTrigger: '' }]);
  const updateBoundary = (id: string, updates: Partial<AutomationBoundary>) => setBoundaries(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
  const removeBoundary = (id: string) => setBoundaries(prev => prev.filter(b => b.id !== id));

  const addProof = () => setProofExpectations(prev => [...prev, { id: crypto.randomUUID(), name: '', proofType: 'event_presence', description: '', required: true }]);
  const updateProof = (id: string, updates: Partial<ProofExpectation>) => setProofExpectations(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  const removeProof = (id: string) => setProofExpectations(prev => prev.filter(p => p.id !== id));

  const addSystem = () => setConnectedSystems(prev => [...prev, { id: crypto.randomUUID(), name: '', role: '', endpoint: '' }]);
  const updateSystem = (id: string, updates: Partial<ConnectedSystem>) => setConnectedSystems(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  const removeSystem = (id: string) => setConnectedSystems(prev => prev.filter(s => s.id !== id));

  const toggleActionSelection = (action: ActionItem) => {
    const existing = connectedSystems.find(s => s.systemId === action.id);
    if (existing) {
      setConnectedSystems(prev => prev.filter(s => s.systemId !== action.id));
    } else {
      setConnectedSystems(prev => [...prev, {
        id: crypto.randomUUID(),
        systemId: action.id,
        name: action.title,
        role: 'action',
        endpoint: '',
      }]);
    }
  };

  const canProceed = () => {
    if (step === 1) return form.name.trim().length > 0;
    return true;
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        ...form,
        successCriteria,
        keyDecisions,
        boundaries,
        proofExpectations,
        connectedSystems,
      });
    } catch (err: any) {
      setError(err?.message || `Failed to ${mode} objective`);
    } finally {
      setSaving(false);
    }
  };

  const stepColors: Record<string, { ring: string; bg: string; text: string; border: string }> = {
    fuchsia: { ring: 'bg-fuchsia-600/20 border-fuchsia-500/30', bg: 'bg-fuchsia-600', text: 'text-fuchsia-300', border: 'border-fuchsia-500/30' },
    violet: { ring: 'bg-violet-600/20 border-violet-500/30', bg: 'bg-violet-600', text: 'text-violet-300', border: 'border-violet-500/30' },
    cyan: { ring: 'bg-cyan-600/20 border-cyan-500/30', bg: 'bg-cyan-600', text: 'text-cyan-300', border: 'border-cyan-500/30' },
    emerald: { ring: 'bg-emerald-600/20 border-emerald-500/30', bg: 'bg-emerald-600', text: 'text-emerald-300', border: 'border-emerald-500/30' },
    amber: { ring: 'bg-amber-600/20 border-amber-500/30', bg: 'bg-amber-600', text: 'text-amber-300', border: 'border-amber-500/30' },
    rose: { ring: 'bg-rose-600/20 border-rose-500/30', bg: 'bg-rose-600', text: 'text-rose-300', border: 'border-rose-500/30' },
  };

  const currentStepMeta = stepMeta[step - 1];
  const sc = stepColors[currentStepMeta.color];

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-1">
        {stepMeta.map((s) => {
          const sColors = stepColors[s.color];
          const isActive = s.num === step;
          const isDone = s.num < step;
          return (
            <button
              key={s.num}
              onClick={() => { if (s.num < step || canProceed()) setStep(s.num); }}
              className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                isActive ? `${sColors.bg} text-white` :
                isDone ? `${sColors.ring} ${sColors.text} border` :
                'bg-slate-800/50 text-slate-500 border border-slate-700'
              }`}
            >
              {s.num}. {s.label}
            </button>
          );
        })}
      </div>

      {/* Step 1: Name & Description */}
      {step === 1 && (
        <div>
          <div className="flex items-center gap-2.5 mb-3">
            <span className={`flex items-center justify-center w-6 h-6 rounded-full ${sc.ring} border text-xs font-bold ${sc.text}`}>1</span>
            <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">Name & Description</h2>
          </div>
          <Card>
            <div className="p-6 space-y-5">
              <div>
                <label className={labelCls}>Name</label>
                <input type="text" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g., Loan Application Approved Within SLA" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Description</label>
                <textarea rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What this objective represents and why it matters to the business" className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Risk Class</label>
                  <select value={form.riskClass} onChange={e => setForm(f => ({ ...f, riskClass: e.target.value }))} className={`${selectCls} w-full`}>
                    {riskClasses.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Category</label>
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className={`${selectCls} w-full`}>
                    {['operational', 'compliance', 'safety', 'quality', 'security', 'financial'].map(c => (
                      <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Step 2: Success Criteria */}
      {step === 2 && (
        <div>
          <div className="flex items-center gap-2.5 mb-3">
            <span className={`flex items-center justify-center w-6 h-6 rounded-full ${sc.ring} border text-xs font-bold ${sc.text}`}>2</span>
            <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">Success Criteria</h2>
          </div>
          <p className="text-xs text-slate-500 mb-3 ml-[2.125rem]">What conditions define success for this objective?</p>
          {successCriteria.length === 0 ? (
            <Card>
              <div className="p-8 text-center">
                <p className="text-sm text-slate-500">No success criteria yet</p>
                <button type="button" onClick={addCriterion} className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-300 hover:bg-slate-700 transition-colors">+ Add criterion</button>
              </div>
            </Card>
          ) : (
            <div className="space-y-3">
              {successCriteria.map((criterion) => (
                <Card key={criterion.id}>
                  <div className="p-4 space-y-3">
                    <div>
                      <label className={labelCls}>Criterion Name</label>
                      <input type="text" value={criterion.name} onChange={e => updateCriterion(criterion.id, { name: e.target.value })} placeholder="e.g., Application processed within 24 hours" className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Description</label>
                      <textarea rows={2} value={criterion.description} onChange={e => updateCriterion(criterion.id, { description: e.target.value })} placeholder="How this criterion is measured" className={inputCls} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>Threshold</label>
                        <input type="number" step="0.01" min="0" max="1" value={criterion.threshold} onChange={e => updateCriterion(criterion.id, { threshold: parseFloat(e.target.value) || 0 })} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Unit</label>
                        <input type="text" value={criterion.unit} onChange={e => updateCriterion(criterion.id, { unit: e.target.value })} placeholder="%, ms, count" className={inputCls} />
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <button type="button" onClick={() => removeCriterion(criterion.id)} className="px-2.5 py-1 rounded text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 transition-colors">Remove</button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
          <button type="button" onClick={addCriterion} className="mt-3 w-full py-2.5 rounded-lg border border-dashed border-slate-700 text-sm text-slate-500 hover:text-slate-300 hover:border-slate-600 transition-colors">+ Add another criterion</button>
        </div>
      )}

      {/* Step 3: Key Decisions */}
      {step === 3 && (
        <div>
          <div className="flex items-center gap-2.5 mb-3">
            <span className={`flex items-center justify-center w-6 h-6 rounded-full ${sc.ring} border text-xs font-bold ${sc.text}`}>3</span>
            <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">Key Decisions</h2>
          </div>
          <p className="text-xs text-slate-500 mb-3 ml-[2.125rem]">What decisions must be made during this objective&#39;s lifecycle?</p>
          {keyDecisions.length === 0 ? (
            <Card>
              <div className="p-8 text-center">
                <p className="text-sm text-slate-500">No key decisions yet</p>
                <button type="button" onClick={addDecision} className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-300 hover:bg-slate-700 transition-colors">+ Add decision</button>
              </div>
            </Card>
          ) : (
            <div className="space-y-3">
              {keyDecisions.map((decision) => (
                <Card key={decision.id}>
                  <div className="p-4 space-y-3">
                    <div>
                      <label className={labelCls}>Decision Name</label>
                      <input type="text" value={decision.name} onChange={e => updateDecision(decision.id, { name: e.target.value })} placeholder="e.g., Credit risk assessment" className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Description</label>
                      <textarea rows={2} value={decision.description} onChange={e => updateDecision(decision.id, { description: e.target.value })} placeholder="What this decision entails" className={inputCls} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>Automation Mode</label>
                        <select value={decision.automationMode} onChange={e => updateDecision(decision.id, { automationMode: e.target.value })} className={`${selectCls} w-full`}>
                          {automationModes.map(m => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
                        </select>
                      </div>
                      <div className="flex items-end">
                        <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer pb-2">
                          <input type="checkbox" checked={decision.requiresHumanApproval} onChange={e => updateDecision(decision.id, { requiresHumanApproval: e.target.checked })} className="rounded border-slate-600" />
                          Requires human approval
                        </label>
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <button type="button" onClick={() => removeDecision(decision.id)} className="px-2.5 py-1 rounded text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 transition-colors">Remove</button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
          <button type="button" onClick={addDecision} className="mt-3 w-full py-2.5 rounded-lg border border-dashed border-slate-700 text-sm text-slate-500 hover:text-slate-300 hover:border-slate-600 transition-colors">+ Add another decision</button>
        </div>
      )}

      {/* Step 4: Automation Boundaries */}
      {step === 4 && (
        <div>
          <div className="flex items-center gap-2.5 mb-3">
            <span className={`flex items-center justify-center w-6 h-6 rounded-full ${sc.ring} border text-xs font-bold ${sc.text}`}>4</span>
            <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">Automation Boundaries</h2>
          </div>
          <p className="text-xs text-slate-500 mb-3 ml-[2.125rem]">Where should automation stop and human oversight begin?</p>
          {boundaries.length === 0 ? (
            <Card>
              <div className="p-8 text-center">
                <p className="text-sm text-slate-500">No automation boundaries yet</p>
                <button type="button" onClick={addBoundary} className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-300 hover:bg-slate-700 transition-colors">+ Add boundary</button>
              </div>
            </Card>
          ) : (
            <div className="space-y-3">
              {boundaries.map((boundary) => (
                <Card key={boundary.id}>
                  <div className="p-4 space-y-3">
                    <div>
                      <label className={labelCls}>Boundary Name</label>
                      <input type="text" value={boundary.name} onChange={e => updateBoundary(boundary.id, { name: e.target.value })} placeholder="e.g., High-value transaction threshold" className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Description</label>
                      <textarea rows={2} value={boundary.description} onChange={e => updateBoundary(boundary.id, { description: e.target.value })} placeholder="What this boundary defines" className={inputCls} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>Max Autonomy Level</label>
                        <select value={boundary.maxAutonomyLevel} onChange={e => updateBoundary(boundary.id, { maxAutonomyLevel: e.target.value })} className={`${selectCls} w-full`}>
                          {automationModes.map(m => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>Escalation Trigger</label>
                        <input type="text" value={boundary.escalationTrigger} onChange={e => updateBoundary(boundary.id, { escalationTrigger: e.target.value })} placeholder="e.g., confidence < 0.8" className={inputCls} />
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <button type="button" onClick={() => removeBoundary(boundary.id)} className="px-2.5 py-1 rounded text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 transition-colors">Remove</button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
          <button type="button" onClick={addBoundary} className="mt-3 w-full py-2.5 rounded-lg border border-dashed border-slate-700 text-sm text-slate-500 hover:text-slate-300 hover:border-slate-600 transition-colors">+ Add another boundary</button>
        </div>
      )}

      {/* Step 5: Proof Expectations */}
      {step === 5 && (
        <div>
          <div className="flex items-center gap-2.5 mb-3">
            <span className={`flex items-center justify-center w-6 h-6 rounded-full ${sc.ring} border text-xs font-bold ${sc.text}`}>5</span>
            <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">Proof Expectations</h2>
          </div>
          <p className="text-xs text-slate-500 mb-3 ml-[2.125rem]">What evidence must be collected to prove this objective was achieved correctly?</p>
          {proofExpectations.length === 0 ? (
            <Card>
              <div className="p-8 text-center">
                <p className="text-sm text-slate-500">No proof expectations yet</p>
                <button type="button" onClick={addProof} className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-300 hover:bg-slate-700 transition-colors">+ Add proof expectation</button>
              </div>
            </Card>
          ) : (
            <div className="space-y-3">
              {proofExpectations.map((proof) => (
                <Card key={proof.id}>
                  <div className="p-4 space-y-3">
                    <div>
                      <label className={labelCls}>Proof Name</label>
                      <input type="text" value={proof.name} onChange={e => updateProof(proof.id, { name: e.target.value })} placeholder="e.g., Identity verification completed" className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Description</label>
                      <textarea rows={2} value={proof.description} onChange={e => updateProof(proof.id, { description: e.target.value })} placeholder="What evidence is expected" className={inputCls} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>Proof Type</label>
                        <select value={proof.proofType} onChange={e => updateProof(proof.id, { proofType: e.target.value })} className={`${selectCls} w-full`}>
                          {PROOF_TYPE_CONFIG.map(pt => (
                            <option key={pt.value} value={pt.value}>{pt.label}</option>
                          ))}
                        </select>
                        {(() => {
                          const ptConfig = PROOF_TYPE_CONFIG.find(pt => pt.value === proof.proofType);
                          return ptConfig ? (
                            <p className="text-[11px] text-slate-500 mt-1">{ptConfig.description}</p>
                          ) : null;
                        })()}
                      </div>
                      <div className="flex items-end">
                        <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer pb-2">
                          <input type="checkbox" checked={proof.required} onChange={e => updateProof(proof.id, { required: e.target.checked })} className="rounded border-slate-600" />
                          Required
                        </label>
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <button type="button" onClick={() => removeProof(proof.id)} className="px-2.5 py-1 rounded text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 transition-colors">Remove</button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
          <button type="button" onClick={addProof} className="mt-3 w-full py-2.5 rounded-lg border border-dashed border-slate-700 text-sm text-slate-500 hover:text-slate-300 hover:border-slate-600 transition-colors">+ Add another proof expectation</button>
        </div>
      )}

      {/* Step 6: Connected Systems */}
      {step === 6 && (
        <div>
          <div className="flex items-center gap-2.5 mb-3">
            <span className={`flex items-center justify-center w-6 h-6 rounded-full ${sc.ring} border text-xs font-bold ${sc.text}`}>6</span>
            <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">Connected Systems</h2>
          </div>
          <p className="text-xs text-slate-500 mb-3 ml-[2.125rem]">Which systems participate in achieving this objective?</p>

          {/* Selectable action cards */}
          {actionsLoading ? (
            <Card><div className="p-6 text-center text-sm text-slate-500">Loading available actions...</div></Card>
          ) : availableActions.length > 0 ? (
            <div className="space-y-3 mb-4">
              <p className="text-xs font-medium text-slate-400">Select from existing actions:</p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {availableActions.map((action) => {
                  const isSelected = connectedSystems.some(s => s.systemId === action.id);
                  return (
                    <button
                      key={action.id}
                      type="button"
                      onClick={() => toggleActionSelection(action)}
                      className={`text-left p-3 rounded-lg border transition-colors ${
                        isSelected
                          ? 'border-fuchsia-500/50 bg-fuchsia-950/20'
                          : 'border-slate-700 bg-slate-800/30 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-slate-200 truncate">{action.title}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {action.isMock && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/30 text-amber-400 border border-amber-700/30">Mock</span>
                          )}
                          {isSelected && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-fuchsia-900/30 text-fuchsia-400 border border-fuchsia-700/30">Selected</span>
                          )}
                        </div>
                      </div>
                      {action.description && (
                        <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{action.description}</p>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Custom systems (manual entry) */}
          {!showCustomSystem && (
            <button
              type="button"
              onClick={() => setShowCustomSystem(true)}
              className="mb-3 text-xs text-slate-400 hover:text-slate-300 underline"
            >
              + Add custom system manually
            </button>
          )}

          {showCustomSystem && (
            <>
              {connectedSystems.filter(s => !s.systemId).length === 0 ? (
                <Card>
                  <div className="p-8 text-center">
                    <p className="text-sm text-slate-500">No custom systems added</p>
                    <button type="button" onClick={addSystem} className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-300 hover:bg-slate-700 transition-colors">+ Add system</button>
                  </div>
                </Card>
              ) : (
                <div className="space-y-3">
                  {connectedSystems.filter(s => !s.systemId).map((system) => (
                    <Card key={system.id}>
                      <div className="p-4 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className={labelCls}>System Name</label>
                            <input type="text" value={system.name} onChange={e => updateSystem(system.id, { name: e.target.value })} placeholder="e.g., Payment Gateway" className={inputCls} />
                          </div>
                          <div>
                            <label className={labelCls}>Role</label>
                            <input type="text" value={system.role} onChange={e => updateSystem(system.id, { role: e.target.value })} placeholder="e.g., payment_processor" className={inputCls} />
                          </div>
                        </div>
                        <div>
                          <label className={labelCls}>Endpoint / Identifier</label>
                          <input type="text" value={system.endpoint} onChange={e => updateSystem(system.id, { endpoint: e.target.value })} placeholder="e.g., https://api.gateway.com or service-name" className={inputCls} />
                        </div>
                        <div className="flex justify-end">
                          <button type="button" onClick={() => removeSystem(system.id)} className="px-2.5 py-1 rounded text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 transition-colors">Remove</button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
              <button type="button" onClick={addSystem} className="mt-3 w-full py-2.5 rounded-lg border border-dashed border-slate-700 text-sm text-slate-500 hover:text-slate-300 hover:border-slate-600 transition-colors">+ Add another system</button>
            </>
          )}

          {/* Summary of selected systems */}
          {connectedSystems.length > 0 && (
            <div className="mt-4 p-3 rounded-lg border border-slate-700/50 bg-slate-800/20">
              <p className="text-xs font-medium text-slate-400 mb-2">{connectedSystems.length} system{connectedSystems.length !== 1 ? 's' : ''} connected:</p>
              <div className="flex flex-wrap gap-1.5">
                {connectedSystems.map(s => (
                  <span key={s.id} className="text-[11px] px-2 py-0.5 rounded-full bg-slate-700/50 text-slate-300">{s.name || 'Unnamed'}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={() => step > 1 ? setStep(step - 1) : history.back()}
          className="px-5 py-2.5 rounded-lg border border-slate-700 text-slate-300 text-sm hover:bg-slate-800 transition-colors"
        >
          {step === 1 ? 'Cancel' : 'Back'}
        </button>
        <div className="flex gap-3">
          {step < TOTAL_STEPS ? (
            <button
              type="button"
              onClick={() => setStep(step + 1)}
              disabled={!canProceed()}
              className="px-5 py-2.5 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving || !form.name.trim()}
              className="px-5 py-2.5 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
            >
              {saving ? 'Saving...' : submitLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
