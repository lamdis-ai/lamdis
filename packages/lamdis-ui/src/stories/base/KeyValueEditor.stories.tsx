import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import KeyValueEditor from '../../components/base/KeyValueEditor';

const meta: Meta<typeof KeyValueEditor> = {
  title: 'Base/KeyValueEditor',
  component: KeyValueEditor,
  tags: ['autodocs'],
  argTypes: {
    variant: { control: 'select', options: ['dark', 'light'] },
    allowEmpty: { control: 'boolean' },
  },
};
export default meta;
type Story = StoryObj<typeof KeyValueEditor>;

const KVDemo = ({ initial = {}, variant = 'dark' as const }) => {
  const [value, setValue] = useState<Record<string, string>>(initial);
  return <KeyValueEditor value={value} onChange={setValue} variant={variant} />;
};

export const Default: Story = {
  render: () => <KVDemo initial={{ 'Content-Type': 'application/json', Authorization: 'Bearer token' }} />,
};

export const Empty: Story = {
  render: () => <KVDemo />,
};

export const Light: Story = {
  render: () => <KVDemo initial={{ key: 'value' }} variant="light" />,
};
