import type { Meta, StoryObj } from '@storybook/react';
import Select from '../../components/base/Select';

const meta: Meta<typeof Select> = {
  title: 'Base/Select',
  component: Select,
  tags: ['autodocs'],
  argTypes: {
    sizeVariant: { control: 'select', options: ['xs', 'sm', 'md'] },
    disabled: { control: 'boolean' },
  },
};
export default meta;
type Story = StoryObj<typeof Select>;

const options = (
  <>
    <option value="">Select severity...</option>
    <option value="error">Error</option>
    <option value="warn">Warning</option>
    <option value="info">Info</option>
  </>
);

export const Default: Story = { args: { children: options } };
export const Small: Story = { args: { children: options, sizeVariant: 'sm' } };
export const ExtraSmall: Story = { args: { children: options, sizeVariant: 'xs' } };
export const Disabled: Story = { args: { children: options, disabled: true } };

export const AllSizes: Story = {
  render: () => (
    <div className="flex flex-col gap-3 max-w-xs">
      <Select sizeVariant="xs">{options}</Select>
      <Select sizeVariant="sm">{options}</Select>
      <Select sizeVariant="md">{options}</Select>
    </div>
  ),
};
