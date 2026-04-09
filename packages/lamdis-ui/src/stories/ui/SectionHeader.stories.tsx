import type { Meta, StoryObj } from '@storybook/react';
import SectionHeader from '../../components/ui/SectionHeader';

const meta: Meta<typeof SectionHeader> = {
  title: 'UI/SectionHeader',
  component: SectionHeader,
  tags: ['autodocs'],
  argTypes: {
    title: { control: 'text' },
    className: { control: 'text' },
  },
};
export default meta;
type Story = StoryObj<typeof SectionHeader>;

export const Default: Story = { args: { title: 'Test Suites' } };

export const CustomColor: Story = {
  args: {
    title: 'Evidence Vault',
    className: 'text-transparent bg-clip-text bg-gradient-to-r from-amber-300 to-rose-400',
  },
};

export const Multiple: Story = {
  render: () => (
    <div className="flex flex-col gap-8">
      <SectionHeader title="AI Testing" />
      <SectionHeader title="Assurance" />
      <SectionHeader title="Evidence" />
    </div>
  ),
};
