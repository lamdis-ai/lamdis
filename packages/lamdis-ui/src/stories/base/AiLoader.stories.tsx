import type { Meta, StoryObj } from '@storybook/react';
import AiLoader from '../../components/base/AiLoader';

const meta: Meta<typeof AiLoader> = {
  title: 'Base/AiLoader',
  component: AiLoader,
  tags: ['autodocs'],
  argTypes: {
    variant: { control: 'select', options: ['dark', 'light'] },
    label: { control: 'text' },
  },
};
export default meta;
type Story = StoryObj<typeof AiLoader>;

export const Dark: Story = { args: { variant: 'dark' } };
export const Light: Story = { args: { variant: 'light' } };
export const CustomLabel: Story = { args: { variant: 'dark', label: 'Processing' } };

export const BothVariants: Story = {
  render: () => (
    <div className="flex gap-8 items-center">
      <div className="p-6 rounded-lg bg-slate-800">
        <p className="text-xs text-slate-400 mb-3">Dark variant</p>
        <AiLoader variant="dark" />
      </div>
      <div className="p-6 rounded-lg bg-slate-200">
        <p className="text-xs text-slate-600 mb-3">Light variant</p>
        <AiLoader variant="light" />
      </div>
    </div>
  ),
};
