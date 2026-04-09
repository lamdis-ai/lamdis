import type { Meta, StoryObj } from '@storybook/react';
import HelpIcon from '../../components/base/HelpIcon';

const meta: Meta<typeof HelpIcon> = {
  title: 'Base/HelpIcon',
  component: HelpIcon,
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof HelpIcon>;

export const Default: Story = {
  args: {
    title: 'Severity Levels',
    children: (
      <div className="text-xs">
        <p><strong>Error:</strong> Fails the test run</p>
        <p><strong>Warning:</strong> Reports but doesn't fail</p>
        <p><strong>Info:</strong> Informational only</p>
      </div>
    ),
  },
};

export const SimpleTooltip: Story = {
  args: { title: 'API Key', children: 'Your API key can be found in the dashboard settings.' },
};
