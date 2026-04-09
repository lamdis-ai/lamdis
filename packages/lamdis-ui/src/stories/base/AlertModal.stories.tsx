import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import AlertModal from '../../components/base/AlertModal';
import Button from '../../components/base/Button';

const meta: Meta<typeof AlertModal> = {
  title: 'Base/AlertModal',
  component: AlertModal,
  tags: ['autodocs'],
  argTypes: {
    variant: { control: 'select', options: ['success', 'error', 'info'] },
  },
};
export default meta;
type Story = StoryObj<typeof AlertModal>;

const AlertDemo = ({ variant = 'success' as const, title = 'Alert', message = 'This is an alert message.', withAction = false }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open {variant} alert</Button>
      <AlertModal
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        message={message}
        variant={variant}
        {...(withAction ? { primaryLabel: 'Confirm', onPrimary: () => setOpen(false) } : {})}
      />
    </>
  );
};

export const Success: Story = { render: () => <AlertDemo variant="success" title="Success" message="Operation completed successfully." /> };
export const Error: Story = { render: () => <AlertDemo variant="error" title="Error" message="Something went wrong. Please try again." /> };
export const Info: Story = { render: () => <AlertDemo variant="info" title="Information" message="Your session will expire in 5 minutes." /> };
export const WithAction: Story = { render: () => <AlertDemo variant="error" title="Delete Suite?" message="This action cannot be undone." withAction /> };
