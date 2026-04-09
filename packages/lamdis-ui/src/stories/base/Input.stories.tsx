import type { Meta, StoryObj } from '@storybook/react';
import Input from '../../components/base/Input';

const meta: Meta<typeof Input> = {
  title: 'Base/Input',
  component: Input,
  tags: ['autodocs'],
  argTypes: {
    sizeVariant: { control: 'select', options: ['xs', 'sm', 'md'] },
    mono: { control: 'boolean' },
    disabled: { control: 'boolean' },
    placeholder: { control: 'text' },
  },
};
export default meta;
type Story = StoryObj<typeof Input>;

export const Default: Story = { args: { placeholder: 'Enter text...' } };
export const Small: Story = { args: { placeholder: 'Small input', sizeVariant: 'sm' } };
export const ExtraSmall: Story = { args: { placeholder: 'XS input', sizeVariant: 'xs' } };
export const Monospace: Story = { args: { placeholder: 'api_key_here', mono: true } };
export const Disabled: Story = { args: { placeholder: 'Disabled', disabled: true } };

export const AllSizes: Story = {
  render: () => (
    <div className="flex flex-col gap-3 max-w-sm">
      <Input sizeVariant="xs" placeholder="Extra small (xs)" />
      <Input sizeVariant="sm" placeholder="Small (sm)" />
      <Input sizeVariant="md" placeholder="Medium (md) — default" />
    </div>
  ),
};
