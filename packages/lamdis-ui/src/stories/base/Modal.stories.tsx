import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import Modal from '../../components/base/Modal';
import Button from '../../components/base/Button';

const meta: Meta<typeof Modal> = {
  title: 'Base/Modal',
  component: Modal,
  tags: ['autodocs'],
  argTypes: {
    size: { control: 'select', options: ['sm', 'md', 'lg', 'xl', '2xl'] },
    variant: { control: 'select', options: ['dark', 'light'] },
    closeOnBackdrop: { control: 'boolean' },
    showCloseButton: { control: 'boolean' },
  },
};
export default meta;
type Story = StoryObj<typeof Modal>;

const ModalDemo = ({ size = 'md', variant = 'dark' }: { size?: string; variant?: 'dark' | 'light' }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open {size} Modal</Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Modal Title"
        subtitle="A subtitle for additional context"
        size={size as any}
        variant={variant}
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => setOpen(false)}>Confirm</Button>
          </div>
        }
      >
        <p className="text-sm text-slate-300">This is the modal body content. It can contain any React elements.</p>
      </Modal>
    </>
  );
};

export const Default: Story = { render: () => <ModalDemo /> };
export const Small: Story = { render: () => <ModalDemo size="sm" /> };
export const Large: Story = { render: () => <ModalDemo size="lg" /> };
export const ExtraLarge: Story = { render: () => <ModalDemo size="xl" /> };
export const Light: Story = { render: () => <ModalDemo variant="light" /> };

export const AllSizes: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <ModalDemo size="sm" />
      <ModalDemo size="md" />
      <ModalDemo size="lg" />
      <ModalDemo size="xl" />
      <ModalDemo size="2xl" />
    </div>
  ),
};
