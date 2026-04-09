# UI development guidance for AI agents

This guide tells AI agents and contributors how to implement frontend changes in `lamdis-web` using our base, composable components and Tailwind design tokens—avoiding re-defining raw Tailwind classes everywhere.

## Core principles

- Prefer reusable components over ad‑hoc Tailwind class strings
- Extend our existing base components when possible before creating new ones
- Keep vendor-agnostic UX and copy; wire specifics in Inspector-like pickers, not hard-coded
- Keep props small and composable; expose className passthroughs for layout only
- Co-locate small component docs (prop comments) and usage examples

## Where to look first

- Base components: `components/base/*` (Button, Input, Select, Tabs, Card, Modal, Table, Badge, Textarea, Checkbox, Radio, SearchInput, JsonAccordion, JsonSchemaBuilder, KeyValueEditor, CodeNoCodeToggle, ManifestSelector, ChatUI, AlertModal, AiLoader)
- UI patterns: `components/ui/*` (SectionHeader, cards, ConnectorCard, loading UX)
- Workflow builder: `components/workflows/*` (Canvas, Inspector, Library, helpers)
- Layout: `components/layout/*`

If a page is using many inline Tailwind classes for primitive UI, consider extracting or reusing a base component.

## Do — use these first

- Buttons: `components/base/Button.tsx`
  - Variants: `primary | ghost | gradient | pattern | ghostWhite`
  - Prefer `<Button>` over bespoke `<button className="...">` when it’s an action
- Inputs: `components/base/Input.tsx`, `Textarea.tsx`, `Select.tsx`, `Checkbox.tsx`, `Radio.tsx`
- Structure: `components/base/Card.tsx`, `Modal.tsx`, `Tabs.tsx`, `Table.tsx`, `Badge.tsx`
- Search/Filter: `components/base/SearchInput.tsx`
- Async/loading: `components/base/AiLoader.tsx`, `components/ui/loading/*`

## When to create a new base component

Create a new base component when:
- The pattern is used (or will be used) in 2+ places
- It encapsulates consistent styles, accessibility, and states
- It can be kept provider-agnostic and accepts `className` for layout overrides

Naming: put it in `components/base/YourThing.tsx` with a small prop surface and sensible defaults.

## Tailwind usage policy

- Use Tailwind utility classes in base components; avoid repeating long utility chains in page files
- Page files can use Tailwind utilities for layout and spacing, but not to re-implement buttons, inputs, tabs, etc.
- Prefer our existing tokens (e.g., bg-slate-950, border-slate-800) to keep visual consistency

## Examples

Bad (duplicating button styles inline):

```tsx
<button className="rounded-md bg-sky-700 px-3 py-1.5 text-white hover:bg-sky-800">Save</button>
```

Good (reusable):

```tsx
import Button from '@/components/base/Button';

<Button onClick={save}>Save</Button>
```

Creating a small reusable pattern:

```tsx
// components/base/EmptyState.tsx
export default function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="text-slate-400 text-sm p-6 text-center border border-dashed border-slate-700 rounded">
      <div className="text-slate-200 mb-1">{title}</div>
      {children}
    </div>
  );
}
```

Then use it in pages instead of re-typing the same Tailwind chain:

```tsx
import EmptyState from '@/components/base/EmptyState';

<EmptyState title="No workflows yet">Drag a step from the library to get started.</EmptyState>
```

## Workflow-specific guidance

- When adding workflow UI affordances, use base Button/Input and `components/workflows/*` building blocks
- Keep steps vendor-neutral on create; let users pick concrete actions in the Inspector
- For repeated info blocks (warnings, hints), prefer a shared `components/base/AlertModal` or create `InfoCallout.tsx`

## PR checklist for agents

- [ ] Reused existing base components where applicable
- [ ] New UI patterns extracted into `components/base/*`
- [ ] No duplicated long Tailwind class lists in page files
- [ ] Accessibility basics: focus states, labels for controls, keyboard reachable
- [ ] Dark theme consistency: use existing slate/bg tokens

## Where to update this doc

This file lives at `lamdis-web/AGENTS.md`. Update it whenever you introduce a new reusable component or pattern so future work stays consistent.
