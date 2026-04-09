import type { Meta, StoryObj } from '@storybook/react';
import AssertionsList from '../../components/base/AssertionsList';

const meta: Meta<typeof AssertionsList> = {
  title: 'Base/AssertionsList',
  component: AssertionsList,
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof AssertionsList>;

export const Mixed: Story = {
  args: {
    assertions: [
      { type: 'judge', pass: true, severity: 'error', details: { rubric: 'Verify identity before reset' } },
      { type: 'includes', pass: true, severity: 'warn', config: { value: 'reset' } },
      { type: 'judge', pass: false, severity: 'error', details: { rubric: 'Must not reveal PII' } },
      { type: 'latency', pass: true, severity: 'info', details: { avgMs: 250, threshold: 500 } },
    ],
  },
};

export const AllPassing: Story = {
  args: {
    assertions: [
      { type: 'judge', pass: true, severity: 'error' },
      { type: 'includes', pass: true, severity: 'warn' },
    ],
  },
};

export const AllFailing: Story = {
  args: {
    assertions: [
      { type: 'judge', pass: false, severity: 'error', details: { rubric: 'Identity verification required' } },
      { type: 'includes', pass: false, severity: 'error', config: { value: 'password reset' } },
    ],
  },
};
