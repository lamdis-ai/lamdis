# @lamdis-ai/ui

A dark-theme-first React component library built with Tailwind CSS for the [Lamdis](https://lamdis.ai) AI quality platform.

**[View Storybook](https://lamdis-ai.github.io/lamdis-ui/)** — Interactive component documentation with live examples.

## Installation

```bash
npm install @lamdis-ai/ui
```

### Peer Dependencies

```json
{
  "react": ">=19.0.0",
  "next": ">=16.0.0"
}
```

This library is designed to work with Next.js applications using Tailwind CSS. Your host application must have Tailwind configured to process the library's utility classes.

## Quick Start

```tsx
import { Button, Badge, Modal, Table } from '@lamdis-ai/ui';

function App() {
  return (
    <div>
      <Button variant="primary" onClick={() => console.log('clicked')}>
        Run Tests
      </Button>
      <Badge variant="success">Passed</Badge>
    </div>
  );
}
```

## Components

### Form Inputs

| Component | Import | Description |
|-----------|--------|-------------|
| **Button** | `Button` | 8 variants: `primary`, `ghost`, `gradient`, `pattern`, `ghostWhite`, `neutral`, `outline`, `danger` |
| **Input** | `Input` | Text input with `xs`/`sm`/`md` sizes and monospace option |
| **Textarea** | `Textarea` | Multi-line text input with monospace option |
| **Select** | `Select` | Native select dropdown with `xs`/`sm`/`md` sizes |
| **Checkbox** | `Checkbox` | Custom styled checkbox with label and description |
| **Radio** | `Radio` | Custom styled radio button with label and description |
| **SearchInput** | `SearchInput` | Search input with icon and clear button |

#### Button Example

```tsx
import { Button } from '@lamdis-ai/ui';

<Button variant="primary">Run Suite</Button>
<Button variant="danger" disabled>Delete</Button>
<Button variant="ghost">Cancel</Button>
```

#### Input Example

```tsx
import { Input } from '@lamdis-ai/ui';

<Input sizeVariant="md" placeholder="Enter suite name..." />
<Input sizeVariant="sm" mono placeholder="lam_sk_..." />
```

### Data Display

| Component | Import | Description |
|-----------|--------|-------------|
| **Table** | `Table` | Generic typed table with `framed`/`plain` variants, custom cell renderers |
| **Badge** | `Badge` | Status badge with `success`/`warning`/`info`/`neutral`/`danger` variants |
| **Card** | `Card` | Container card with `active` and `padded` props |
| **ProgressBar** | `ProgressBar` | Animated progress bar with `default`/`success`/`warning`/`danger` variants |
| **JsonAccordion** | `JsonAccordion` | Interactive JSON tree viewer/editor |
| **LogList** | `LogList` | Color-coded log entry list with timestamp support |

#### Table Example

```tsx
import { Table, Badge } from '@lamdis-ai/ui';

type Row = { name: string; status: string; score: number };

const columns = [
  { key: 'name', header: 'Test Name' },
  {
    key: 'status',
    header: 'Status',
    render: (row: Row) => (
      <Badge variant={row.status === 'passed' ? 'success' : 'danger'}>
        {row.status}
      </Badge>
    ),
  },
  { key: 'score', header: 'Score' },
];

<Table columns={columns} data={data} variant="framed" />
```

### Navigation

| Component | Import | Description |
|-----------|--------|-------------|
| **Tabs** | `Tabs` | Tab navigation with `dark`/`light` variants |
| **Breadcrumbs** | `Breadcrumbs` | Breadcrumb navigation with `next/link` integration |
| **Pagination** | `Pagination` | Page navigation with `usePagination` hook |

#### Tabs Example

```tsx
import { Tabs } from '@lamdis-ai/ui';

<Tabs
  items={[
    { key: 'overview', label: 'Overview', content: <Overview /> },
    { key: 'results', label: 'Results', content: <Results /> },
    { key: 'logs', label: 'Logs', content: <Logs /> },
  ]}
  variant="dark"
/>
```

### Feedback

| Component | Import | Description |
|-----------|--------|-------------|
| **Toast** | `ToastProvider`, `useToast` | Toast notifications — `success`, `error`, `info` |
| **AiLoader** | `AiLoader` | Animated loading indicator with brand gradient |
| **EmptyState** | `EmptyState` | Empty state placeholder with title |
| **ThinkingDots** | `ThinkingDots` | Animated bouncing dots indicator |

#### Toast Example

```tsx
import { ToastProvider, useToast } from '@lamdis-ai/ui';

function App() {
  return (
    <ToastProvider>
      <MyComponent />
    </ToastProvider>
  );
}

function MyComponent() {
  const toast = useToast();
  return <button onClick={() => toast.success('Test passed!')}>Notify</button>;
}
```

### Overlays

| Component | Import | Description |
|-----------|--------|-------------|
| **Modal** | `Modal` | Portal-based modal with 5 sizes (`sm`–`2xl`) and `dark`/`light` variants |
| **AlertModal** | `AlertModal` | Alert dialog with `success`/`error`/`info` variants |

#### Modal Example

```tsx
import { Modal, Button } from '@lamdis-ai/ui';

<Modal
  open={isOpen}
  onClose={() => setIsOpen(false)}
  title="Run Details"
  size="lg"
  footer={<Button onClick={() => setIsOpen(false)}>Close</Button>}
>
  <p>Modal body content</p>
</Modal>
```

### Editors

| Component | Import | Description |
|-----------|--------|-------------|
| **MarkdownEditor** | `MarkdownEditor` | Markdown editor with live preview |
| **JsonSchemaBuilder** | `JsonSchemaBuilder` | Visual JSON Schema builder (Draft 2020-12) |
| **KeyValueEditor** | `KeyValueEditor` | Key-value pair editor |
| **CodeNoCodeToggle** | `CodeNoCodeToggle` | Toggle between code and visual editing modes |

### Chat

| Component | Import | Description |
|-----------|--------|-------------|
| **ChatUI** | `ChatUI` | Full chat interface with `user`/`assistant`/`system`/`thinking` roles |

#### ChatUI Example

```tsx
import { ChatUI } from '@lamdis-ai/ui';
import type { ChatMessage } from '@lamdis-ai/ui';

const messages: ChatMessage[] = [
  { role: 'user', content: 'I need help resetting my password' },
  { role: 'assistant', content: 'I can help with that. What is your email?' },
];

<ChatUI
  messages={messages}
  input={input}
  onChange={setInput}
  onSend={handleSend}
  variant="dark"
/>
```

### Review

| Component | Import | Description |
|-----------|--------|-------------|
| **ReviewStatusBadge** | `ReviewStatusBadge` | 6 review statuses + 4 test statuses with icons and color coding |
| **ReviewPanel** | `ReviewPanel` | Full review workflow panel with comments and status history |
| **TestResultCard** | `TestResultCard` | Collapsible test result with assertions, conversation, and latency |
| **AssertionsList** | `AssertionsList` | Assertion results list with pass/fail indicators |

### UI Composites

| Component | Import | Description |
|-----------|--------|-------------|
| **UIBadge** | `UIBadge` | Animated badge with pulsing dot |
| **StatCard** | `UICards` → `StatCard` | Metric display card with gradient background |
| **IconCard** | `UICards` → `IconCard` | Feature card with icon |
| **Pane** | `UICards` → `Pane` | Basic container pane |
| **ConnectorCard** | `ConnectorCard` | Integration connector display card |
| **DateRangePicker** | `DateRangePicker` | Preset + custom date range selector |
| **SectionHeader** | `SectionHeader` | Gradient section heading |
| **UIModal** | `UIModal` | Enhanced modal with variant icons (default/error/success/warning/info) |
| **UIEmptyState** | `UIEmptyState` | Rich empty state with icon and action button |

## Storybook

Browse all components interactively at **[lamdis-ai.github.io/lamdis-ui](https://lamdis-ai.github.io/lamdis-ui/)**.

To run Storybook locally:

```bash
npm install
npm run storybook
```

This starts Storybook at `http://localhost:6006` with live reloading.

## Theming

All components use Tailwind CSS utility classes and are optimized for dark backgrounds (`bg-slate-900`, `bg-slate-950`). The library expects these custom CSS classes to be defined in your host application:

| Class | Usage |
|-------|-------|
| `.btn` | Base button styles |
| `.btn-ghost`, `.btn-gradient`, `.btn-pattern` | Button variant styles |
| `.card`, `.card-active` | Card container and active state |
| `.tab-btn`, `.tab-btn-indicator` | Tab navigation styles |
| `.scroll-dark` | Dark-themed scrollbar |

You can define these in your global CSS or use the Storybook CSS as a reference.

## License

Apache-2.0
