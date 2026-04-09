import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import Pagination from '../../components/base/Pagination';

const meta: Meta<typeof Pagination> = {
  title: 'Base/Pagination',
  component: Pagination,
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof Pagination>;

const PaginationDemo = ({ total = 100, pageSize = 10 }) => {
  const [page, setPage] = useState(1);
  return <Pagination page={page} pageSize={pageSize} total={total} onChange={setPage} />;
};

export const Default: Story = { render: () => <PaginationDemo /> };
export const FewPages: Story = { render: () => <PaginationDemo total={25} pageSize={10} /> };
export const SinglePage: Story = { render: () => <PaginationDemo total={5} pageSize={10} /> };
