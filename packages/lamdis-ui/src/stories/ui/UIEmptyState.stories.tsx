import type { Meta, StoryObj } from '@storybook/react';
import { EmptyState as UIEmptyState } from '../../components/ui/EmptyState';
import { FiInbox, FiSearch } from 'react-icons/fi';

const meta: Meta<typeof UIEmptyState> = {
  title: 'UI/EmptyState',
  component: UIEmptyState,
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof UIEmptyState>;

export const Default: Story = {
  args: {
    title: 'No test suites',
    description: 'Create your first test suite to start testing your AI assistant.',
  },
};

export const WithIcon: Story = {
  args: {
    icon: <FiInbox className="w-8 h-8" />,
    title: 'Inbox is empty',
    description: 'No new evidence submissions to review.',
  },
};

export const WithAction: Story = {
  args: {
    icon: <FiSearch className="w-8 h-8" />,
    title: 'No results found',
    description: 'Try adjusting your search or filter criteria.',
    action: { label: 'Clear Filters', onClick: () => alert('Filters cleared') },
  },
};
