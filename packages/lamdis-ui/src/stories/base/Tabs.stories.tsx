import type { Meta, StoryObj } from '@storybook/react';
import Tabs from '../../components/base/Tabs';

const sampleItems = [
  { key: 'overview', label: 'Overview', content: <div className="p-4 text-slate-300">Overview content here.</div> },
  { key: 'results', label: 'Results', content: <div className="p-4 text-slate-300">Test results displayed here.</div> },
  { key: 'logs', label: 'Logs', content: <div className="p-4 text-slate-300">Log entries listed here.</div> },
];

const meta: Meta<typeof Tabs> = {
  title: 'Base/Tabs',
  component: Tabs,
  tags: ['autodocs'],
  argTypes: {
    variant: { control: 'select', options: ['dark', 'light'] },
  },
};
export default meta;
type Story = StoryObj<typeof Tabs>;

export const Dark: Story = { args: { items: sampleItems, variant: 'dark' } };
export const Light: Story = { args: { items: sampleItems, variant: 'light' } };
