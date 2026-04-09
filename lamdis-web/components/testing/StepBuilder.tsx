"use client";

import { useEffect, useState } from "react";
import Button from "@/components/base/Button";
import Badge from "@/components/base/Badge";
import Input from "@/components/base/Input";
import Select from "@/components/base/Select";

// Generator definitions for the modal UI
const GENERATORS: { value: string; label: string; description: string; category: string }[] = [
  // Random
  { value: "${uuid}", label: "uuid", description: "Random UUID v4, e.g. 550e8400-e29b-41d4-a716-446655440000", category: "Random" },
  { value: "${randInt(5)}", label: "randInt(5)", description: "Random integer with exactly 5 digits", category: "Random" },
  { value: "${randInt(5,9)}", label: "randInt(5,9)", description: "Random integer with 5–9 digit length", category: "Random" },
  { value: "${randDec(3,4)}", label: "randDec(3,4)", description: "Random decimal: 3 integer digits, 4 decimal digits", category: "Random" },
  { value: "${randStr(8)}", label: "randStr(8)", description: "Random alphanumeric string of length 8", category: "Random" },
  { value: "${randFrom(a,b,c)}", label: "randFrom(a,b,c)", description: "Pick a random value from the provided list", category: "Random" },
  { value: "${email}", label: "email", description: "Generated test email, e.g. test_a1b2c3d4@test.lamdis.io", category: "Random" },
  // Date & Time
  { value: "${today}", label: "today", description: "Today's date in YYYY-MM-DD format", category: "Date & Time" },
  { value: "${tomorrow}", label: "tomorrow", description: "Tomorrow's date in YYYY-MM-DD format", category: "Date & Time" },
  { value: "${yesterday}", label: "yesterday", description: "Yesterday's date in YYYY-MM-DD format", category: "Date & Time" },
  { value: "${daysFromNow(7)}", label: "daysFromNow(7)", description: "Date N days from now (use negative for past), YYYY-MM-DD", category: "Date & Time" },
  { value: "${now}", label: "now", description: "Current date & time in ISO 8601 format", category: "Date & Time" },
  { value: "${isoDate}", label: "isoDate", description: "Current date & time in ISO 8601 format (alias for now)", category: "Date & Time" },
  { value: "${timestamp}", label: "timestamp", description: "Unix timestamp in seconds", category: "Date & Time" },
  { value: "${timestampMs}", label: "timestampMs", description: "Unix timestamp in milliseconds", category: "Date & Time" },
];

function GeneratorModal({ open, onClose, onSelect }: { open: boolean; onClose: () => void; onSelect: (value: string) => void }) {
  const [search, setSearch] = useState("");
  if (!open) return null;

  const filtered = search
    ? GENERATORS.filter(g => g.label.toLowerCase().includes(search.toLowerCase()) || g.description.toLowerCase().includes(search.toLowerCase()))
    : GENERATORS;

  const categories = [...new Set(filtered.map(g => g.category))];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg border border-slate-700 bg-slate-900 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
          <span className="text-sm font-medium text-slate-100">Generators</span>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white text-lg leading-none">&times;</button>
        </div>
        <div className="px-4 pt-3">
          <input
            autoFocus
            className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            placeholder="Search generators…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="max-h-72 overflow-y-auto px-4 py-3 space-y-4">
          {categories.map(cat => (
            <div key={cat}>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">{cat}</div>
              <div className="space-y-1">
                {filtered.filter(g => g.category === cat).map(g => (
                  <button
                    key={g.value}
                    type="button"
                    onClick={() => { onSelect(g.value); onClose(); }}
                    className="w-full text-left rounded-md px-3 py-2 hover:bg-slate-800 transition-colors group"
                  >
                    <div className="flex items-center justify-between">
                      <code className="text-xs font-mono text-emerald-400">{g.label}</code>
                      <span className="text-[10px] text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity">click to insert</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{g.description}</div>
                  </button>
                ))}
              </div>
            </div>
          ))}
          {filtered.length === 0 && <div className="text-xs text-slate-500 text-center py-4">No generators match your search.</div>}
        </div>
      </div>
    </div>
  );
}

export type StepType = "message" | "request" | "user_objective" | "assistant_check" | "extract";

export type StepBase = {
  id: string;
  type: StepType;
  name?: string;
};

export type MessageStep = StepBase & {
  type: "message";
  role: "user";
  content: string;
  // Input mappings for the assistant request (conversation ID, custom headers, etc.)
  assistantInputMappings?: Record<string, any>;
};

export type RequestStep = StepBase & {
  type: "request";
  requestId: string;
  saveAs?: string;
  inputMappings?: Record<string, any>;
};

export type ObjectiveMode = "judge" | "includes" | "variable_check";

export type UserObjectiveStep = StepBase & {
  type: "user_objective";
  description: string;
  minTurns?: number;
  maxTurns?: number;
  iterativeConversation?: boolean;
  exitOnPass?: boolean;  // Stop conversation when assertion passes (default: true)
  exitOnFail?: boolean;  // Stop conversation when assertion fails (default: false)
  attachedChecks?: AssistantCheckStep[];
  // Input mappings for the assistant request (conversation ID, custom headers, etc.)
  assistantInputMappings?: Record<string, any>;
};

export type ComparisonOperator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "not_contains" | "regex" | "exists" | "not_exists";

export type AssistantCheckStep = StepBase & {
  type: "assistant_check";
  mode: ObjectiveMode;
  severity?: "error" | "warning";  // Whether failure affects test pass/fail
  // Judge mode
  rubric?: string;
  threshold?: number;
  // Includes mode
  scope?: "last" | "transcript";
  includes?: string;
  // Variable-check mode
  variablePath?: string;
  operator?: ComparisonOperator;
  expectEquals?: string;  // Kept for backwards compatibility, now also used as rightValue
  rightValue?: string;    // The right-hand side value for comparison
};

export type ExtractStep = StepBase & {
  type: "extract";
  variableName: string;
  description: string;
  scope?: "last" | "transcript";
};

export type AnyStep = MessageStep | RequestStep | UserObjectiveStep | AssistantCheckStep | ExtractStep;

// Assistant chat configuration - describes what inputs/outputs the assistant expects
export interface AssistantChatConfig {
  inputSchema?: {
    properties?: Record<string, { type?: string; description?: string }>;
    required?: string[];
  };
  outputSchema?: {
    properties?: Record<string, { type?: string; description?: string }>;
  };
  responseFieldPath?: string; // Path to the response text (default: "reply")
}

// Pre-step type: only requests for setting up test data
export type PreStep = {
  id: string;
  type: "request";
  name?: string;
  requestId: string;
  inputMappings?: Record<string, any>;
  saveAs?: string;
};

// Test-level variable: resolved before pre-steps execute
export type TestVariable = {
  key: string;
  value: string;
  description?: string;
};

export interface StepBuilderProps {
  name: string;
  onNameChange: (name: string) => void;
  personaId: string;
  availablePersonas: { id: string; name: string }[];
  onPersonaChange: (personaId: string) => void;
  availableRequests?: { id: string; name: string; inputKeys?: string[]; outputKeys?: string[] }[];
  // Assistant chat configuration from the selected setup
  assistantChatConfig?: AssistantChatConfig;
  // Organization-level variables (secrets) available for use in inputs
  orgVariables?: { key: string }[];
  // Test-level variables with hardcoded values or generator expressions
  testVariables?: TestVariable[];
  onTestVariablesChange?: (variables: TestVariable[]) => void;
  // Pre-steps for test data setup (executed before main steps)
  preSteps?: AnyStep[];
  onPreStepsChange?: (preSteps: AnyStep[]) => void;
  value: AnyStep[];
  onChange: (steps: AnyStep[]) => void;
}

// Test result types for inline testing
type TestResult = {
  success: boolean;
  data?: any;
  error?: string;
  latencyMs?: number;
  timestamp: Date;
};

export function StepBuilder({ name, onNameChange, personaId, availablePersonas, onPersonaChange, availableRequests = [], assistantChatConfig, orgVariables = [], testVariables = [], onTestVariablesChange, preSteps = [], onPreStepsChange, value, onChange }: StepBuilderProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedAttachedCheckId, setSelectedAttachedCheckId] = useState<string | null>(null);
  const [selectedPreStepId, setSelectedPreStepId] = useState<string | null>(null);
  const [preStepsExpanded, setPreStepsExpanded] = useState(false);
  const [testVariablesExpanded, setTestVariablesExpanded] = useState(false);
  
  // Test execution state
  const [testingStepId, setTestingStepId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [extractSampleText, setExtractSampleText] = useState<string>("");
  const [generatorModalIdx, setGeneratorModalIdx] = useState<number | null>(null);

  const steps = value || [];

  const update = (next: AnyStep[]) => {
    onChange(next);
  };

  const updatePreSteps = (next: AnyStep[]) => {
    onPreStepsChange?.(next);
  };

  // Compute assistant input keys from the chat config
  const assistantInputKeys: string[] = assistantChatConfig?.inputSchema?.properties
    ? Object.keys(assistantChatConfig.inputSchema.properties)
    : [];
  
  // Compute assistant output keys from the chat config
  const assistantOutputKeys: string[] = assistantChatConfig?.outputSchema?.properties
    ? Object.keys(assistantChatConfig.outputSchema.properties)
    : [];

  // When steps are first loaded (e.g. editing an existing test),
  // default to the first step *only* if nothing has ever been selected.
  useEffect(() => {
    if (!steps.length) return;
    setSelectedId((prev) => prev ?? steps[0]?.id ?? null);
  }, [steps]);

  const addStep = (type: StepType) => {
    // Generate a unique ID based on existing steps
    let counter = 1;
    let newId = `step_${counter}`;
    while (steps.some((s) => s.id === newId)) {
      counter++;
      newId = `step_${counter}`;
    }

    const base: StepBase = { id: newId, type } as any;
    let step: AnyStep;
    if (type === "message") {
      step = { ...(base as StepBase), type: "message", role: "user", content: "" };
    } else if (type === "request") {
      step = { ...(base as StepBase), type: "request", requestId: "", inputMappings: {}, saveAs: "" };
    } else if (type === "user_objective") {
      step = {
        ...(base as StepBase),
        type: "user_objective",
        description: "",
        minTurns: 1,
        maxTurns: 8,
        iterativeConversation: true,
        continueAfterPass: false,
        attachedChecks: [],
      } as UserObjectiveStep;
    } else if (type === "extract") {
      step = {
        ...(base as StepBase),
        type: "extract",
        variableName: "",
        description: "",
        scope: "last",
      } as ExtractStep;
    } else {
      step = {
        ...(base as StepBase),
        type: "assistant_check",
        mode: "judge",
        rubric: "",
      } as AssistantCheckStep;
    }
    update([...steps, step]);
    setSelectedId(step.id);
    setSelectedAttachedCheckId(null);
  };

  const updateStep = (id: string, patch: Partial<AnyStep>) => {
    update(
      steps.map((s) => (s.id === id ? ({ ...s, ...patch } as AnyStep) : s))
    );
  };

  const removeStep = (id: string) => {
    const idx = steps.findIndex((s) => s.id === id);
    const next = steps.filter((s) => s.id !== id);
    update(next);
    if (selectedId === id) {
      const fallback = next[Math.max(0, idx - 1)]?.id ?? null;
      setSelectedId(fallback);
      setSelectedAttachedCheckId(null);
    }
  };

  const moveStep = (id: string, delta: -1 | 1) => {
    const idx = steps.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const target = idx + delta;
    if (target < 0 || target >= steps.length) return;
    const copy = [...steps];
    const [item] = copy.splice(idx, 1);
    copy.splice(target, 0, item);
    update(copy);
    // keep the same step selected after reordering
    setSelectedId(item.id);
  };

  // Test an action step with current inputs
  const testRequest = async (step: RequestStep) => {
    if (!step.requestId) return;
    setTestingStepId(step.id);
    try {
      const res = await fetch(`/api/orgs/actions/${encodeURIComponent(step.requestId)}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: step.inputMappings || {},
        }),
      });
      const data = await res.json();
      setTestResults(prev => ({
        ...prev,
        [step.id]: {
          success: data.success,
          data: data,
          error: data.error,
          latencyMs: data.latencyMs,
          timestamp: new Date(),
        },
      }));
    } catch (e: any) {
      setTestResults(prev => ({
        ...prev,
        [step.id]: {
          success: false,
          error: e?.message || 'Request failed',
          timestamp: new Date(),
        },
      }));
    } finally {
      setTestingStepId(null);
    }
  };

  // Test an extraction with sample text
  const testExtraction = async (step: ExtractStep, sampleText: string) => {
    if (!step.description || !sampleText) return;
    setTestingStepId(step.id);
    try {
      const res = await fetch('/api/orgs/extract/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variableName: step.variableName,
          description: step.description,
          scope: step.scope || 'last',
          sampleText,
        }),
      });
      const data = await res.json();
      setTestResults(prev => ({
        ...prev,
        [step.id]: {
          success: data.success,
          data: data,
          error: data.error,
          timestamp: new Date(),
        },
      }));
    } catch (e: any) {
      setTestResults(prev => ({
        ...prev,
        [step.id]: {
          success: false,
          error: e?.message || 'Extraction failed',
          timestamp: new Date(),
        },
      }));
    } finally {
      setTestingStepId(null);
    }
  };

  const selected = steps.find((s) => s.id === selectedId) || null;

  // Compute variable options from pre-steps for use in main steps
  const preStepVariableOptions: { value: string; label: string }[] = preSteps.flatMap((s) => {
    const key = s.name || s.id;
    if (s.type === "request") {
      const req = availableRequests.find(r => r.id === (s as RequestStep).requestId);
      if (req && req.outputKeys && req.outputKeys.length) {
        return req.outputKeys.map(k => ({
          value: `preSteps.${key}.output.${k}`,
          label: `preSteps.${key}.output.${k}`,
        }));
      }
      return [{
        value: `preSteps.${key}.output`,
        label: `preSteps.${key}.output`,
      }];
    }
    return [];
  });

  // Test variable options (always available)
  const testVarOptions: { value: string; label: string }[] = testVariables
    .filter(tv => tv.key)
    .map(tv => ({ value: `var.${tv.key}`, label: `var.${tv.key}` }));

  // Compute simple variable options based on earlier steps' outputs
  const variableOptions: { value: string; label: string }[] = [
    ...testVarOptions,
    ...preStepVariableOptions,
    ...steps.flatMap((s) => {
    const key = s.name || s.id;
    if (s.type === "request") {
      const req = availableRequests.find(r => r.id === (s as RequestStep).requestId);
      if (req && req.outputKeys && req.outputKeys.length) {
        return req.outputKeys.map(k => ({
          value: `steps.${key}.output.${k}`,
          label: `${key}.output.${k}`,
        }));
      }
      return [{
        value: `steps.${key}.output`,
        label: `${key}.output`,
      }];
    }
    // For message and user_objective steps, expose assistant outputs
    if (s.type === "message" || s.type === "user_objective") {
      const baseVars = [
        { value: `steps.${key}.output`, label: `${key}.output` },
        { value: `steps.${key}.output.reply`, label: `${key}.output.reply` },
      ];
      // Add assistant output keys if configured
      if (assistantOutputKeys.length) {
        return [
          ...baseVars,
          ...assistantOutputKeys.map(k => ({
            value: `steps.${key}.output.${k}`,
            label: `${key}.output.${k}`,
          })),
        ];
      }
      return baseVars;
    }
    // For extract steps, expose the extracted variable
    if (s.type === "extract" && (s as ExtractStep).variableName) {
      return [{
        value: `var.${(s as ExtractStep).variableName}`,
        label: `var.${(s as ExtractStep).variableName}`,
      }];
    }
    return [];
  })];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
        <label className="text-xs text-slate-400 md:col-span-2">Name
          <Input
            className="mt-1"
            value={name}
            onChange={(e: any) => onNameChange(e.target.value)}
            placeholder="Test name"
          />
        </label>
        <label className="text-xs text-slate-400">Persona (optional)
          <Select
            className="mt-1"
            value={personaId}
            onChange={(e: any) => onPersonaChange(e.target.value)}
          >
            <option value="">— None —</option>
            {availablePersonas.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </label>
      </div>

      {/* Test Variables Section (collapsible) — above pre-steps */}
      {onTestVariablesChange && (
        <div className="mt-4 rounded-md border border-slate-800 bg-slate-950/40">
          <button
            type="button"
            onClick={() => setTestVariablesExpanded(!testVariablesExpanded)}
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-900/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <svg
                className={`w-4 h-4 text-slate-400 transition-transform ${testVariablesExpanded ? 'rotate-90' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              <span className="text-sm font-medium text-slate-200">Test Variables</span>
              {testVariables.length > 0 && (
                <Badge variant="neutral" className="text-[10px]">{testVariables.length}</Badge>
              )}
            </div>
            <span className="text-xs text-slate-500">
              {testVariables.length === 0 ? 'Define variables with values or generators' : `${testVariables.length} variable${testVariables.length !== 1 ? 's' : ''}`}
            </span>
          </button>

          {testVariablesExpanded && (
            <div className="px-4 pb-4 border-t border-slate-800">
              <p className="mt-3 text-xs text-slate-500 mb-3">
                Define variables available throughout the test. Use hardcoded values or generator functions like{' '}
                <code className="text-emerald-400">{`\${uuid}`}</code>,{' '}
                <code className="text-emerald-400">{`\${randInt(5)}`}</code>,{' '}
                <code className="text-emerald-400">{`\${randDec(3,4)}`}</code>.{' '}
                Reference in steps via <code className="text-cyan-400">{`\${var.variable_name}`}</code>.
              </p>

              <div className="space-y-2">
                {testVariables.map((tv, idx) => (
                  <div key={idx} className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] gap-2 items-center">
                    <input
                      className="rounded bg-slate-900 border border-slate-700 px-2 py-1.5 text-xs text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                      value={tv.key}
                      onChange={(e) => {
                        const next = [...testVariables];
                        next[idx] = { ...tv, key: e.target.value.replace(/[^a-zA-Z0-9_]/g, '_') };
                        onTestVariablesChange(next);
                      }}
                      placeholder="variable_name"
                    />
                    <div className="flex items-center gap-1">
                      <input
                        className="flex-1 rounded bg-slate-900 border border-slate-700 px-2 py-1.5 text-xs text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                        value={tv.value}
                        onChange={(e) => {
                          const next = [...testVariables];
                          next[idx] = { ...tv, value: e.target.value };
                          onTestVariablesChange(next);
                        }}
                        placeholder="Value or ${uuid}, ${today}"
                      />
                      <button
                        type="button"
                        onClick={() => setGeneratorModalIdx(idx)}
                        className="shrink-0 rounded bg-slate-800 border border-slate-700 text-[10px] text-emerald-400 px-2 py-1.5 hover:bg-slate-700 hover:border-slate-600 transition-colors"
                        title="Browse generators"
                      >
                        {"{ }"}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onTestVariablesChange(testVariables.filter((_, i) => i !== idx));
                      }}
                      className="px-1 py-0.5 rounded border border-rose-700/60 text-rose-300 hover:border-rose-500 hover:bg-rose-900/40 text-[10px]"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => onTestVariablesChange([...testVariables, { key: '', value: '' }])}
                className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md
                           bg-slate-800/60 text-slate-300 border border-slate-700/50
                           hover:bg-slate-700/80 hover:text-white hover:border-slate-600
                           active:scale-[0.98] active:bg-slate-700
                           transition-all duration-150 ease-out"
              >
                <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add Variable
              </button>

              {testVariables.length === 0 && (
                <div className="mt-2 rounded-md border border-dashed border-slate-700 bg-slate-900/40 p-3 text-xs text-slate-500">
                  No variables defined. Add one to generate test data like UUIDs, random IDs, or timestamps.
                </div>
              )}

              <GeneratorModal
                open={generatorModalIdx !== null}
                onClose={() => setGeneratorModalIdx(null)}
                onSelect={(val) => {
                  if (generatorModalIdx === null) return;
                  const next = [...testVariables];
                  next[generatorModalIdx] = { ...next[generatorModalIdx], value: val };
                  onTestVariablesChange(next);
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* Pre-Steps Section (collapsible) */}
      {onPreStepsChange && (
        <div className="mt-4 rounded-md border border-slate-800 bg-slate-950/40">
          <button
            type="button"
            onClick={() => setPreStepsExpanded(!preStepsExpanded)}
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-900/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <svg
                className={`w-4 h-4 text-slate-400 transition-transform ${preStepsExpanded ? 'rotate-90' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              <span className="text-sm font-medium text-slate-200">Pre-Steps (Setup)</span>
              {preSteps.length > 0 && (
                <Badge variant="neutral" className="text-[10px]">{preSteps.length}</Badge>
              )}
            </div>
            <span className="text-xs text-slate-500">
              {preSteps.length === 0 ? 'Configure test data setup' : `${preSteps.length} pre-step${preSteps.length !== 1 ? 's' : ''}`}
            </span>
          </button>

          {preStepsExpanded && (
            <div className="px-4 pb-4 border-t border-slate-800">
              <p className="mt-3 text-xs text-slate-500 mb-3">
                Pre-steps execute API requests before your test begins. Use them to create test data (users, orders, etc.) 
                that can be referenced in your main test steps via <code className="text-cyan-400">${`{preSteps.step_name.output}`}</code>.
              </p>
              
              {/* Add pre-step button */}
              <button
                type="button"
                onClick={() => {
                  let counter = 1;
                  let newId = `pre_step_${counter}`;
                  while (preSteps.some((s) => s.id === newId)) {
                    counter++;
                    newId = `pre_step_${counter}`;
                  }
                  const newPreStep: RequestStep = {
                    id: newId,
                    type: "request",
                    requestId: "",
                    inputMappings: {},
                    saveAs: "",
                  };
                  updatePreSteps([...preSteps, newPreStep]);
                  setSelectedPreStepId(newId);
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md 
                           bg-slate-800/60 text-slate-300 border border-slate-700/50
                           hover:bg-slate-700/80 hover:text-white hover:border-slate-600
                           active:scale-[0.98] active:bg-slate-700
                           transition-all duration-150 ease-out mb-3"
              >
                <svg className="w-3.5 h-3.5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add Pre-Step (Action)
              </button>

              {preSteps.length === 0 ? (
                <div className="rounded-md border border-dashed border-slate-700 bg-slate-900/40 p-3 text-xs text-slate-500">
                  No pre-steps configured. Add one to create test data before your test runs.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-4">
                  {/* Pre-step list */}
                  <div className="space-y-2">
                    {preSteps.map((ps, index) => {
                      const isSelected = ps.id === selectedPreStepId;
                      return (
                        <div
                          key={ps.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedPreStepId(ps.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setSelectedPreStepId(ps.id);
                            }
                          }}
                          className={`w-full text-left rounded-md border px-3 py-2 text-xs transition-colors cursor-pointer ${
                            isSelected
                              ? "border-violet-500/90 bg-slate-900/80 shadow-[0_0_0_1px_rgba(139,92,246,0.6)]"
                              : "border-slate-800 bg-slate-950/40 hover:border-slate-700 hover:bg-slate-900/50"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <Badge variant="neutral">{index + 1}</Badge>
                              <span className="text-[11px] uppercase tracking-wide text-violet-400">Action</span>
                              {ps.name && <span className="text-[11px] text-slate-300">{ps.name}</span>}
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const next = preSteps.filter((s) => s.id !== ps.id);
                                updatePreSteps(next);
                                if (selectedPreStepId === ps.id) {
                                  setSelectedPreStepId(next[0]?.id ?? null);
                                }
                              }}
                              className="px-1 py-0.5 rounded border border-rose-700/60 text-rose-300 hover:border-rose-500 hover:bg-rose-900/40 text-[10px]"
                            >
                              ✕
                            </button>
                          </div>
                          <div className="text-[11px] text-slate-400 truncate">
                            {(ps as RequestStep).requestId || '(select request)'}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Pre-step details */}
                  <div className="rounded-md border border-slate-800 bg-slate-950/60 p-4 space-y-3 text-xs text-slate-200">
                    {!selectedPreStepId || !preSteps.find(p => p.id === selectedPreStepId) ? (
                      <div className="text-slate-500">Select a pre-step to configure it.</div>
                    ) : (() => {
                      const ps = preSteps.find(p => p.id === selectedPreStepId) as RequestStep;
                      return (
                        <>
                          <div>
                            <span className="text-[11px] uppercase tracking-wide text-slate-500">Step name</span>
                            <input
                              className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-violet-500 focus:border-violet-500"
                              value={ps.name || ""}
                              onChange={(e) => {
                                const next = preSteps.map(s => s.id === ps.id ? { ...s, name: e.target.value } : s);
                                updatePreSteps(next);
                              }}
                              placeholder="e.g. create_test_user"
                            />
                            <p className="mt-1 text-[10px] text-slate-500">
                              Used to reference output: <code className="text-cyan-400">${`{preSteps.${ps.name || ps.id}.output}`}</code>
                            </p>
                          </div>

                          <div>
                            <span className="text-[11px] uppercase tracking-wide text-slate-500">Request</span>
                            <select
                              className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-violet-500 focus:border-violet-500"
                              value={ps.requestId}
                              onChange={(e) => {
                                const reqId = e.target.value;
                                const meta = availableRequests.find(r => r.id === reqId);
                                let nextInput: Record<string, any> = ps.inputMappings || {};
                                if (meta && (!nextInput || Object.keys(nextInput).length === 0) && Array.isArray(meta.inputKeys) && meta.inputKeys.length) {
                                  nextInput = meta.inputKeys.reduce<Record<string, any>>((acc, k) => { acc[k] = ""; return acc; }, {});
                                }
                                const next = preSteps.map(s => s.id === ps.id ? { ...s, requestId: reqId, inputMappings: nextInput } : s);
                                updatePreSteps(next);
                              }}
                            >
                              <option value="">Select request…</option>
                              {availableRequests.map((r) => (
                                <option key={r.id} value={r.id}>{r.name || r.id}</option>
                              ))}
                            </select>
                          </div>

                          {/* Inputs */}
                          {ps.requestId && (() => {
                            const req = availableRequests.find(r => r.id === ps.requestId);
                            const mappings = ps.inputMappings || {};
                            const keys: string[] = req && req.inputKeys && req.inputKeys.length
                              ? req.inputKeys
                              : Object.keys(mappings);
                            if (!keys.length) return null;

                            // Compute variables available to this pre-step (test vars + org secrets + earlier pre-step outputs)
                            const currentIdx = preSteps.findIndex(p => p.id === ps.id);
                            const availableVarsForPreStep: { value: string; label: string }[] = [
                              ...testVarOptions,
                              ...orgVariables.map(v => ({ value: `secrets.${v.key}`, label: `secrets.${v.key}` })),
                              ...preSteps.slice(0, currentIdx).flatMap((s) => {
                                const sKey = s.name || s.id;
                                if (s.type === "request") {
                                  const sReq = availableRequests.find(r => r.id === (s as RequestStep).requestId);
                                  if (sReq?.outputKeys?.length) {
                                    return sReq.outputKeys.map(ok => ({
                                      value: `preSteps.${sKey}.output.${ok}`,
                                      label: `preSteps.${sKey}.output.${ok}`,
                                    }));
                                  }
                                  return [{ value: `preSteps.${sKey}.output`, label: `preSteps.${sKey}.output` }];
                                }
                                return [];
                              }),
                            ];

                            return (
                              <div>
                                <span className="text-[11px] uppercase tracking-wide text-slate-500">Inputs</span>
                                <div className="mt-2 space-y-2">
                                  {keys.map((k) => (
                                    <div key={k} className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2 items-center">
                                      <div className="text-[11px] text-slate-400 font-mono truncate" title={k}>{k}</div>
                                      <div className="flex items-center gap-1">
                                        <input
                                          className="flex-1 rounded bg-slate-900 border border-slate-700 px-2 py-1 text-[11px] text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-violet-500 focus:border-violet-500"
                                          value={mappings[k] ?? ""}
                                          onChange={(e) => {
                                            const nextMappings = { ...mappings, [k]: e.target.value };
                                            const next = preSteps.map(s => s.id === ps.id ? { ...s, inputMappings: nextMappings } : s);
                                            updatePreSteps(next);
                                          }}
                                          placeholder="Value or ${var.name}"
                                        />
                                        {availableVarsForPreStep.length > 0 && (
                                          <select
                                            className="shrink-0 rounded bg-slate-800 border border-slate-700 text-[10px] text-slate-400 px-1 py-1 focus:outline-none"
                                            value=""
                                            onChange={(e) => {
                                              if (!e.target.value) return;
                                              const nextMappings = { ...mappings, [k]: `\${${e.target.value}}` };
                                              const next = preSteps.map(s => s.id === ps.id ? { ...s, inputMappings: nextMappings } : s);
                                              updatePreSteps(next);
                                            }}
                                          >
                                            <option value="">Var…</option>
                                            {availableVarsForPreStep.map((v) => (
                                              <option key={v.value} value={v.value}>{v.label}</option>
                                            ))}
                                          </select>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}

                          {/* Outputs preview */}
                          {ps.requestId && (() => {
                            const req = availableRequests.find(r => r.id === ps.requestId);
                            const stepKey = ps.name || ps.id;
                            return (
                              <div className="mt-3 pt-3 border-t border-slate-700/50">
                                <span className="text-[11px] uppercase tracking-wide text-slate-500">Available in Subsequent Steps</span>
                                <div className="mt-2 flex flex-wrap gap-1">
                                  <code className="inline-block px-1.5 py-0.5 text-[10px] font-mono rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                                    preSteps.{stepKey}.output
                                  </code>
                                  {req?.outputKeys?.slice(0, 4).map(k => (
                                    <code key={k} className="inline-block px-1.5 py-0.5 text-[10px] font-mono rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                                      preSteps.{stepKey}.output.{k}
                                    </code>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-slate-200">Steps</div>
          </div>
          
          {/* Add step action buttons */}
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => addStep("message")}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md 
                         bg-slate-800/60 text-slate-300 border border-slate-700/50
                         hover:bg-slate-700/80 hover:text-white hover:border-slate-600
                         active:scale-[0.98] active:bg-slate-700
                         transition-all duration-150 ease-out"
            >
              <svg className="w-3.5 h-3.5 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              Message
            </button>
            <button
              type="button"
              onClick={() => addStep("request")}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md 
                         bg-slate-800/60 text-slate-300 border border-slate-700/50
                         hover:bg-slate-700/80 hover:text-white hover:border-slate-600
                         active:scale-[0.98] active:bg-slate-700
                         transition-all duration-150 ease-out"
            >
              <svg className="w-3.5 h-3.5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Action
            </button>
            <button
              type="button"
              onClick={() => addStep("user_objective")}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md 
                         bg-slate-800/60 text-slate-300 border border-slate-700/50
                         hover:bg-slate-700/80 hover:text-white hover:border-slate-600
                         active:scale-[0.98] active:bg-slate-700
                         transition-all duration-150 ease-out"
            >
              <svg className="w-3.5 h-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              User Objective
            </button>
            <button
              type="button"
              onClick={() => addStep("assistant_check")}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md 
                         bg-slate-800/60 text-slate-300 border border-slate-700/50
                         hover:bg-slate-700/80 hover:text-white hover:border-slate-600
                         active:scale-[0.98] active:bg-slate-700
                         transition-all duration-150 ease-out"
            >
              <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              Check
            </button>
            <button
              type="button"
              onClick={() => addStep("extract")}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md 
                         bg-slate-800/60 text-slate-300 border border-slate-700/50
                         hover:bg-slate-700/80 hover:text-white hover:border-slate-600
                         active:scale-[0.98] active:bg-slate-700
                         transition-all duration-150 ease-out"
            >
              <svg className="w-3.5 h-3.5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Extract
            </button>
          </div>

        {steps.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-700 bg-slate-900/40 p-4 text-xs text-slate-500">
            No steps yet. Add a message, request, or objective to start building this journey.
          </div>
        ) : (
          <div className="space-y-2">
            {steps.map((s, index) => {
              const isSelected = s.id === selectedId;
              const typeLabel =
                s.type === "message"
                  ? "Message"
                  : s.type === "request"
                  ? "Action"
                  : s.type === "user_objective"
                  ? "User Objective"
                  : s.type === "extract"
                  ? "Extract"
                  : "Assistant Check";
              const summary = (() => {
                if (s.type === "message") return (s as MessageStep).content || "(empty)";
                if (s.type === "request") return (s as RequestStep).requestId || "(select request)";
                if (s.type === "user_objective") return (s as UserObjectiveStep).description || "(user goal)";
                if (s.type === "extract") {
                  const e = s as ExtractStep;
                  return e.variableName ? `$\{${e.variableName}}` : "(define variable)";
                }
                const o = s as AssistantCheckStep;
                if (o.mode === "includes") return o.includes || "(must include keywords)";
                if (o.mode === "variable_check") return o.variablePath || "(variable check)";
                return o.rubric || "(assistant check)";
              })();
              return (
                <div
                  key={s.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setSelectedId(s.id);
                    setSelectedAttachedCheckId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedId(s.id);
                      setSelectedAttachedCheckId(null);
                    }
                  }}
                  className={`w-full text-left rounded-md border px-3 py-2 text-xs transition-colors cursor-pointer ${
                    isSelected
                      ? "border-fuchsia-500/90 bg-slate-900/80 shadow-[0_0_0_1px_rgba(244,114,182,0.6)]"
                      : "border-slate-800 bg-slate-950/40 hover:border-slate-700 hover:bg-slate-900/50"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="neutral">
                        {index + 1}
                      </Badge>
                      <span className="text-[11px] uppercase tracking-wide text-slate-400">
                        {typeLabel}
                      </span>
                      {s.name && (
                        <span className="text-[11px] text-slate-300 truncate max-w-[10rem]">
                          {s.name}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-slate-500">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          moveStep(s.id, -1);
                        }}
                        className="px-1 py-0.5 rounded border border-slate-700 hover:border-slate-500 hover:bg-slate-800/60"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          moveStep(s.id, 1);
                        }}
                        className="px-1 py-0.5 rounded border border-slate-700 hover:border-slate-500 hover:bg-slate-800/60"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeStep(s.id);
                        }}
                        className="px-1 py-0.5 rounded border border-rose-700/60 text-rose-300 hover:border-rose-500 hover:bg-rose-900/40"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-400 line-clamp-2 whitespace-pre-wrap break-words">
                    {summary}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        </div>

        <div className="space-y-3">
        <div className="text-sm font-medium text-slate-200">Step details</div>
        {!selected ? (
          <div className="rounded-md border border-slate-800 bg-slate-950/40 p-4 text-xs text-slate-500">
            Select a step on the left to configure its details.
          </div>
        ) : (
          <div className="rounded-md border border-slate-800 bg-slate-950/60 p-4 space-y-4 text-xs text-slate-200">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-[11px] uppercase tracking-wide text-slate-500">Step name</span>
                <input
                  className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-fuchsia-500 focus:border-fuchsia-500"
                  value={selected.name || ""}
                  onChange={(e) => updateStep(selected.id, { name: e.target.value })}
                  placeholder="Optional label, e.g. Create user"
                />
              </div>
            </div>

            {selected.type === "message" && (
              <div className="space-y-3">
                <div>
                  <span className="text-[11px] uppercase tracking-wide text-slate-500">Message</span>
                  <textarea
                    className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-fuchsia-500 focus:border-fuchsia-500 min-h-[120px] font-mono"
                    value={(selected as MessageStep).content}
                    onChange={(e) => updateStep(selected.id, { content: e.target.value } as any)}
                    placeholder={"What the test user says. Use variables like ${account_id} from previous extract steps."}
                  />
                </div>
                {/* Show available variables from extract steps and org variables */}
                {(() => {
                  const extractSteps = steps.filter(s => s.type === "extract" && (s as ExtractStep).variableName) as ExtractStep[];
                  const requestSteps = steps.filter(s => s.type === "request" && (s as RequestStep).saveAs) as RequestStep[];
                  const activeTestVars = testVariables.filter(tv => tv.key);
                  if (!extractSteps.length && !requestSteps.length && !orgVariables.length && !activeTestVars.length) return null;
                  return (
                    <div className="rounded-md bg-slate-900/50 border border-slate-700/50 p-2">
                      <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1.5">Available Variables</div>
                      <div className="flex flex-wrap gap-1">
                        {activeTestVars.map((tv) => (
                          <button
                            key={`tv-${tv.key}`}
                            type="button"
                            onClick={() => {
                              const current = (selected as MessageStep).content || "";
                              updateStep(selected.id, { content: current + `\${var.${tv.key}}` } as any);
                            }}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 transition-colors"
                            title={`Test variable: ${tv.key} = ${tv.value}`}
                          >
                            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                            </svg>
                            var.{tv.key}
                          </button>
                        ))}
                        {orgVariables.map((ov) => (
                          <button
                            key={ov.key}
                            type="button"
                            onClick={() => {
                              const current = (selected as MessageStep).content || "";
                              updateStep(selected.id, { content: current + `\${secrets.${ov.key}}` } as any);
                            }}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 transition-colors"
                            title={`Org variable: ${ov.key}`}
                          >
                            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                            </svg>
                            {ov.key}
                          </button>
                        ))}
                        {extractSteps.map((es) => (
                          <button
                            key={es.id}
                            type="button"
                            onClick={() => {
                              const current = (selected as MessageStep).content || "";
                              updateStep(selected.id, { content: current + `\${${es.variableName}}` } as any);
                            }}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/20 transition-colors"
                          >
                            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            {es.variableName}
                          </button>
                        ))}
                        {requestSteps.map((rs) => (
                          <button
                            key={rs.id}
                            type="button"
                            onClick={() => {
                              const current = (selected as MessageStep).content || "";
                              updateStep(selected.id, { content: current + `\${${rs.saveAs}}` } as any);
                            }}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono rounded bg-violet-500/10 text-violet-400 border border-violet-500/30 hover:bg-violet-500/20 transition-colors"
                          >
                            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            {rs.saveAs}
                          </button>
                        ))}
                      </div>
                      <p className="mt-1.5 text-[9px] text-slate-500">Click to insert at cursor position</p>
                    </div>
                  );
                })()}

                {/* Assistant Input Mappings - allow passing additional values to the assistant request */}
                {assistantInputKeys.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-800">
                    <span className="text-[11px] uppercase tracking-wide text-slate-500">Assistant Request Inputs</span>
                    <p className="text-[10px] text-slate-500 mt-1 mb-2">
                      Pass additional values to the assistant's chat endpoint (conversation ID, session data, etc.)
                    </p>
                    <div className="space-y-2">
                      {assistantInputKeys.map((inputKey) => {
                        const msgStep = selected as MessageStep;
                        const mappings = msgStep.assistantInputMappings || {};
                        const inputInfo = assistantChatConfig?.inputSchema?.properties?.[inputKey];
                        const isRequired = assistantChatConfig?.inputSchema?.required?.includes(inputKey);
                        
                        // Get preceding steps for variable dropdown
                        const selectedIdx = steps.findIndex(s => s.id === selected.id);
                        const priorVars = variableOptions.filter((_, i) => {
                          // Only include variables from steps before current one
                          const stepForVar = steps.find(s => {
                            const key = s.name || s.id;
                            return variableOptions[i]?.value.includes(`steps.${key}`);
                          });
                          return stepForVar && steps.indexOf(stepForVar) < selectedIdx;
                        });
                        
                        return (
                          <div key={inputKey} className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2 items-start">
                            <div className="flex items-center gap-1">
                              <span className="text-[11px] text-slate-400 font-mono truncate" title={inputKey}>
                                {inputKey}
                              </span>
                              {isRequired && <span className="text-[9px] text-rose-400">*</span>}
                            </div>
                            <div className="space-y-1">
                              <input
                                className="w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-[11px] text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-fuchsia-500 focus:border-fuchsia-500"
                                value={mappings[inputKey] ?? ""}
                                onChange={(e) => {
                                  const next = { ...(msgStep.assistantInputMappings || {}), [inputKey]: e.target.value };
                                  updateStep(selected.id, { assistantInputMappings: next } as any);
                                }}
                                placeholder={inputInfo?.description || `Enter ${inputKey}`}
                              />
                              {priorVars.length > 0 && (
                                <select
                                  className="w-full rounded bg-slate-900 border border-slate-700 px-2 py-0.5 text-[10px] text-slate-400 focus:outline-none"
                                  value=""
                                  onChange={(e) => {
                                    if (!e.target.value) return;
                                    const next = { ...(msgStep.assistantInputMappings || {}), [inputKey]: `\${${e.target.value}}` };
                                    updateStep(selected.id, { assistantInputMappings: next } as any);
                                  }}
                                >
                                  <option value="">Insert variable…</option>
                                  {priorVars.map(v => (
                                    <option key={v.value} value={v.value}>{v.label}</option>
                                  ))}
                                </select>
                              )}
                              {inputInfo?.description && (
                                <p className="text-[9px] text-slate-500">{inputInfo.description}</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Show expected outputs from this step */}
                {assistantOutputKeys.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-800">
                    <span className="text-[11px] uppercase tracking-wide text-slate-500">Available Outputs</span>
                    <p className="text-[10px] text-slate-500 mt-1 mb-2">
                      These variables will be available in subsequent steps:
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {assistantOutputKeys.map((k) => {
                        const stepKey = selected.name || selected.id;
                        return (
                          <code key={k} className="inline-block px-1.5 py-0.5 text-[10px] font-mono rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                            steps.{stepKey}.output.{k}
                          </code>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {selected.type === "extract" && (
              <div className="space-y-3">
                {/* LLM Extraction Info Banner */}
                <div className="rounded-md bg-cyan-500/10 border border-cyan-500/20 p-2">
                  <p className="text-[10px] text-cyan-300">
                    <strong>🤖 LLM-Powered Extraction:</strong> An AI will analyze the conversation and extract the requested data into a variable you can use in subsequent steps.
                  </p>
                </div>
                
                <div>
                  <span className="text-[11px] uppercase tracking-wide text-slate-500">Variable Name</span>
                  <input
                    className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-xs text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500"
                    value={(selected as ExtractStep).variableName}
                    onChange={(e) => updateStep(selected.id, { variableName: e.target.value.replace(/[^a-zA-Z0-9_]/g, '_') } as any)}
                    placeholder="e.g. account_id, order_number"
                  />
                  <p className="mt-1 text-[10px] text-slate-500">
                    Name for the extracted value. Use only letters, numbers, and underscores.
                  </p>
                </div>
                <div>
                  <span className="text-[11px] uppercase tracking-wide text-slate-500">What to Extract</span>
                  <textarea
                    className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 min-h-[80px]"
                    value={(selected as ExtractStep).description}
                    onChange={(e) => updateStep(selected.id, { description: e.target.value } as any)}
                    placeholder="Describe what to find and extract, e.g. 'The confirmation number or order ID from the assistant's response'"
                  />
                  <p className="mt-1 text-[10px] text-slate-500">
                    Be specific! The LLM uses this description to find and extract the right piece of data.
                  </p>
                </div>
                <div>
                  <span className="text-[11px] uppercase tracking-wide text-slate-500">Search Scope</span>
                  <select
                    className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500"
                    value={(selected as ExtractStep).scope || "last"}
                    onChange={(e) => updateStep(selected.id, { scope: e.target.value as "last" | "transcript" } as any)}
                  >
                    <option value="last">Last assistant message only</option>
                    <option value="transcript">Entire conversation history</option>
                  </select>
                  <p className="mt-1 text-[10px] text-slate-500">
                    {(selected as ExtractStep).scope === "transcript" 
                      ? "Searches through all messages in the conversation."
                      : "Only looks at the most recent assistant response."}
                  </p>
                </div>
                
                {/* Usage Preview */}
                {(selected as ExtractStep).variableName && (
                  <div className="rounded-md bg-slate-900 border border-slate-700 p-3">
                    <span className="text-[11px] uppercase tracking-wide text-slate-500">How to Use This Variable</span>
                    <div className="mt-2 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-400 w-24">In messages:</span>
                        <code className="text-[11px] text-cyan-400 bg-slate-800 px-2 py-0.5 rounded">{`\${${(selected as ExtractStep).variableName}}`}</code>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-400 w-24">In requests:</span>
                        <code className="text-[11px] text-cyan-400 bg-slate-800 px-2 py-0.5 rounded">{`\${bag.var.${(selected as ExtractStep).variableName}}`}</code>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-400 w-24">By step ID:</span>
                        <code className="text-[11px] text-cyan-400 bg-slate-800 px-2 py-0.5 rounded">{`$steps.${selected.id || 'step_id'}.output`}</code>
                      </div>
                    </div>
                    <p className="mt-2 text-[9px] text-slate-500">
                      💡 Tip: The variable will be available in all subsequent steps after this extraction runs.
                    </p>
                  </div>
                )}

                {/* Test Extraction Panel */}
                <div className="mt-4 pt-4 border-t border-slate-700/50">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                      Test Extraction
                    </span>
                    <button
                      type="button"
                      onClick={() => testExtraction(selected as ExtractStep, extractSampleText)}
                      disabled={testingStepId === selected.id || !extractSampleText.trim() || !(selected as ExtractStep).description}
                      className="px-2.5 py-1 text-[10px] font-medium rounded bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {testingStepId === selected.id ? 'Extracting…' : 'Extract'}
                    </button>
                  </div>
                  <p className="mt-1 text-[9px] text-slate-500">
                    Paste sample assistant text below to test what the LLM extracts based on your description.
                  </p>
                  
                  <div className="mt-2">
                    <textarea
                      className="w-full rounded bg-slate-900 border border-slate-700 px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 min-h-[80px] placeholder:text-slate-500"
                      value={extractSampleText}
                      onChange={(e) => setExtractSampleText(e.target.value)}
                      placeholder="Paste sample assistant response here, e.g. 'Your order has been placed! Order ID: ORD-12345'"
                    />
                  </div>
                  
                  {/* Test Result */}
                  {testResults[selected.id] && (
                    <div className={`mt-3 rounded-md border p-3 ${testResults[selected.id].success ? 'bg-cyan-500/5 border-cyan-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {testResults[selected.id].success ? (
                            <span className="inline-flex items-center gap-1 text-[10px] text-cyan-400">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                              Extracted
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] text-red-400">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                              Failed
                            </span>
                          )}
                        </div>
                        <span className="text-[9px] text-slate-500">
                          {testResults[selected.id].timestamp.toLocaleTimeString()}
                        </span>
                      </div>
                      {testResults[selected.id].error && (
                        <p className="text-[10px] text-red-400 mb-2">{testResults[selected.id].error}</p>
                      )}
                      {testResults[selected.id].success && testResults[selected.id].data && (
                        <div className="space-y-2">
                          <div className="flex items-start gap-2">
                            <span className="text-[10px] text-slate-400 shrink-0">Value:</span>
                            <code className="text-[11px] text-cyan-300 bg-slate-900 px-2 py-0.5 rounded break-all">
                              {String(testResults[selected.id].data.value ?? 'null')}
                            </code>
                          </div>
                          {testResults[selected.id].data.reasoning && (
                            <div className="flex items-start gap-2">
                              <span className="text-[10px] text-slate-400 shrink-0">Reasoning:</span>
                              <span className="text-[10px] text-slate-300">{testResults[selected.id].data.reasoning}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {selected.type === "request" && (
              <div className="space-y-3">
                <div>
                  <span className="text-[11px] uppercase tracking-wide text-slate-500">Request</span>
                  <select
                    className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-fuchsia-500 focus:border-fuchsia-500"
                    value={(selected as RequestStep).requestId}
                    onChange={(e) => {
                      const reqId = e.target.value;
                      const current = selected as RequestStep;
                      const meta = availableRequests.find(r => r.id === reqId);
                      let nextInput: Record<string, any> | undefined = current.inputMappings || {};
                      if (meta && (!nextInput || Object.keys(nextInput).length === 0) && Array.isArray(meta.inputKeys) && meta.inputKeys.length) {
                        nextInput = meta.inputKeys.reduce<Record<string, any>>((acc, k) => { acc[k] = ""; return acc; }, {});
                      }
                      updateStep(selected.id, { requestId: reqId, inputMappings: nextInput } as any);
                    }}
                  >
                    <option value="">Select request…</option>
                    {availableRequests.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name || r.id}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[10px] text-slate-500">
                    Requests come from your configured Request definitions.
                  </p>
                </div>

                <div>
                  <span className="text-[11px] uppercase tracking-wide text-slate-500">Inputs</span>
                  {(() => {
                    const req = availableRequests.find(r => r.id === (selected as RequestStep).requestId);
                    const mappings = (selected as RequestStep).inputMappings || {};
                    const keys: string[] = req && req.inputKeys && req.inputKeys.length
                      ? req.inputKeys
                      : Object.keys(mappings);
                    const extractSteps = steps.filter(s => s.type === "extract" && (s as ExtractStep).variableName) as ExtractStep[];
                    const requestSteps = steps.filter(s => s.type === "request" && (s as RequestStep).saveAs && s.id !== selected.id) as RequestStep[];
                    if (!keys.length) {
                      return (
                        <p className="mt-1 text-[10px] text-slate-500">
                          This request does not declare input fields. You can still add keys by editing JSON in advanced mode.
                        </p>
                      );
                    }
                    return (
                      <div className="mt-2 space-y-2">
                        {keys.map((k) => (
                          <div key={k} className="space-y-1">
                            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2 items-center">
                              <div className="text-[11px] text-slate-400 font-mono truncate" title={k}>{k}</div>
                              <input
                                className="w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-[11px] text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-fuchsia-500 focus:border-fuchsia-500"
                                value={mappings[k] ?? ""}
                                onChange={(e) => {
                                  const next = { ...mappings, [k]: e.target.value };
                                  updateStep(selected.id, { inputMappings: next } as any);
                                }}
                                placeholder={`Value or \${variable_name}`}
                              />
                            </div>
                            {(extractSteps.length > 0 || requestSteps.length > 0 || orgVariables.length > 0) && (
                              <div className="flex flex-wrap gap-1 ml-auto pl-[calc(33.33%+0.5rem)]">
                                {orgVariables.map((ov) => (
                                  <button
                                    key={ov.key}
                                    type="button"
                                    onClick={() => {
                                      const next = { ...mappings, [k]: `\${secrets.${ov.key}}` };
                                      updateStep(selected.id, { inputMappings: next } as any);
                                    }}
                                    className="px-1 py-0.5 text-[9px] font-mono rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 transition-colors"
                                    title={`Org variable: ${ov.key}`}
                                  >
                                    {ov.key}
                                  </button>
                                ))}
                                {extractSteps.map((es) => (
                                  <button
                                    key={es.id}
                                    type="button"
                                    onClick={() => {
                                      const next = { ...mappings, [k]: `\${${es.variableName}}` };
                                      updateStep(selected.id, { inputMappings: next } as any);
                                    }}
                                    className="px-1 py-0.5 text-[9px] font-mono rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/20 transition-colors"
                                  >
                                    {es.variableName}
                                  </button>
                                ))}
                                {requestSteps.map((rs) => (
                                  <button
                                    key={rs.id}
                                    type="button"
                                    onClick={() => {
                                      const next = { ...mappings, [k]: `\${${rs.saveAs}}` };
                                      updateStep(selected.id, { inputMappings: next } as any);
                                    }}
                                    className="px-1 py-0.5 text-[9px] font-mono rounded bg-violet-500/10 text-violet-400 border border-violet-500/30 hover:bg-violet-500/20 transition-colors"
                                  >
                                    {rs.saveAs}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                  <p className="mt-2 text-[10px] text-slate-500">
                    Values can reference extracted variables like <code className="font-mono text-[10px] text-cyan-400">${"${account_id}"}</code> or org variables like <code className="font-mono text-[10px] text-amber-400">${"${secrets.API_KEY}"}</code>.
                  </p>
                </div>

                <div>
                  <span className="text-[11px] uppercase tracking-wide text-slate-500">Outputs</span>
                  {(() => {
                    const req = availableRequests.find(r => r.id === (selected as RequestStep).requestId);
                    const stepKey = (selected as RequestStep).saveAs || selected.name || selected.id;
                    if (!req || !req.outputKeys || !req.outputKeys.length) {
                      return (
                        <p className="mt-1 text-[10px] text-slate-500">
                          Response will be available as <code className="font-mono text-[10px] text-slate-300">${`steps.${stepKey}.output`}</code>.
                        </p>
                      );
                    }
                    return (
                      <div className="mt-1 space-y-1 text-[10px] text-slate-500">
                        <p>
                          This step exposes read-only variables like:
                        </p>
                        <ul className="list-disc list-inside space-y-0.5">
                          {req.outputKeys.slice(0, 6).map((k) => (
                            <li key={k}>
                              <code className="font-mono text-[10px] text-slate-300">{`steps.${stepKey}.output.${k}`}</code>
                            </li>
                          ))}
                          {req.outputKeys.length > 6 && (
                            <li>…</li>
                          )}
                        </ul>
                      </div>
                    );
                  })()}
                </div>

                {/* Test Request Panel */}
                <div className="mt-4 pt-4 border-t border-slate-700/50">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Test Request
                    </span>
                    <button
                      type="button"
                      onClick={() => testRequest(selected as RequestStep)}
                      disabled={testingStepId === selected.id || !(selected as RequestStep).requestId}
                      className="px-2.5 py-1 text-[10px] font-medium rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {testingStepId === selected.id ? 'Running…' : 'Run Now'}
                    </button>
                  </div>
                  <p className="mt-1 text-[9px] text-slate-500">
                    Execute this request with the current input values to test connectivity and see the response.
                  </p>
                  
                  {/* Test Result - Comprehensive View */}
                  {testResults[selected.id] && (
                    <div className={`mt-3 rounded-md border ${testResults[selected.id].success ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
                      {/* Status Header */}
                      <div className="flex items-center justify-between p-3 border-b border-slate-800/50">
                        <div className="flex items-center gap-3">
                          {testResults[selected.id].success ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                              Success
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-400">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                              Failed
                            </span>
                          )}
                          {testResults[selected.id].data?.status && (
                            <span className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                              testResults[selected.id].data.status >= 200 && testResults[selected.id].data.status < 300 
                                ? 'bg-emerald-500/20 text-emerald-300' 
                                : testResults[selected.id].data.status >= 400 
                                  ? 'bg-red-500/20 text-red-300' 
                                  : 'bg-amber-500/20 text-amber-300'
                            }`}>
                              {testResults[selected.id].data.status}
                            </span>
                          )}
                          {testResults[selected.id].latencyMs && (
                            <span className="text-[10px] text-slate-400">
                              {testResults[selected.id].latencyMs}ms
                            </span>
                          )}
                        </div>
                        <span className="text-[9px] text-slate-500">
                          {testResults[selected.id].timestamp.toLocaleTimeString()}
                        </span>
                      </div>
                      
                      {testResults[selected.id].error && (
                        <div className="px-3 py-2 bg-red-500/10 border-b border-red-500/20">
                          <p className="text-[10px] text-red-400">{testResults[selected.id].error}</p>
                          {testResults[selected.id].data?.message && (
                            <p className="text-[10px] text-red-300 mt-1">{testResults[selected.id].data.message}</p>
                          )}
                        </div>
                      )}
                      
                      {testResults[selected.id].data && (
                        <div className="divide-y divide-slate-800/50">
                          {/* Request Section */}
                          {testResults[selected.id].data.request && (
                            <details className="group" open>
                              <summary className="px-3 py-2 text-[10px] text-slate-400 cursor-pointer hover:text-slate-300 hover:bg-slate-800/30 flex items-center gap-2">
                                <svg className="w-3 h-3 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                </svg>
                                <span className="font-medium uppercase tracking-wide">Request</span>
                              </summary>
                              <div className="px-3 pb-3 space-y-2">
                                {/* Method & URL */}
                                <div className="flex items-start gap-2">
                                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold ${
                                    testResults[selected.id].data.request.method === 'GET' ? 'bg-blue-500/20 text-blue-300' :
                                    testResults[selected.id].data.request.method === 'POST' ? 'bg-green-500/20 text-green-300' :
                                    testResults[selected.id].data.request.method === 'PUT' ? 'bg-amber-500/20 text-amber-300' :
                                    testResults[selected.id].data.request.method === 'PATCH' ? 'bg-orange-500/20 text-orange-300' :
                                    testResults[selected.id].data.request.method === 'DELETE' ? 'bg-red-500/20 text-red-300' :
                                    'bg-slate-500/20 text-slate-300'
                                  }`}>
                                    {testResults[selected.id].data.request.method}
                                  </span>
                                  <code className="text-[10px] text-slate-300 font-mono break-all">
                                    {testResults[selected.id].data.request.url}
                                  </code>
                                </div>
                                
                                {/* Request Headers */}
                                {testResults[selected.id].data.request.headers && Object.keys(testResults[selected.id].data.request.headers).filter(k => testResults[selected.id].data.request.headers[k]).length > 0 && (
                                  <div>
                                    <div className="text-[9px] uppercase tracking-wide text-slate-500 mb-1">Headers</div>
                                    <div className="rounded bg-slate-900/60 border border-slate-800/50 p-2 space-y-0.5">
                                      {Object.entries(testResults[selected.id].data.request.headers)
                                        .filter(([_, v]) => v)
                                        .map(([k, v]) => (
                                          <div key={k} className="flex items-start gap-2 text-[9px] font-mono">
                                            <span className="text-slate-400 shrink-0">{k}:</span>
                                            <span className="text-slate-300 break-all">{String(v)}</span>
                                          </div>
                                        ))}
                                    </div>
                                  </div>
                                )}
                                
                                {/* Request Body */}
                                {testResults[selected.id].data.request.body && (
                                  <div>
                                    <div className="text-[9px] uppercase tracking-wide text-slate-500 mb-1">Body</div>
                                    <pre className="rounded bg-slate-900/60 border border-slate-800/50 p-2 text-[9px] text-slate-300 font-mono overflow-x-auto max-h-32 overflow-y-auto">
                                      {(() => {
                                        try {
                                          const parsed = JSON.parse(testResults[selected.id].data.request.body);
                                          return JSON.stringify(parsed, null, 2);
                                        } catch {
                                          return testResults[selected.id].data.request.body;
                                        }
                                      })()}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            </details>
                          )}
                          
                          {/* Response Section */}
                          <details className="group" open>
                            <summary className="px-3 py-2 text-[10px] text-slate-400 cursor-pointer hover:text-slate-300 hover:bg-slate-800/30 flex items-center gap-2">
                              <svg className="w-3 h-3 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                              </svg>
                              <span className="font-medium uppercase tracking-wide">Response</span>
                              {testResults[selected.id].data.contentType && (
                                <span className="text-[9px] text-slate-500 font-normal">
                                  ({testResults[selected.id].data.contentType.split(';')[0]})
                                </span>
                              )}
                            </summary>
                            <div className="px-3 pb-3">
                              <pre className="rounded bg-slate-900/60 border border-slate-800/50 p-2 text-[9px] text-slate-300 font-mono overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap break-all">
                                {(() => {
                                  const payload = testResults[selected.id].data?.payload;
                                  if (!payload) return '(empty response)';
                                  if (typeof payload === 'string') {
                                    // Try to format if it looks like JSON
                                    try {
                                      const parsed = JSON.parse(payload);
                                      return JSON.stringify(parsed, null, 2);
                                    } catch {
                                      // Check if it's HTML - show a preview
                                      if (payload.trim().startsWith('<')) {
                                        const titleMatch = payload.match(/<title[^>]*>([^<]*)<\/title>/i);
                                        const title = titleMatch?.[1]?.trim();
                                        return `[HTML Response${title ? `: ${title}` : ''}]\n\n${payload.slice(0, 2000)}${payload.length > 2000 ? '\n...(truncated)' : ''}`;
                                      }
                                      return payload;
                                    }
                                  }
                                  return JSON.stringify(payload, null, 2);
                                })()}
                              </pre>
                            </div>
                          </details>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {selected.type === "user_objective" && (
              <div className="space-y-3">
                <div>
                  <span className="text-[11px] uppercase tracking-wide text-slate-500">User objective</span>
                  <textarea
                    className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-fuchsia-500 focus:border-fuchsia-500 min-h-[120px]"
                    value={(selected as UserObjectiveStep).description}
                    onChange={(e) => updateStep(selected.id, { description: e.target.value } as any)}
                    placeholder="Describe what the simulated user is trying to accomplish."
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <span className="text-[11px] uppercase tracking-wide text-slate-500">Min turns</span>
                    <input
                      type="number"
                      min={1}
                      className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-fuchsia-500 focus:border-fuchsia-500"
                      value={(selected as UserObjectiveStep).minTurns ?? 1}
                      onChange={(e) => updateStep(selected.id, { minTurns: Number(e.target.value || 1) } as any)}
                    />
                  </div>
                  <div>
                    <span className="text-[11px] uppercase tracking-wide text-slate-500">Max turns</span>
                    <input
                      type="number"
                      min={1}
                      className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-fuchsia-500 focus:border-fuchsia-500"
                      value={(selected as UserObjectiveStep).maxTurns ?? 8}
                      onChange={(e) => updateStep(selected.id, { maxTurns: Number(e.target.value || 8) } as any)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-[11px] text-slate-300">
                    <input
                      type="checkbox"
                      className="h-3 w-3 rounded border-slate-600 bg-slate-900"
                      checked={(selected as UserObjectiveStep).iterativeConversation !== false}
                      onChange={(e) => updateStep(selected.id, { iterativeConversation: e.target.checked } as any)}
                    />
                    <span>Iterative conversation (user keeps trying toward this goal)</span>
                  </label>
                </div>

                {/* Exit conditions */}
                <div className="mt-3 border-t border-slate-800 pt-3">
                  <span className="text-[11px] uppercase tracking-wide text-slate-500">Exit conditions</span>
                  <p className="text-[10px] text-slate-500 mt-1 mb-2">
                    Control when the conversation stops based on assertion results.
                  </p>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-[11px] text-slate-300">
                      <input
                        type="checkbox"
                        className="h-3 w-3 rounded border-slate-600 bg-slate-900"
                        checked={(selected as UserObjectiveStep).exitOnPass !== false}
                        onChange={(e) => updateStep(selected.id, { exitOnPass: e.target.checked } as any)}
                      />
                      <span>Exit on pass</span>
                      <span className="text-slate-500">(stop when assertion passes)</span>
                    </label>
                    <label className="flex items-center gap-2 text-[11px] text-slate-300">
                      <input
                        type="checkbox"
                        className="h-3 w-3 rounded border-slate-600 bg-slate-900"
                        checked={(selected as UserObjectiveStep).exitOnFail === true}
                        onChange={(e) => updateStep(selected.id, { exitOnFail: e.target.checked } as any)}
                      />
                      <span>Exit on fail</span>
                      <span className="text-slate-500">(stop when assertion fails)</span>
                    </label>
                  </div>
                </div>

                <div className="mt-3 border-t border-slate-800 pt-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] uppercase tracking-wide text-slate-500">Attached assistant checks</span>
                    <Button
                      onClick={() => {
                        const current = selected as UserObjectiveStep;
                        const nextChecks = [
                          ...((current.attachedChecks as AssistantCheckStep[] | undefined) || []),
                          {
                            id: `${selected.id}_check_${((current.attachedChecks || []).length + 1)}`,
                            type: "assistant_check",
                            mode: "judge" as ObjectiveMode,
                            rubric: "",
                          } as AssistantCheckStep,
                        ];
                        updateStep(selected.id, { attachedChecks: nextChecks } as any);
                        const newCheck = nextChecks[nextChecks.length - 1];
                        setSelectedAttachedCheckId(newCheck.id);
                      }}
                    >
                      + Add check
                    </Button>
                  </div>
                  {((selected as UserObjectiveStep).attachedChecks || []).length === 0 ? (
                    <p className="text-[10px] text-slate-500">
                      Optional. Attach one or more assistant checks that are evaluated on each turn while this objective is running.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {(selected as UserObjectiveStep).attachedChecks!.map((check, idx) => (
                        <div
                          key={check.id}
                          className={`rounded border p-2 space-y-2 cursor-pointer ${
                            selectedAttachedCheckId === check.id
                              ? "border-fuchsia-500/80 bg-slate-900/80"
                              : "border-slate-800 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-900/60"
                          }`}
                          onClick={() => setSelectedAttachedCheckId(check.id)}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-slate-400">
                              Check {idx + 1}
                            </span>
                            <button
                              type="button"
                              className="px-1 py-0.5 rounded border border-rose-700/60 text-rose-300 hover:border-rose-500 hover:bg-rose-900/40 text-[10px]"
                              onClick={() => {
                                const current = selected as UserObjectiveStep;
                                const nextChecks = (current.attachedChecks || []).filter((c) => c.id !== check.id);
                                updateStep(selected.id, { attachedChecks: nextChecks } as any);
                                if (selectedAttachedCheckId === check.id) {
                                  setSelectedAttachedCheckId(null);
                                }
                              }}
                            >
                              Remove
                            </button>
                          </div>

                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <span className="text-[10px] uppercase tracking-wide text-slate-500">Mode</span>
                              <select
                                className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-[10px] text-slate-100 focus:outline-none focus:ring-1 focus:ring-fuchsia-500 focus:border-fuchsia-500"
                                value={check.mode || "judge"}
                                onChange={(e) => {
                                  const current = selected as UserObjectiveStep;
                                  const nextChecks = (current.attachedChecks || []).map((c) =>
                                    c.id === check.id ? { ...c, mode: e.target.value as ObjectiveMode } : c
                                  );
                                  updateStep(selected.id, { attachedChecks: nextChecks } as any);
                                }}
                              >
                                <option value="judge">Judge (LLM)</option>
                                <option value="includes">Must include</option>
                                <option value="variable_check">Variable check</option>
                              </select>
                            </div>
                            <div>
                              <span className="text-[10px] uppercase tracking-wide text-slate-500">Severity</span>
                              <select
                                className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-[10px] text-slate-100 focus:outline-none focus:ring-1 focus:ring-fuchsia-500 focus:border-fuchsia-500"
                                value={check.severity || "error"}
                                onChange={(e) => {
                                  const current = selected as UserObjectiveStep;
                                  const nextChecks = (current.attachedChecks || []).map((c) =>
                                    c.id === check.id ? { ...c, severity: e.target.value as "error" | "warning" } : c
                                  );
                                  updateStep(selected.id, { attachedChecks: nextChecks } as any);
                                }}
                              >
                                <option value="error">Error (fail test)</option>
                                <option value="warning">Warning (info only)</option>
                              </select>
                            </div>
                          </div>

                          {check.mode === "judge" && (
                            <div className="space-y-2">
                              <div>
                                <span className="text-[10px] uppercase tracking-wide text-slate-500">Rubric</span>
                                <textarea
                                  className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-[10px] text-slate-100 focus:outline-none focus:ring-1 focus:ring-fuchsia-500 focus:border-fuchsia-500 min-h-[80px]"
                                  value={check.rubric || ""}
                                  onChange={(e) => {
                                    const current = selected as UserObjectiveStep;
                                    const nextChecks = (current.attachedChecks || []).map((c) =>
                                      c.id === check.id ? { ...c, rubric: e.target.value } : c
                                    );
                                    updateStep(selected.id, { attachedChecks: nextChecks } as any);
                                  }}
                                  placeholder="What should the assistant be doing while this objective runs?"
                                />
                              </div>
                              <div>
                                <span className="text-[10px] uppercase tracking-wide text-slate-500">Threshold</span>
                                <div className="flex items-center gap-2 mt-1">
                                  <input
                                    type="number"
                                    min="0"
                                    max="1"
                                    step="0.05"
                                    className="w-24 rounded bg-slate-900 border border-slate-700 px-2 py-1 text-[10px] text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-fuchsia-500 focus:border-fuchsia-500"
                                    value={check.threshold ?? ""}
                                    onChange={(e) => {
                                      const current = selected as UserObjectiveStep;
                                      const val = e.target.value === "" ? undefined : parseFloat(e.target.value);
                                      const nextChecks = (current.attachedChecks || []).map((c) =>
                                        c.id === check.id ? { ...c, threshold: val } : c
                                      );
                                      updateStep(selected.id, { attachedChecks: nextChecks } as any);
                                    }}
                                    placeholder="0.75"
                                  />
                                  <span className="text-[10px] text-slate-500">Score required to pass (0-1, default: 0.75)</span>
                                </div>
                              </div>
                            </div>
                          )}

                          {check.mode === "includes" && (
                            <div>
                              <span className="text-[10px] uppercase tracking-wide text-slate-500">Required keywords</span>
                              <textarea
                                className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-[10px] text-slate-100 focus:outline-none focus:ring-1 focus:ring-fuchsia-500 focus:border-fuchsia-500 min-h-[60px]"
                                value={check.includes || ""}
                                onChange={(e) => {
                                  const current = selected as UserObjectiveStep;
                                  const nextChecks = (current.attachedChecks || []).map((c) =>
                                    c.id === check.id ? { ...c, includes: e.target.value } : c
                                  );
                                  updateStep(selected.id, { attachedChecks: nextChecks } as any);
                                }}
                                placeholder="comma,separated,keywords"
                              />
                            </div>
                          )}

                          {check.mode === "variable_check" && (
                            <div className="space-y-2">
                              {/* Left operand */}
                              <div>
                                <span className="text-[10px] uppercase tracking-wide text-slate-500">Left Value</span>
                                <select
                                  className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-[10px] text-slate-100 focus:outline-none focus:ring-1 focus:ring-fuchsia-500 focus:border-fuchsia-500"
                                  value={check.variablePath || ""}
                                  onChange={(e) => {
                                    const current = selected as UserObjectiveStep;
                                    const nextChecks = (current.attachedChecks || []).map((c) =>
                                      c.id === check.id ? { ...c, variablePath: e.target.value } : c
                                    );
                                    updateStep(selected.id, { attachedChecks: nextChecks } as any);
                                  }}
                                >
                                  <option value="">Select variable…</option>
                                  {variableOptions.map((v) => (
                                    <option key={v.value} value={v.value}>{v.label}</option>
                                  ))}
                                </select>
                                <input
                                  className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-[9px] text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-fuchsia-500 focus:border-fuchsia-500"
                                  value={check.variablePath || ""}
                                  onChange={(e) => {
                                    const current = selected as UserObjectiveStep;
                                    const nextChecks = (current.attachedChecks || []).map((c) =>
                                      c.id === check.id ? { ...c, variablePath: e.target.value } : c
                                    );
                                    updateStep(selected.id, { attachedChecks: nextChecks } as any);
                                  }}
                                  placeholder="Or type: steps.my_step.output.field"
                                />
                              </div>
                              {/* Operator */}
                              <div>
                                <span className="text-[10px] uppercase tracking-wide text-slate-500">Operator</span>
                                <select
                                  className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-[10px] text-slate-100 focus:outline-none focus:ring-1 focus:ring-fuchsia-500 focus:border-fuchsia-500"
                                  value={check.operator || "eq"}
                                  onChange={(e) => {
                                    const current = selected as UserObjectiveStep;
                                    const nextChecks = (current.attachedChecks || []).map((c) =>
                                      c.id === check.id ? { ...c, operator: e.target.value as ComparisonOperator } : c
                                    );
                                    updateStep(selected.id, { attachedChecks: nextChecks } as any);
                                  }}
                                >
                                  <option value="eq">= Equals</option>
                                  <option value="neq">≠ Not equals</option>
                                  <option value="gt">&gt; Greater than</option>
                                  <option value="gte">≥ Greater than or equal</option>
                                  <option value="lt">&lt; Less than</option>
                                  <option value="lte">≤ Less than or equal</option>
                                  <option value="contains">Contains</option>
                                  <option value="not_contains">Does not contain</option>
                                  <option value="regex">Matches regex</option>
                                  <option value="exists">Exists</option>
                                  <option value="not_exists">Does not exist</option>
                                </select>
                              </div>
                              {/* Right operand - hidden for exists/not_exists */}
                              {check.operator !== "exists" && check.operator !== "not_exists" && (
                                <div>
                                  <span className="text-[10px] uppercase tracking-wide text-slate-500">
                                    {check.operator === "regex" ? "Regex Pattern" : "Right Value"}
                                  </span>
                                  <input
                                    className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-[10px] text-slate-100 focus:outline-none focus:ring-1 focus:ring-fuchsia-500 focus:border-fuchsia-500"
                                    value={check.expectEquals || check.rightValue || ""}
                                    onChange={(e) => {
                                      const current = selected as UserObjectiveStep;
                                      const nextChecks = (current.attachedChecks || []).map((c) =>
                                        c.id === check.id ? { ...c, expectEquals: e.target.value, rightValue: e.target.value } : c
                                      );
                                      updateStep(selected.id, { attachedChecks: nextChecks } as any);
                                    }}
                                    placeholder={
                                      check.operator === "regex" 
                                        ? "^[A-Z]{3}-\\d{4}$" 
                                        : "value or ${variable}"
                                    }
                                  />
                                  {variableOptions.length > 0 && (
                                    <select
                                      className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-0.5 text-[9px] text-slate-400 focus:outline-none"
                                      value=""
                                      onChange={(e) => {
                                        if (!e.target.value) return;
                                        const current = selected as UserObjectiveStep;
                                        const nextChecks = (current.attachedChecks || []).map((c) =>
                                          c.id === check.id ? { ...c, expectEquals: `\${${e.target.value}}`, rightValue: `\${${e.target.value}}` } : c
                                        );
                                        updateStep(selected.id, { attachedChecks: nextChecks } as any);
                                      }}
                                    >
                                      <option value="">Insert variable…</option>
                                      {variableOptions.map((v) => (
                                        <option key={v.value} value={v.value}>{v.label}</option>
                                      ))}
                                    </select>
                                  )}
                                </div>
                              )}
                              {/* Preview */}
                              <div className="rounded bg-slate-900/50 border border-slate-700/50 p-2">
                                <div className="flex items-center gap-1.5 text-[9px] font-mono">
                                  <code className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 truncate max-w-[80px]">
                                    {check.variablePath || "(left)"}
                                  </code>
                                  <span className="text-fuchsia-400 font-bold">
                                    {check.operator === "eq" ? "=" : 
                                     check.operator === "neq" ? "≠" : 
                                     check.operator === "gt" ? ">" : 
                                     check.operator === "gte" ? "≥" : 
                                     check.operator === "lt" ? "<" : 
                                     check.operator === "lte" ? "≤" : 
                                     check.operator === "contains" ? "∋" : 
                                     check.operator === "not_contains" ? "∌" : 
                                     check.operator === "regex" ? "~=" : 
                                     check.operator === "exists" ? "∃" : 
                                     check.operator === "not_exists" ? "∄" : 
                                     "="}
                                  </span>
                                  {check.operator !== "exists" && check.operator !== "not_exists" && (
                                    <code className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 truncate max-w-[80px]">
                                      {check.expectEquals || check.rightValue || "(right)"}
                                    </code>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Assistant Input Mappings for user_objective - allow passing additional values to the assistant */}
                {assistantInputKeys.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-800">
                    <span className="text-[11px] uppercase tracking-wide text-slate-500">Assistant Request Inputs</span>
                    <p className="text-[10px] text-slate-500 mt-1 mb-2">
                      Pass additional values to the assistant's chat endpoint during this conversation.
                    </p>
                    <div className="space-y-2">
                      {assistantInputKeys.map((inputKey) => {
                        const objStep = selected as UserObjectiveStep;
                        const mappings = objStep.assistantInputMappings || {};
                        const inputInfo = assistantChatConfig?.inputSchema?.properties?.[inputKey];
                        const isRequired = assistantChatConfig?.inputSchema?.required?.includes(inputKey);
                        
                        // Get preceding steps for variable dropdown
                        const selectedIdx = steps.findIndex(s => s.id === selected.id);
                        const priorVars = variableOptions.filter((_, i) => {
                          const stepForVar = steps.find(s => {
                            const key = s.name || s.id;
                            return variableOptions[i]?.value.includes(`steps.${key}`);
                          });
                          return stepForVar && steps.indexOf(stepForVar) < selectedIdx;
                        });
                        
                        return (
                          <div key={inputKey} className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2 items-start">
                            <div className="flex items-center gap-1">
                              <span className="text-[11px] text-slate-400 font-mono truncate" title={inputKey}>
                                {inputKey}
                              </span>
                              {isRequired && <span className="text-[9px] text-rose-400">*</span>}
                            </div>
                            <div className="space-y-1">
                              <input
                                className="w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-[11px] text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-fuchsia-500 focus:border-fuchsia-500"
                                value={mappings[inputKey] ?? ""}
                                onChange={(e) => {
                                  const next = { ...(objStep.assistantInputMappings || {}), [inputKey]: e.target.value };
                                  updateStep(selected.id, { assistantInputMappings: next } as any);
                                }}
                                placeholder={inputInfo?.description || `Enter ${inputKey}`}
                              />
                              {priorVars.length > 0 && (
                                <select
                                  className="w-full rounded bg-slate-900 border border-slate-700 px-2 py-0.5 text-[10px] text-slate-400 focus:outline-none"
                                  value=""
                                  onChange={(e) => {
                                    if (!e.target.value) return;
                                    const next = { ...(objStep.assistantInputMappings || {}), [inputKey]: `\${${e.target.value}}` };
                                    updateStep(selected.id, { assistantInputMappings: next } as any);
                                  }}
                                >
                                  <option value="">Insert variable…</option>
                                  {priorVars.map(v => (
                                    <option key={v.value} value={v.value}>{v.label}</option>
                                  ))}
                                </select>
                              )}
                              {inputInfo?.description && (
                                <p className="text-[9px] text-slate-500">{inputInfo.description}</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Show expected outputs from this objective */}
                {assistantOutputKeys.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-800">
                    <span className="text-[11px] uppercase tracking-wide text-slate-500">Available Outputs</span>
                    <p className="text-[10px] text-slate-500 mt-1 mb-2">
                      These variables will be available in subsequent steps:
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {assistantOutputKeys.map((k) => {
                        const stepKey = selected.name || selected.id;
                        return (
                          <code key={k} className="inline-block px-1.5 py-0.5 text-[10px] font-mono rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                            steps.{stepKey}.output.{k}
                          </code>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {selected.type === "assistant_check" && (
              <div className="space-y-3">
                {(() => {
                  const o = selected as AssistantCheckStep;
                  return (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <span className="text-[11px] uppercase tracking-wide text-slate-500">Mode</span>
                          <select
                            className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-[11px] text-slate-100 focus:outline-none focus:ring-1 focus:ring-fuchsia-500 focus:border-fuchsia-500"
                            value={o.mode || "judge"}
                            onChange={(e) => updateStep(selected.id, { mode: e.target.value as ObjectiveMode } as any)}
                          >
                            <option value="judge">Judge behavior (LLM)</option>
                            <option value="includes">Must include keywords</option>
                            <option value="variable_check">Check variable value</option>
                          </select>
                        </div>
                      </div>

                      {o.mode === "judge" && (
                        <>
                          <div className="mt-3">
                            <span className="text-[11px] uppercase tracking-wide text-slate-500">Objective (rubric)</span>
                            <textarea
                              className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-fuchsia-500 focus:border-fuchsia-500 min-h-[120px]"
                              value={o.rubric || ""}
                              onChange={(e) => updateStep(selected.id, { rubric: e.target.value } as any)}
                              placeholder="Describe what success looks like for this part of the journey."
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-3 mt-3">
                            <div>
                              <span className="text-[11px] uppercase tracking-wide text-slate-500">Scope</span>
                              <select
                                className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-[11px] text-slate-100 focus:outline-none focus:ring-1 focus:ring-fuchsia-500 focus:border-fuchsia-500"
                                value={o.scope || "last"}
                                onChange={(e) => updateStep(selected.id, { scope: e.target.value as any } as any)}
                              >
                                <option value="last">Last assistant message</option>
                                <option value="transcript">Entire conversation</option>
                              </select>
                            </div>
                            <div>
                              <span className="text-[11px] uppercase tracking-wide text-slate-500">Threshold</span>
                              <input
                                type="number"
                                step="0.01"
                                min={0}
                                max={1}
                                className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-fuchsia-500 focus:border-fuchsia-500"
                                value={o.threshold ?? ""}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  updateStep(selected.id, { threshold: v === "" ? undefined : Number(v) } as any);
                                }}
                                placeholder="e.g. 0.75"
                              />
                            </div>
                          </div>
                        </>
                      )}

                      {o.mode === "includes" && (
                        <>
                          <div className="mt-3 grid grid-cols-2 gap-3">
                            <div>
                              <span className="text-[11px] uppercase tracking-wide text-slate-500">Scope</span>
                              <select
                                className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-[11px] text-slate-100 focus:outline-none focus:ring-1 focus:ring-fuchsia-500 focus:border-fuchsia-500"
                                value={o.scope || "transcript"}
                                onChange={(e) => updateStep(selected.id, { scope: e.target.value as any } as any)}
                              >
                                <option value="last">Last assistant reply</option>
                                <option value="transcript">Whole transcript</option>
                              </select>
                            </div>
                          </div>
                          <div className="mt-3">
                            <span className="text-[11px] uppercase tracking-wide text-slate-500">Required keywords (comma-separated)</span>
                            <textarea
                              className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-xs text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-fuchsia-500 focus:border-fuchsia-500 min-h-[80px]"
                              value={o.includes || ""}
                              onChange={(e) => updateStep(selected.id, { includes: e.target.value } as any)}
                              placeholder="gambling helpline, self-exclusion, state resources"
                            />
                          </div>
                        </>
                      )}

                      {o.mode === "variable_check" && (
                        <>
                          {/* Left operand */}
                          <div className="mt-3">
                            <span className="text-[11px] uppercase tracking-wide text-slate-500">Left Value</span>
                            <div className="mt-1 flex gap-2">
                              <select
                                className="flex-1 rounded bg-slate-900 border border-slate-700 px-2 py-1 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-fuchsia-500 focus:border-fuchsia-500"
                                value={o.variablePath || ""}
                                onChange={(e) => updateStep(selected.id, { variablePath: e.target.value } as any)}
                              >
                                <option value="">Select variable…</option>
                                {variableOptions.map((v) => (
                                  <option key={v.value} value={v.value}>
                                    {v.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <p className="mt-1 text-[10px] text-slate-500">
                              Select a variable from earlier steps, or type a custom path.
                            </p>
                            {/* Custom path input for advanced users */}
                            <input
                              className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-[10px] text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-fuchsia-500 focus:border-fuchsia-500"
                              value={o.variablePath || ""}
                              onChange={(e) => updateStep(selected.id, { variablePath: e.target.value } as any)}
                              placeholder="Or type: steps.my_step.output.field"
                            />
                          </div>

                          {/* Operator */}
                          <div className="mt-3">
                            <span className="text-[11px] uppercase tracking-wide text-slate-500">Operator</span>
                            <select
                              className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-fuchsia-500 focus:border-fuchsia-500"
                              value={o.operator || "eq"}
                              onChange={(e) => updateStep(selected.id, { operator: e.target.value as ComparisonOperator } as any)}
                            >
                              <option value="eq">= Equals</option>
                              <option value="neq">≠ Not equals</option>
                              <option value="gt">&gt; Greater than</option>
                              <option value="gte">≥ Greater than or equal</option>
                              <option value="lt">&lt; Less than</option>
                              <option value="lte">≤ Less than or equal</option>
                              <option value="contains">Contains (substring)</option>
                              <option value="not_contains">Does not contain</option>
                              <option value="regex">Matches regex</option>
                              <option value="exists">Exists (not null/undefined)</option>
                              <option value="not_exists">Does not exist (null/undefined)</option>
                            </select>
                          </div>

                          {/* Right operand - hidden for exists/not_exists */}
                          {o.operator !== "exists" && o.operator !== "not_exists" && (
                            <div className="mt-3">
                              <span className="text-[11px] uppercase tracking-wide text-slate-500">
                                {o.operator === "regex" ? "Regex Pattern" : "Right Value"}
                              </span>
                              <input
                                className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-fuchsia-500 focus:border-fuchsia-500"
                                value={o.expectEquals || o.rightValue || ""}
                                onChange={(e) => updateStep(selected.id, { expectEquals: e.target.value, rightValue: e.target.value } as any)}
                                placeholder={
                                  o.operator === "regex" 
                                    ? "^[A-Z]{3}-\\d{4}$" 
                                    : o.operator === "contains" || o.operator === "not_contains"
                                    ? "substring to match"
                                    : "value or ${steps.other_step.output.field}"
                                }
                              />
                              {/* Variable quick-insert for right value */}
                              {variableOptions.length > 0 && (
                                <select
                                  className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-0.5 text-[10px] text-slate-400 focus:outline-none"
                                  value=""
                                  onChange={(e) => {
                                    if (!e.target.value) return;
                                    updateStep(selected.id, { expectEquals: `\${${e.target.value}}`, rightValue: `\${${e.target.value}}` } as any);
                                  }}
                                >
                                  <option value="">Insert variable…</option>
                                  {variableOptions.map((v) => (
                                    <option key={v.value} value={v.value}>{v.label}</option>
                                  ))}
                                </select>
                              )}
                              <p className="mt-1 text-[10px] text-slate-500">
                                {o.operator === "regex" 
                                  ? "Enter a JavaScript-compatible regular expression pattern."
                                  : o.operator === "contains" || o.operator === "not_contains"
                                  ? "The substring to search for (case-sensitive)."
                                  : "Enter a literal value or reference another variable."}
                              </p>
                            </div>
                          )}

                          {/* Preview of comparison */}
                          <div className="mt-3 rounded-md bg-slate-900/50 border border-slate-700/50 p-3">
                            <span className="text-[10px] uppercase tracking-wide text-slate-500">Comparison Preview</span>
                            <div className="mt-2 flex items-center gap-2 text-[11px] font-mono">
                              <code className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 truncate max-w-[120px]" title={o.variablePath || "(left)"}>
                                {o.variablePath || "(left)"}
                              </code>
                              <span className="text-fuchsia-400 font-bold shrink-0">
                                {o.operator === "eq" ? "=" : 
                                 o.operator === "neq" ? "≠" : 
                                 o.operator === "gt" ? ">" : 
                                 o.operator === "gte" ? "≥" : 
                                 o.operator === "lt" ? "<" : 
                                 o.operator === "lte" ? "≤" : 
                                 o.operator === "contains" ? "contains" : 
                                 o.operator === "not_contains" ? "!contains" : 
                                 o.operator === "regex" ? "~=" : 
                                 o.operator === "exists" ? "exists" : 
                                 o.operator === "not_exists" ? "!exists" : 
                                 "="}
                              </span>
                              {o.operator !== "exists" && o.operator !== "not_exists" && (
                                <code className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 truncate max-w-[120px]" title={o.expectEquals || o.rightValue || "(right)"}>
                                  {o.expectEquals || o.rightValue || "(right)"}
                                </code>
                              )}
                            </div>
                          </div>
                        </>
                      )}

                      <p className="mt-3 text-[10px] text-slate-500">
                        This step runs once and uses the rubric and optional threshold to decide pass/fail for the assistant's behavior.
                      </p>
                    </>
                  );
                })()}
              </div>
            )}

            {/* Available Variables Panel - shows at the bottom of any step config */}
            {selected && (() => {
              // Get current step index and compute all variables available to this step
              const currentIdx = steps.findIndex(s => s.id === selected.id);

              // Variables from prior steps only (not including current step)
              const priorStepVars = variableOptions.filter(v => {
                // Test variables and pre-step outputs are always available
                if (v.value.startsWith('var.') || v.value.startsWith('preSteps.')) return true;
                // For step outputs, only include from steps before the current one
                if (v.value.startsWith('steps.')) {
                  const priorSteps = steps.slice(0, currentIdx);
                  return priorSteps.some(ps => {
                    const key = ps.name || ps.id;
                    return v.value.startsWith(`steps.${key}.`);
                  });
                }
                return false;
              });

              // Org secrets
              const secretVars = orgVariables.map(ov => ({
                value: `secrets.${ov.key}`,
                label: `secrets.${ov.key}`,
              }));

              const allVars = [...priorStepVars, ...secretVars];
              if (allVars.length === 0) return null;

              return (
                <div className="mt-4 pt-4 border-t border-slate-700/50">
                  <span className="text-[11px] uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                    Available Variables
                  </span>
                  <p className="mt-1 text-[9px] text-slate-500">
                    Click to copy. Use these variables from previous steps, pre-steps, or org secrets in your content or inputs.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {allVars.map((v) => {
                      const isSecret = v.value.startsWith('secrets.');
                      const isPreStep = v.value.startsWith('preSteps.');
                      const isStep = v.value.startsWith('steps.');
                      const isTestVar = v.value.startsWith('var.');
                      const colorClass = isSecret
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
                        : isPreStep
                        ? 'bg-violet-500/10 text-violet-400 border-violet-500/30 hover:bg-violet-500/20'
                        : isStep
                        ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/20'
                        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20';
                      return (
                        <button
                          key={v.value}
                          type="button"
                          onClick={() => navigator.clipboard.writeText(`\${${v.value}}`)}
                          className={`px-2 py-1 text-[10px] font-mono rounded border transition-colors ${colorClass}`}
                          title={`Click to copy \${${v.value}}`}
                        >
                          {v.value}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
