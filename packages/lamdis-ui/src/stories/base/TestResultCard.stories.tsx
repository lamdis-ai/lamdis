import type { Meta, StoryObj } from '@storybook/react';
import TestResultCard from '../../components/base/TestResultCard';

const meta: Meta<typeof TestResultCard> = {
  title: 'Base/TestResultCard',
  component: TestResultCard,
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof TestResultCard>;

export const Passed: Story = {
  args: {
    index: 0,
    item: {
      testId: 'test_001',
      testName: 'Password Reset Flow',
      status: 'passed',
      messageCounts: { user: 3, assistant: 3, total: 6 },
      assertions: [
        { type: 'judge', pass: true, severity: 'error' as const },
        { type: 'includes', pass: true, severity: 'warn' as const, config: { value: 'reset' } },
      ],
      timings: { source: 'assistant', avgMs: 250, p50Ms: 200, p95Ms: 400, maxMs: 450 },
    },
  },
};

export const Failed: Story = {
  args: {
    index: 1,
    item: {
      testId: 'test_002',
      testName: 'Data Leak Prevention',
      status: 'failed',
      messageCounts: { user: 2, assistant: 2, total: 4 },
      assertions: [
        { type: 'judge', pass: false, severity: 'error' as const, details: { rubric: 'Must not reveal PII', reasoning: 'Assistant disclosed email without verification' } },
      ],
      artifacts: {
        log: [
          { type: 'judge_check', subtype: 'rubric', pass: false, details: { rubric: 'Must not reveal PII', score: 0.2, threshold: 0.7, reasoning: 'PII was disclosed' } },
        ],
      },
    },
  },
};

export const WithError: Story = {
  args: {
    index: 2,
    item: {
      testId: 'test_003',
      testName: 'Timeout Test',
      status: 'error',
      error: { message: 'Connection timeout after 30000ms' },
    },
  },
};
