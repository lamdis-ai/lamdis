import type { Meta, StoryObj } from '@storybook/react';
import ProgressBar from '../../components/base/ProgressBar';

const meta: Meta<typeof ProgressBar> = {
  title: 'Base/ProgressBar',
  component: ProgressBar,
  tags: ['autodocs'],
  argTypes: {
    variant: { control: 'select', options: ['default', 'success', 'warning', 'danger'] },
    value: { control: { type: 'range', min: 0, max: 100 } },
  },
};
export default meta;
type Story = StoryObj<typeof ProgressBar>;

export const Default: Story = { args: { value: 72, max: 100, label: 'Test Progress' } };
export const Success: Story = { args: { value: 95, max: 100, label: 'Pass Rate', variant: 'success' } };
export const Warning: Story = { args: { value: 60, max: 100, label: 'Coverage', variant: 'warning' } };
export const Danger: Story = { args: { value: 25, max: 100, label: 'Error Rate', variant: 'danger' } };

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-col gap-4 max-w-md">
      <ProgressBar value={85} max={100} label="Default" variant="default" />
      <ProgressBar value={95} max={100} label="Success" variant="success" />
      <ProgressBar value={60} max={100} label="Warning" variant="warning" />
      <ProgressBar value={25} max={100} label="Danger" variant="danger" />
    </div>
  ),
};
