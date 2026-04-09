import type { Meta, StoryObj } from '@storybook/react';
import LogList from '../../components/base/LogList';

const meta: Meta<typeof LogList> = {
  title: 'Base/LogList',
  component: LogList,
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof LogList>;

const sampleLogs = [
  { t: '2025-01-15T10:00:00Z', type: 'env', content: 'Environment initialized' },
  { t: '2025-01-15T10:00:01Z', type: 'persona', content: 'Persona loaded: support-agent-v2' },
  { t: '2025-01-15T10:00:02Z', type: 'user_message', content: 'I need to reset my password' },
  { t: '2025-01-15T10:00:04Z', type: 'assistant_reply', content: 'I can help you with that. Could you verify your email?' },
  { t: '2025-01-15T10:00:05Z', type: 'judge_check', subtype: 'rubric', content: 'Identity verification: PASS', details: { score: 0.95 } },
  { t: '2025-01-15T10:00:06Z', type: 'error', content: 'Timeout waiting for response', details: { timeout: 30000 } },
];

export const Default: Story = { args: { logs: sampleLogs } };
export const Limited: Story = { args: { logs: sampleLogs, limit: 3 } };
export const Empty: Story = { args: { logs: [] } };
