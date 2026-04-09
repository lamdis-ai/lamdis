import type { Meta, StoryObj } from '@storybook/react';
import Button from '../../components/base/Button';

const meta: Meta<typeof Button> = {
  title: 'Base/Button',
  component: Button,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'ghost', 'gradient', 'pattern', 'ghostWhite', 'neutral', 'outline', 'danger'],
    },
    disabled: { control: 'boolean' },
  },
};
export default meta;
type Story = StoryObj<typeof Button>;

export const Primary: Story = { args: { children: 'Primary Button', variant: 'primary' } };
export const Ghost: Story = { args: { children: 'Ghost Button', variant: 'ghost' } };
export const Gradient: Story = { args: { children: 'Gradient Button', variant: 'gradient' } };
export const Pattern: Story = { args: { children: 'Pattern Button', variant: 'pattern' } };
export const GhostWhite: Story = { args: { children: 'Ghost White', variant: 'ghostWhite' } };
export const Neutral: Story = { args: { children: 'Neutral Button', variant: 'neutral' } };
export const Outline: Story = { args: { children: 'Outline Button', variant: 'outline' } };
export const Danger: Story = { args: { children: 'Danger Button', variant: 'danger' } };
export const Disabled: Story = { args: { children: 'Disabled', variant: 'primary', disabled: true } };

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <Button variant="primary">Primary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="gradient">Gradient</Button>
      <Button variant="pattern">Pattern</Button>
      <Button variant="ghostWhite">Ghost White</Button>
      <Button variant="neutral">Neutral</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="danger">Danger</Button>
    </div>
  ),
};
