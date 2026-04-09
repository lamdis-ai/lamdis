import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { DateRangePicker } from '../../components/ui/DateRangePicker';

const meta: Meta<typeof DateRangePicker> = {
  title: 'UI/DateRangePicker',
  component: DateRangePicker,
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof DateRangePicker>;

const PickerDemo = ({ initial = '7d' }) => {
  const [preset, setPreset] = useState(initial);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  return (
    <DateRangePicker
      presetValue={preset}
      onPresetChange={setPreset}
      from={from}
      to={to}
      onFromChange={setFrom}
      onToChange={setTo}
    />
  );
};

export const Default: Story = { render: () => <PickerDemo /> };
export const CustomRange: Story = { render: () => <PickerDemo initial="custom" /> };
