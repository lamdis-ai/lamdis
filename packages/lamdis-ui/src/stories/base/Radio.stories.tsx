import type { Meta, StoryObj } from '@storybook/react';
import Radio from '../../components/base/Radio';

const meta: Meta<typeof Radio> = {
  title: 'Base/Radio',
  component: Radio,
  tags: ['autodocs'],
  argTypes: {
    label: { control: 'text' },
    description: { control: 'text' },
    inline: { control: 'boolean' },
    disabled: { control: 'boolean' },
  },
};
export default meta;
type Story = StoryObj<typeof Radio>;

export const Default: Story = { args: { label: 'Option A', name: 'demo' } };
export const WithDescription: Story = { args: { label: 'Strict mode', description: 'Fail the suite on any test error', name: 'mode' } };
export const Disabled: Story = { args: { label: 'Unavailable', disabled: true, name: 'demo' } };

export const RadioGroup: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      <Radio name="severity" label="Error" description="Fails the test run" defaultChecked />
      <Radio name="severity" label="Warning" description="Reports but does not fail" />
      <Radio name="severity" label="Info" description="Informational only" />
    </div>
  ),
};
