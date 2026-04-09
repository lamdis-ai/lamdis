import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import JsonAccordion from '../../components/base/JsonAccordion';

const meta: Meta<typeof JsonAccordion> = {
  title: 'Base/JsonAccordion',
  component: JsonAccordion,
  tags: ['autodocs'],
  argTypes: {
    variant: { control: 'select', options: ['dark', 'light'] },
  },
};
export default meta;
type Story = StoryObj<typeof JsonAccordion>;

const sampleJson = {
  name: 'Password Reset Flow',
  config: {
    timeout: 30,
    retries: 2,
    headers: { Authorization: 'Bearer ***', 'Content-Type': 'application/json' },
  },
  tags: ['auth', 'critical'],
};

export const ReadOnly: Story = {
  args: { value: sampleJson, rootTitle: 'Test Config' },
};

const EditableDemo = () => {
  const [value, setValue] = useState<any>(sampleJson);
  return <JsonAccordion value={value} onChange={setValue} rootTitle="Editable Config" />;
};

export const Editable: Story = { render: () => <EditableDemo /> };
export const Light: Story = { args: { value: sampleJson, variant: 'light' } };
