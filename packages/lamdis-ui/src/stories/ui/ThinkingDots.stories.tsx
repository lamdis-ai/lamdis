import type { Meta, StoryObj } from '@storybook/react';
import ThinkingDots from '../../components/ui/loading/ThinkingDots';

const meta: Meta<typeof ThinkingDots> = {
  title: 'UI/ThinkingDots',
  component: ThinkingDots,
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof ThinkingDots>;

export const Default: Story = {};

export const InContext: Story = {
  render: () => (
    <div className="flex items-center gap-2 p-3 bg-slate-800 rounded-lg max-w-xs">
      <span className="text-sm text-slate-400">Assistant is thinking</span>
      <ThinkingDots />
    </div>
  ),
};
