import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import JsonSchemaBuilder from '../../components/base/JsonSchemaBuilder';

const meta: Meta<typeof JsonSchemaBuilder> = {
  title: 'Base/JsonSchemaBuilder',
  component: JsonSchemaBuilder,
  tags: ['autodocs'],
  argTypes: {
    variant: { control: 'select', options: ['dark', 'light'] },
  },
};
export default meta;
type Story = StoryObj<typeof JsonSchemaBuilder>;

const existingSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    age: { type: 'number' },
    active: { type: 'boolean' },
  },
  required: ['name'],
};

const SchemaDemo = ({ initial, variant = 'dark' as const }: { initial?: any; variant?: 'dark' | 'light' }) => {
  const [schema, setSchema] = useState<any>(initial);
  return (
    <div>
      <JsonSchemaBuilder value={initial} onChange={setSchema} variant={variant} />
      {schema && (
        <pre className="mt-4 p-3 bg-slate-800 rounded text-xs text-slate-300 overflow-auto">
          {JSON.stringify(schema, null, 2)}
        </pre>
      )}
    </div>
  );
};

export const Default: Story = { render: () => <SchemaDemo /> };
export const WithExisting: Story = { render: () => <SchemaDemo initial={existingSchema} /> };
export const Light: Story = { render: () => <SchemaDemo variant="light" /> };
