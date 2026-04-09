import type { Meta, StoryObj } from '@storybook/react';
import { Input, Textarea } from '../../components/ui/Input';

const meta: Meta<typeof Input> = {
  title: 'UI/Input',
  component: Input,
  tags: ['autodocs'],
  argTypes: {
    label: { control: 'text' },
    error: { control: 'text' },
    required: { control: 'boolean' },
    disabled: { control: 'boolean' },
    placeholder: { control: 'text' },
  },
};
export default meta;
type Story = StoryObj<typeof Input>;

export const Default: Story = { args: { label: 'Suite Name', placeholder: 'Enter suite name...' } };
export const Required: Story = { args: { label: 'API Key', placeholder: 'lam_sk_...', required: true } };
export const WithError: Story = { args: { label: 'Email', value: 'invalid', error: 'Please enter a valid email address' } };
export const Disabled: Story = { args: { label: 'Organization', value: 'Acme Corp', disabled: true } };

export const TextareaVariant: Story = {
  render: () => (
    <Textarea label="Test Script" placeholder="user: Hello\nassistant: (should greet)" rows={4} />
  ),
};

export const TextareaWithError: Story = {
  render: () => (
    <Textarea label="JSON Body" value="{ invalid json }" error="Invalid JSON format" rows={3} />
  ),
};
