import type { Meta, StoryObj } from '@storybook/react';
import Checkbox from '../../components/base/Checkbox';

const meta: Meta<typeof Checkbox> = {
  title: 'Base/Checkbox',
  component: Checkbox,
  tags: ['autodocs'],
  argTypes: {
    label: { control: 'text' },
    description: { control: 'text' },
    inline: { control: 'boolean' },
    disabled: { control: 'boolean' },
    checked: { control: 'boolean' },
  },
};
export default meta;
type Story = StoryObj<typeof Checkbox>;

export const Default: Story = { args: { label: 'Enable notifications' } };
export const WithDescription: Story = { args: { label: 'Auto-run tests', description: 'Automatically run the test suite on every push to main' } };
export const Checked: Story = { args: { label: 'I agree to the terms', checked: true } };
export const Disabled: Story = { args: { label: 'Unavailable option', disabled: true } };
export const Inline: Story = { args: { label: 'Inline checkbox', inline: true } };
