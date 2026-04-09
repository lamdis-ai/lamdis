import type { Meta, StoryObj } from '@storybook/react';
import { ToastProvider, useToast } from '../../components/base/Toast';
import Button from '../../components/base/Button';

const meta: Meta = {
  title: 'Base/Toast',
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <ToastProvider>
        <Story />
      </ToastProvider>
    ),
  ],
};
export default meta;
type Story = StoryObj;

const ToastDemo = () => {
  const toast = useToast();
  return (
    <div className="flex gap-3">
      <Button variant="primary" onClick={() => toast.success('Test suite passed successfully!')}>
        Success Toast
      </Button>
      <Button variant="danger" onClick={() => toast.error('Failed to connect to target.')}>
        Error Toast
      </Button>
      <Button variant="neutral" onClick={() => toast.info('Run #42 is now in progress.')}>
        Info Toast
      </Button>
    </div>
  );
};

export const AllTypes: Story = { render: () => <ToastDemo /> };
