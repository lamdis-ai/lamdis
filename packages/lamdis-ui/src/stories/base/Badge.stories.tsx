import type { Meta, StoryObj } from '@storybook/react';
import Badge from '../../components/base/Badge';

const meta: Meta<typeof Badge> = {
  title: 'Base/Badge',
  component: Badge,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['success', 'warning', 'info', 'neutral', 'danger'],
    },
  },
};
export default meta;
type Story = StoryObj<typeof Badge>;

export const Success: Story = { args: { children: 'Passed', variant: 'success' } };
export const Warning: Story = { args: { children: 'Pending', variant: 'warning' } };
export const Info: Story = { args: { children: 'Running', variant: 'info' } };
export const Neutral: Story = { args: { children: 'Draft', variant: 'neutral' } };
export const Danger: Story = { args: { children: 'Failed', variant: 'danger' } };

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge variant="success">Passed</Badge>
      <Badge variant="warning">Pending</Badge>
      <Badge variant="info">Running</Badge>
      <Badge variant="neutral">Draft</Badge>
      <Badge variant="danger">Failed</Badge>
    </div>
  ),
};
