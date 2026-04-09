import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import SearchInput from '../../components/base/SearchInput';

const meta: Meta<typeof SearchInput> = {
  title: 'Base/SearchInput',
  component: SearchInput,
  tags: ['autodocs'],
  argTypes: {
    sizeVariant: { control: 'select', options: ['xs', 'sm', 'md'] },
    placeholder: { control: 'text' },
  },
};
export default meta;
type Story = StoryObj<typeof SearchInput>;

export const Default: Story = { args: { placeholder: 'Search tests...' } };

const SearchDemo = () => {
  const [value, setValue] = useState('password reset');
  return (
    <div className="max-w-sm">
      <SearchInput
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onClear={() => setValue('')}
        placeholder="Search tests..."
      />
    </div>
  );
};

export const WithClear: Story = { render: () => <SearchDemo /> };
