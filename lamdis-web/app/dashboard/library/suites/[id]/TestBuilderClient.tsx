"use client";
import { useEffect, useState, useRef, useCallback } from 'react';
import Card from '@/components/base/Card';
import Button from '@/components/base/Button';
import Badge from '@/components/base/Badge';
import { useRouter } from 'next/navigation';
import { AnyStep, StepBuilder, AssistantChatConfig, TestVariable } from '@/components/testing/StepBuilder';

type SetupOption = {
  key: string;
  name: string;
  setupId?: string;
  environmentName?: string;
  assistantName?: string;
  assistantId?: string;
};

export default function TestBuilderClient({ suiteId, initial }: { suiteId: string; initial?: { name?: string; testId?: string; personaId?: string; preSteps?: AnyStep[]; steps?: AnyStep[]; variables?: TestVariable[] } }) {
  const router = useRouter();
  const [name, setName] = useState('New test');
  const [availablePersonas, setAvailablePersonas] = useState<{ id: string; name: string }[]>([]);
  const [availableRequests, setAvailableRequests] = useState<{ id: string; name: string; inputKeys?: string[]; outputKeys?: string[] }[]>([]);
  const [availableSetups, setAvailableSetups] = useState<SetupOption[]>([]);
  const [orgVariables, setOrgVariables] = useState<{ key: string }[]>([]);
  const [selectedSetup, setSelectedSetup] = useState<string>('');
  const [assistantChatConfig, setAssistantChatConfig] = useState<AssistantChatConfig | undefined>(undefined);
  const [personaId, setPersonaId] = useState<string>('');
  const [testVariables, setTestVariables] = useState<TestVariable[]>([]);
  const [preSteps, setPreSteps] = useState<AnyStep[]>([]);
  const [steps, setSteps] = useState<AnyStep[]>([]);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // Track initial values to detect changes
  const initialRef = useRef<{ name: string; personaId: string; variables: string; preSteps: string; steps: string } | null>(null);

  useEffect(() => { (async () => {
    try {
      const r = await fetch(`/api/orgs/personas`, { cache: 'no-store' });
      if (!r.ok) return;
      const arr = await r.json();
      setAvailablePersonas(Array.isArray(arr) ? arr.map((p:any)=>({ id: p.id, name: p.name })) : []);
    } catch {}
  })(); }, [suiteId]);

  // Fetch org-level variables (secrets) for use in step inputs
  useEffect(() => { (async () => {
    try {
      const r = await fetch('/api/orgs/variables', { cache: 'no-store' });
      if (!r.ok) return;
      const j = await r.json();
      const vars = Array.isArray(j) ? j : j.variables || [];
      setOrgVariables(vars.map((v: any) => ({ key: v.key })));
    } catch {}
  })(); }, []);

  useEffect(() => { (async () => {
    try {
      const r = await fetch('/api/orgs/actions?pageSize=500', { cache: 'no-store' });
      if (!r.ok) return;
      const j = await r.json();
      const arr = Array.isArray(j.actions) ? j.actions : j;
      setAvailableRequests(arr.map((action: any) => {
        // Derive input keys from multiple sources:
        // 1. Explicit _builderMeta.inputKeys
        // 2. input_schema.properties (JSON Schema)
        // 3. Path template placeholders like {userId}
        // 4. Body object keys (if body is an object template)
        let inputKeys: string[] = action._builderMeta?.inputKeys || [];

        if (!inputKeys.length) {
          const derivedKeys = new Set<string>();

          // From input_schema.properties
          if (action.input_schema?.properties) {
            Object.keys(action.input_schema.properties).forEach(k => derivedKeys.add(k));
          }

          // From path template placeholders like /users/{userId}
          if (action.path) {
            const pathMatches = String(action.path).match(/\{([^}]+)\}/g) || [];
            pathMatches.forEach(m => derivedKeys.add(m.replace(/[{}]/g, '')));
          }

          // From body object keys (if body is an object with placeholders or direct keys)
          if (action.body && typeof action.body === 'object') {
            const extractBodyKeys = (obj: any, prefix = ''): void => {
              if (!obj || typeof obj !== 'object') return;
              Object.keys(obj).forEach(k => {
                const val = obj[k];
                const fullKey = prefix ? `${prefix}.${k}` : k;
                // If value is a string with {placeholder}, extract the placeholder
                if (typeof val === 'string') {
                  const bodyMatches = val.match(/\{([^}]+)\}/g) || [];
                  bodyMatches.forEach(m => derivedKeys.add(m.replace(/[{}]/g, '')));
                  // Also add the key itself if it looks like a simple input
                  if (!bodyMatches.length) derivedKeys.add(k);
                } else if (typeof val === 'object' && val !== null) {
                  extractBodyKeys(val, fullKey);
                } else {
                  derivedKeys.add(k);
                }
              });
            };
            extractBodyKeys(action.body);
          }

          inputKeys = Array.from(derivedKeys);
        }

        // Derive output keys from output_schema.properties (including array item keys)
        let outputKeys: string[] = action._builderMeta?.outputKeys || [];
        if (!outputKeys.length && action.output_schema?.properties) {
          const props = action.output_schema.properties;
          outputKeys = Object.keys(props);
          // For array fields with object items, also expose item property keys
          for (const k of Object.keys(props)) {
            const p = props[k];
            if (p?.type === 'array' && p?.items?.type === 'object' && p?.items?.properties) {
              for (const ik of Object.keys(p.items.properties)) {
                outputKeys.push(`${k}[].${ik}`);
              }
            }
          }
        }

        return {
          id: action.id || action._id,
          name: action.title || action.name || action.id || action._id,
          inputKeys,
          outputKeys,
        };
      }));
    } catch {}
  })(); }, [suiteId]);

  // Load available setups
  useEffect(() => { (async () => {
    try {
      const r = await fetch('/api/orgs/setups', { cache: 'no-store' });
      if (!r.ok) return;
      const j = await r.json();
      const setups = Array.isArray(j.setups) ? j.setups : Array.isArray(j) ? j : [];
      const options: SetupOption[] = setups
        .filter((s: any) => s.enabled !== false)
        .map((s: any) => ({
          key: s.key || s.id,
          name: s.name,
          setupId: s.id,
          environmentName: s.environmentName,
          assistantName: s.assistantName,
          assistantId: s.assistantId,
        }));
      setAvailableSetups(options);
      // Auto-select default setup or first available
      const defaultSetup = options.find((s) => (s as any).isDefault);
      if (defaultSetup && !selectedSetup) {
        setSelectedSetup(defaultSetup.key);
      } else if (options.length > 0 && !selectedSetup) {
        setSelectedSetup(options[0].key);
      }
    } catch {}
  })(); }, []);

  // Fetch assistant chat config when setup is selected
  useEffect(() => { (async () => {
    if (!selectedSetup) {
      setAssistantChatConfig(undefined);
      return;
    }
    const setup = availableSetups.find(s => s.key === selectedSetup);
    if (!setup?.setupId) return;

    try {
      // Fetch the full setup details which includes assistant with chat config
      const r = await fetch(`/api/orgs/setups/${setup.setupId}`, { cache: 'no-store' });
      if (!r.ok) return;
      const j = await r.json();
      const assistant = j?.setup?.assistant;
      if (assistant) {
        setAssistantChatConfig({
          inputSchema: assistant.chatInputSchema,
          outputSchema: assistant.chatOutputSchema,
          responseFieldPath: assistant.responseFieldPath,
        });
      } else {
        setAssistantChatConfig(undefined);
      }
    } catch {
      setAssistantChatConfig(undefined);
    }
  })(); }, [selectedSetup, availableSetups]);

  // Prefill from initial when provided (edit mode)
  useEffect(() => {
    if (!initial) return;
    if (initial.name) setName(initial.name);
    if (initial.personaId) setPersonaId(initial.personaId);
    try {
      const varsData = (initial as any)?.variables;
      if (Array.isArray(varsData) && varsData.length) setTestVariables(varsData);
      const preStepsData = (initial as any)?.preSteps;
      if (Array.isArray(preStepsData) && preStepsData.length) setPreSteps(preStepsData as AnyStep[]);
      const steps = (initial as any)?.steps;
      if (Array.isArray(steps) && steps.length) setSteps(steps as AnyStep[]);
    } catch {}
    // Store initial state for dirty tracking
    initialRef.current = {
      name: initial.name || 'New test',
      personaId: initial.personaId || '',
      variables: JSON.stringify((initial as any)?.variables || []),
      preSteps: JSON.stringify((initial as any)?.preSteps || []),
      steps: JSON.stringify((initial as any)?.steps || []),
    };
    setLastSaved(new Date()); // Assume it was just loaded/saved
  }, [initial]);

  // Track dirty state
  useEffect(() => {
    if (!initialRef.current) {
      // New test - dirty if anything is filled
      const hasContent = name !== 'New test' || !!personaId || testVariables.length > 0 || preSteps.length > 0 || steps.length > 0;
      setIsDirty(hasContent);
      return;
    }
    // Edit mode - compare to initial
    const currentVariables = JSON.stringify(testVariables);
    const currentPreSteps = JSON.stringify(preSteps);
    const currentSteps = JSON.stringify(steps);
    const changed =
      name !== initialRef.current.name ||
      personaId !== initialRef.current.personaId ||
      currentVariables !== initialRef.current.variables ||
      currentPreSteps !== initialRef.current.preSteps ||
      currentSteps !== initialRef.current.steps;
    setIsDirty(changed);
  }, [name, personaId, testVariables, preSteps, steps]);

  // Helpers
  function buildEmptyScript() {
    return `messages: []`;
  }

  const save = useCallback(async (editing?: { testId: string }) => {
    setError(null); setSaving(true);
    try {
      const script = buildEmptyScript();
      // All evaluations are modeled as steps now; no separate objectives/assertions.
      const assertions: any[] = [];
      const judgeConfig = undefined;
      const url = editing?.testId
        ? `/api/orgs/suites/${encodeURIComponent(suiteId)}/tests/${encodeURIComponent(editing.testId)}`
        : `/api/orgs/suites/${encodeURIComponent(suiteId)}/tests`;
      const method = editing?.testId ? 'PATCH' : 'POST';
      const payload: any = { name: name.trim() || 'New test', script, judgeConfig, assertions, personaId: personaId || undefined };
      if (Array.isArray(testVariables) && testVariables.length) payload.variables = testVariables;
      if (Array.isArray(preSteps) && preSteps.length) payload.preSteps = preSteps;
      if (Array.isArray(steps) && steps.length) payload.steps = steps;
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) {
        const j = await res.json().catch(()=>({}));
        throw new Error(j?.error || 'Failed to create test');
      }
      // Update initial ref to current state after save
      initialRef.current = {
        name: name.trim() || 'New test',
        personaId: personaId || '',
        variables: JSON.stringify(testVariables),
        preSteps: JSON.stringify(preSteps),
        steps: JSON.stringify(steps),
      };
      setIsDirty(false);
      setLastSaved(new Date());
      router.refresh();
      // Only reset if creating new test
      if (!editing?.testId) {
        setName('New test');
        setPersonaId('');
        setTestVariables([]);
        setPreSteps([]);
        setSteps([]);
      }
    } catch (e:any) {
      setError(e?.message || 'Failed to save');
    } finally { setSaving(false); }
  }, [name, personaId, testVariables, preSteps, steps, suiteId, router]);

  const runTest = useCallback(async () => {
    if (!initial?.testId) {
      setError('Save the test first before running');
      return;
    }
    if (availableSetups.length === 0) {
      setError('No setups configured. Create a setup with an environment and assistant first.');
      return;
    }
    if (!selectedSetup) {
      setError('Select a setup to run the test against');
      return;
    }
    // If dirty, save first
    if (isDirty) {
      await save({ testId: initial.testId });
    }
    setError(null);
    setRunning(true);
    try {
      const res = await fetch(`/api/orgs/suites/${encodeURIComponent(suiteId)}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tests: [initial.testId], singleEnv: true, setupKey: selectedSetup }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || 'Failed to start run');
      }
      const data = await res.json();
      // Navigate to run details page - handle both single and batch responses
      const runId = data?.runId || data?.runs?.[0]?.runId;
      if (runId) {
        router.push(`/dashboard/runs/${runId}/live`);
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to run test');
    } finally {
      setRunning(false);
    }
  }, [initial?.testId, isDirty, save, suiteId, router, availableSetups.length, selectedSetup]);

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="font-medium">{initial?.testId ? 'Edit Test' : 'New Test (Builder)'}</div>
        {/* Top right controls: status, save, setup selector, run */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Save status */}
          {isDirty ? (
            <Badge variant="warning" className="text-[10px]">
              <span className="inline-block w-1.5 h-1.5 bg-amber-400 rounded-full mr-1.5 animate-pulse" />
              Unsaved
            </Badge>
          ) : lastSaved ? (
            <Badge variant="success" className="text-[10px]">
              <span className="inline-block w-1.5 h-1.5 bg-emerald-400 rounded-full mr-1.5" />
              Saved
            </Badge>
          ) : null}

          {/* Save button */}
          <Button
            variant="outline"
            onClick={() => save(initial?.testId ? { testId: initial.testId } : undefined)}
            disabled={saving || running}
            className="text-sm"
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>

          {/* Setup selector + Run button (only for existing tests) */}
          {initial?.testId && (
            <>
              <select
                value={selectedSetup}
                onChange={(e) => setSelectedSetup(e.target.value)}
                className="px-3 py-2 rounded-md border border-gray-600 bg-gray-800 text-sm text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                disabled={saving || running}
              >
                {availableSetups.length === 0 ? (
                  <option value="">No setups</option>
                ) : (
                  <>
                    <option value="">Select setup...</option>
                    {availableSetups.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.name}{s.environmentName ? ` (${s.environmentName})` : ''}
                      </option>
                    ))}
                  </>
                )}
              </select>
              <Button
                onClick={runTest}
                disabled={saving || running || !selectedSetup || availableSetups.length === 0}
              >
                {running ? 'Starting...' : isDirty ? 'Save & Run' : 'Run Test'}
              </Button>
            </>
          )}

          {error && <span className="text-sm text-red-400">{error}</span>}
        </div>
      </div>

      {/* Setup link hint */}
      {initial?.testId && availableSetups.length === 0 && (
        <div className="mt-2 text-xs text-amber-400">
          <a href="/dashboard/setups" className="underline hover:text-amber-300">Create a setup</a> to run tests
        </div>
      )}

      <div className="mt-4">
        <StepBuilder
          name={name}
          onNameChange={setName}
          personaId={personaId}
          availablePersonas={availablePersonas}
          availableRequests={availableRequests}
          assistantChatConfig={assistantChatConfig}
          orgVariables={orgVariables}
          testVariables={testVariables}
          onTestVariablesChange={setTestVariables}
          onPersonaChange={setPersonaId}
          preSteps={preSteps}
          onPreStepsChange={setPreSteps}
          value={steps}
          onChange={setSteps}
        />
      </div>
    </Card>
  );
}
