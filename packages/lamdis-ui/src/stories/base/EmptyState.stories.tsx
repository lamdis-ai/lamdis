import type { Meta, StoryObj } from '@storybook/react';
import EmptyState from '../../components/base/EmptyState';

const meta: Meta<typeof EmptyState> = {
  title: 'Base/EmptyState',
  component: EmptyState,
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof EmptyState>;

export const Default: Story = {
  args: { title: 'No test suites yet' },
};

export const WithContent: Story = {
  args: {
    title: 'No results found',
    children: <p className="text-sm text-slate-400 mt-2">Try adjusting your search filters or create a new test suite.</p>,
  },
};
