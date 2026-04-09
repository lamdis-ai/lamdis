import type { Meta, StoryObj } from '@storybook/react';
import Textarea from '../../components/base/Textarea';

const meta: Meta<typeof Textarea> = {
  title: 'Base/Textarea',
  component: Textarea,
  tags: ['autodocs'],
  argTypes: {
    mono: { control: 'boolean' },
    disabled: { control: 'boolean' },
    placeholder: { control: 'text' },
    rows: { control: 'number' },
  },
};
export default meta;
type Story = StoryObj<typeof Textarea>;

export const Default: Story = { args: { placeholder: 'Enter your test script...', rows: 4 } };
export const Monospace: Story = { args: { placeholder: '{ "key": "value" }', mono: true, rows: 4 } };
export const Disabled: Story = { args: { placeholder: 'Disabled', disabled: true, rows: 4 } };
