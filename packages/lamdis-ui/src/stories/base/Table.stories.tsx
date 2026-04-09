import type { Meta, StoryObj } from '@storybook/react';
import Table from '../../components/base/Table';
import Badge from '../../components/base/Badge';

type Row = { id: string; name: string; status: string; score: number };

const sampleData: Row[] = [
  { id: '1', name: 'Password Reset Flow', status: 'passed', score: 98 },
  { id: '2', name: 'Account Inquiry', status: 'failed', score: 45 },
  { id: '3', name: 'Refund Request', status: 'passed', score: 92 },
  { id: '4', name: 'Escalation Handling', status: 'partial', score: 71 },
];

const columns = [
  { key: 'name' as const, header: 'Test Name' },
  {
    key: 'status' as const,
    header: 'Status',
    render: (row: Row) => (
      <Badge variant={row.status === 'passed' ? 'success' : row.status === 'failed' ? 'danger' : 'warning'}>
        {row.status}
      </Badge>
    ),
  },
  { key: 'score' as const, header: 'Score' },
];

const meta: Meta<typeof Table<Row>> = {
  title: 'Base/Table',
  component: Table,
  tags: ['autodocs'],
  argTypes: {
    variant: { control: 'select', options: ['framed', 'plain'] },
  },
};
export default meta;
type Story = StoryObj<typeof Table<Row>>;

export const Framed: Story = {
  args: { columns, data: sampleData, variant: 'framed' },
};

export const Plain: Story = {
  args: { columns, data: sampleData, variant: 'plain' },
};

export const Empty: Story = {
  args: {
    columns,
    data: [],
    empty: <div className="py-8 text-center text-slate-500">No results found</div>,
  },
};
