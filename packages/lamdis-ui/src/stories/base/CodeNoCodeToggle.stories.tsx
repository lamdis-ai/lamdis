import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import CodeNoCodeToggle from '../../components/base/CodeNoCodeToggle';

const meta: Meta<typeof CodeNoCodeToggle> = {
  title: 'Base/CodeNoCodeToggle',
  component: CodeNoCodeToggle,
  tags: ['autodocs'],
  argTypes: {
    kind: { control: 'select', options: ['headers', 'json', 'schema'] },
    variant: { control: 'select', options: ['dark', 'light'] },
  },
};
export default meta;
type Story = StoryObj<typeof CodeNoCodeToggle>;

const headersJson = JSON.stringify({ 'Content-Type': 'application/json', Authorization: 'Bearer token' });
const dataJson = JSON.stringify({ name: 'Test', value: 42, active: true }, null, 2);
const schemaJson = JSON.stringify({
  type: 'object',
  properties: { name: { type: 'string' }, score: { type: 'number' } },
  required: ['name'],
});

const ToggleDemo = ({ kind, initial, variant = 'dark' as const }: { kind: 'headers' | 'json' | 'schema'; initial: string; variant?: 'dark' | 'light' }) => {
  const [value, setValue] = useState(initial);
  return <CodeNoCodeToggle kind={kind} value={value} onChange={setValue} variant={variant} />;
};

export const Headers: Story = { render: () => <ToggleDemo kind="headers" initial={headersJson} /> };
export const Json: Story = { render: () => <ToggleDemo kind="json" initial={dataJson} /> };
export const Schema: Story = { render: () => <ToggleDemo kind="schema" initial={schemaJson} /> };
