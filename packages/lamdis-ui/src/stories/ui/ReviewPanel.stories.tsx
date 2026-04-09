import type { Meta, StoryObj } from '@storybook/react';
import { ReviewPanel } from '../../components/ui/ReviewPanel';

const meta: Meta<typeof ReviewPanel> = {
  title: 'UI/ReviewPanel',
  component: ReviewPanel,
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof ReviewPanel>;

const sampleComments = [
  {
    _id: 'c1',
    text: 'This test failure looks like a false positive — the assistant did verify identity via email.',
    authorSub: 'user_1',
    authorName: 'Alice Chen',
    authorEmail: 'alice@example.com',
    createdAt: '2025-01-15T10:00:00Z',
  },
  {
    _id: 'c2',
    text: 'Agreed, marking as false positive.',
    authorSub: 'user_2',
    authorName: 'Bob Smith',
    createdAt: '2025-01-15T11:30:00Z',
  },
];

const sampleHistory = [
  { newStatus: 'pending_review', changedBy: 'system', changedAt: '2025-01-15T09:00:00Z' },
  { previousStatus: 'pending_review', newStatus: 'needs_investigation', changedBy: 'user_1', changedByName: 'Alice Chen', reason: 'Requires closer look', changedAt: '2025-01-15T10:05:00Z' },
  { previousStatus: 'needs_investigation', newStatus: 'false_positive', changedBy: 'user_2', changedByName: 'Bob Smith', changedAt: '2025-01-15T11:35:00Z' },
];

export const Default: Story = {
  args: {
    resultId: 'result_001',
    currentStatus: 'false_positive' as const,
    testStatus: 'failed' as const,
    onStatusChange: async (s: string, r?: string) => alert(`Status → ${s}${r ? `: ${r}` : ''}`),
    onAddComment: async (t: string) => alert(`Comment: ${t}`),
    comments: sampleComments,
    statusHistory: sampleHistory,
    currentUserSub: 'user_1',
  },
};

export const PendingReview: Story = {
  args: {
    resultId: 'result_002',
    currentStatus: 'pending_review' as const,
    testStatus: 'failed' as const,
    onStatusChange: async () => {},
    onAddComment: async () => {},
    comments: [],
    statusHistory: [],
  },
};
