import type { Meta, StoryObj } from '@storybook/react';
import Card from '../../components/base/Card';

const meta: Meta<typeof Card> = {
  title: 'Base/Card',
  component: Card,
  tags: ['autodocs'],
  argTypes: {
    active: { control: 'boolean' },
    padded: { control: 'boolean' },
  },
};
export default meta;
type Story = StoryObj<typeof Card>;

export const Default: Story = {
  args: {
    children: (
      <div>
        <h3 className="text-lg font-semibold text-white">Card Title</h3>
        <p className="mt-1 text-sm text-slate-400">Card content goes here.</p>
      </div>
    ),
  },
};

export const Active: Story = {
  args: {
    active: true,
    children: (
      <div>
        <h3 className="text-lg font-semibold text-white">Active Card</h3>
        <p className="mt-1 text-sm text-slate-400">This card is selected.</p>
      </div>
    ),
  },
};

export const NoPadding: Story = {
  args: {
    padded: false,
    children: (
      <div className="p-4">
        <h3 className="text-lg font-semibold text-white">No Padding</h3>
        <p className="mt-1 text-sm text-slate-400">Padding is managed by the content.</p>
      </div>
    ),
  },
};
