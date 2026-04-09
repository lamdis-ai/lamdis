import type { Meta, StoryObj } from '@storybook/react';
import { Pane, StatCard, IconCard } from '../../components/ui/cards';
import { FiActivity, FiCheckCircle, FiAlertTriangle } from 'react-icons/fi';

const meta: Meta = {
  title: 'UI/Cards',
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj;

export const PaneCard: Story = {
  render: () => (
    <Pane>
      <h3 className="text-lg font-semibold text-white mb-2">Pane Container</h3>
      <p className="text-sm text-slate-400">A simple container with rounded corners and backdrop blur.</p>
    </Pane>
  ),
};

export const Stats: Story = {
  render: () => (
    <div className="grid grid-cols-3 gap-4">
      <StatCard label="Total Runs" value="1,247" desc="Last 30 days" />
      <StatCard label="Pass Rate" value="94.2%" desc="+2.1% from last week" gradient="from-emerald-500/20 to-emerald-400/20" />
      <StatCard label="Avg Latency" value="340ms" desc="p50 response time" gradient="from-amber-500/20 to-amber-400/20" />
    </div>
  ),
};

export const Icons: Story = {
  render: () => (
    <div className="grid grid-cols-3 gap-4">
      <IconCard icon={FiActivity} title="Monitoring" desc="Real-time conversation tracking" />
      <IconCard icon={FiCheckCircle} title="Testing" desc="Automated AI test suites" />
      <IconCard icon={FiAlertTriangle} title="Alerts" desc="Instant failure notifications" />
    </div>
  ),
};
