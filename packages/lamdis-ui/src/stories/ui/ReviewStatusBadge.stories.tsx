import type { Meta, StoryObj } from '@storybook/react';
import { ReviewStatusBadge } from '../../components/ui/ReviewStatusBadge';

const meta: Meta<typeof ReviewStatusBadge> = {
  title: 'UI/ReviewStatusBadge',
  component: ReviewStatusBadge,
  tags: ['autodocs'],
  argTypes: {
    status: {
      control: 'select',
      options: ['pending_review', 'approved', 'rejected', 'needs_investigation', 'false_positive', 'acknowledged'],
    },
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
    showIcon: { control: 'boolean' },
    interactive: { control: 'boolean' },
  },
};
export default meta;
type Story = StoryObj<typeof ReviewStatusBadge>;

export const PendingReview: Story = { args: { status: 'pending_review' } };
export const Approved: Story = { args: { status: 'approved' } };
export const Rejected: Story = { args: { status: 'rejected' } };
export const NeedsInvestigation: Story = { args: { status: 'needs_investigation' } };
export const FalsePositive: Story = { args: { status: 'false_positive' } };
export const Acknowledged: Story = { args: { status: 'acknowledged' } };

export const AllStatuses: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <ReviewStatusBadge status="pending_review" />
      <ReviewStatusBadge status="approved" />
      <ReviewStatusBadge status="rejected" />
      <ReviewStatusBadge status="needs_investigation" />
      <ReviewStatusBadge status="false_positive" />
      <ReviewStatusBadge status="acknowledged" />
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3 items-center">
      <ReviewStatusBadge status="approved" size="sm" />
      <ReviewStatusBadge status="approved" size="md" />
      <ReviewStatusBadge status="approved" size="lg" />
    </div>
  ),
};

export const Interactive: Story = {
  args: { status: 'pending_review', interactive: true, onClick: () => alert('Clicked!') },
};
