import type { Meta, StoryObj } from '@storybook/react';
import UIBadge from '../../components/ui/Badge';

const meta: Meta<typeof UIBadge> = {
  title: 'UI/Badge',
  component: UIBadge,
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof UIBadge>;

export const Default: Story = { args: { children: 'AI Powered' } };

export const CustomClassName: Story = {
  args: {
    children: 'Custom Style',
    className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  },
};

export const Multiple: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <UIBadge>AI Powered</UIBadge>
      <UIBadge className="border-sky-500/30 bg-sky-500/10 text-sky-200">Beta</UIBadge>
      <UIBadge className="border-amber-500/30 bg-amber-500/10 text-amber-200">Experimental</UIBadge>
    </div>
  ),
};
