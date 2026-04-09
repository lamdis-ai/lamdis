import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import UIModal, { ConfirmModal } from '../../components/ui/Modal';
import Button from '../../components/base/Button';

const meta: Meta = {
  title: 'UI/Modal',
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj;

const ModalDemo = ({ variant = 'default' as any, size = 'md' as any, title = 'Modal Title' }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open {variant} modal</Button>
      <UIModal isOpen={open} onClose={() => setOpen(false)} title={title} variant={variant} size={size}>
        <p className="text-sm text-slate-300">Modal content for the {variant} variant.</p>
      </UIModal>
    </>
  );
};

export const Default: Story = { render: () => <ModalDemo /> };
export const ErrorVariant: Story = { render: () => <ModalDemo variant="error" title="Error Occurred" /> };
export const SuccessVariant: Story = { render: () => <ModalDemo variant="success" title="Run Complete" /> };
export const WarningVariant: Story = { render: () => <ModalDemo variant="warning" title="Confirm Action" /> };
export const InfoVariant: Story = { render: () => <ModalDemo variant="info" title="Information" /> };

const ConfirmDemo = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>Delete Suite</Button>
      <ConfirmModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onConfirm={() => { alert('Deleted!'); setOpen(false); }}
        title="Delete Test Suite?"
        message="This will permanently delete the suite and all associated test runs. This action cannot be undone."
        confirmText="Delete"
        variant="error"
      />
    </>
  );
};

export const Confirm: Story = { render: () => <ConfirmDemo /> };

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <ModalDemo variant="default" title="Default" />
      <ModalDemo variant="error" title="Error" />
      <ModalDemo variant="success" title="Success" />
      <ModalDemo variant="warning" title="Warning" />
      <ModalDemo variant="info" title="Info" />
    </div>
  ),
};
