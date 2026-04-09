import type { Meta, StoryObj } from '@storybook/react';
import ConnectorCard from '../../components/ui/ConnectorCard';

const meta: Meta<typeof ConnectorCard> = {
  title: 'UI/ConnectorCard',
  component: ConnectorCard,
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof ConnectorCard>;

export const Default: Story = {
  args: {
    connector: {
      key: 'zendesk',
      name: 'Zendesk',
      category: 'Support',
      description: 'Connect your Zendesk instance to monitor support conversations.',
    },
  },
};

export const Multiple: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-4 max-w-2xl">
      <ConnectorCard connector={{ key: 'zendesk', name: 'Zendesk', category: 'Support', description: 'Monitor support conversations' }} />
      <ConnectorCard connector={{ key: 'intercom', name: 'Intercom', category: 'Chat', description: 'Track Intercom chat sessions' }} />
      <ConnectorCard connector={{ key: 'salesforce', name: 'Salesforce', category: 'CRM', description: 'Integrate with Salesforce Service Cloud' }} />
      <ConnectorCard connector={{ key: 'slack', name: 'Slack', category: 'Messaging', description: 'Monitor AI bot conversations in Slack' }} />
    </div>
  ),
};
