"use client";
import { useMemo } from 'react';
import { Step, safeParse, objectFromMapping, resolveTokensInObject, buildCtxSteps } from './helpers';
import StepInspector from './StepInspector';

type InspectorProps = {
  step: Step;
  onChange: (s: Step)=>void;
  sampleInput: string;
  steps: Step[];
  actions: any[];
  actionsLoaded: boolean;
  requests: any[];
  availableTokens: string[];
  onNavigateToStep: (id: string)=>void;
  dryRun: { stepIndex: number; status: 'passed'|'skipped'|'failed'; output?: any; error?: string }[]|null;
  workflowInputSchema?: any;
};

export default function Inspector({ step, onChange, sampleInput, steps, actions, actionsLoaded, requests, availableTokens, onNavigateToStep, dryRun, workflowInputSchema }: InspectorProps){
  const resolvePreview = (st: Step)=>{
    return resolveTokensInObject(objectFromMapping(st.mapping||[]), { input: safeParse(sampleInput).input || safeParse(sampleInput), steps: buildCtxSteps(steps, dryRun), ENV: {} });
  };
  return (
    <div className="rounded-md border border-slate-800 bg-slate-950/50 p-3">
      <div className="text-sm font-medium text-slate-200 mb-2">Inspector</div>
      <StepInspector
        step={step}
        onChange={onChange}
        sampleInput={sampleInput}
        ctxSteps={steps}
        resolvePreview={resolvePreview}
        actions={actions}
        actionsLoaded={actionsLoaded}
        requests={requests}
        onNavigateToStep={onNavigateToStep}
        priorOutputs={buildCtxSteps(steps, dryRun)}
        availableTokens={availableTokens}
        workflowInputSchema={workflowInputSchema}
      />
    </div>
  );
}
