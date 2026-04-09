import type { Meta, StoryObj } from '@storybook/react';
import Breadcrumbs from '../../components/base/Breadcrumbs';

const meta: Meta<typeof Breadcrumbs> = {
  title: 'Base/Breadcrumbs',
  component: Breadcrumbs,
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof Breadcrumbs>;

export const Default: Story = {
  args: {
    items: [
      { label: 'Dashboard', href: '/' },
      { label: 'Suites', href: '/suites' },
      { label: 'Password Reset Flow' },
    ],
  },
};

export const TwoLevels: Story = {
  args: {
    items: [
      { label: 'Suites', href: '/suites' },
      { label: 'Run #42' },
    ],
  },
};

export const SingleItem: Story = {
  args: { items: [{ label: 'Dashboard' }] },
};
