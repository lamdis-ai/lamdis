import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import ChatUI from '../../components/base/ChatUI';
import type { ChatMessage } from '../../components/base/ChatUI';

const sampleMessages: ChatMessage[] = [
  { role: 'user', content: 'I need help resetting my password' },
  { role: 'assistant', content: 'I can help you with that. For security, I\'ll need to verify your identity first. Could you please provide the email address associated with your account?' },
  { role: 'user', content: 'It\'s john@example.com' },
  { role: 'assistant', content: 'Thank you. I\'ve sent a password reset link to john@example.com. Please check your inbox and follow the instructions. The link will expire in 24 hours.' },
];

const thinkingMessages: ChatMessage[] = [
  { role: 'user', content: 'What is my account balance?' },
  { role: 'thinking', content: 'Looking up account information for the authenticated user...' },
  { role: 'assistant', content: 'Your current account balance is $5,432.10. Would you like to see recent transactions?' },
];

const meta: Meta<typeof ChatUI> = {
  title: 'Base/ChatUI',
  component: ChatUI,
  tags: ['autodocs'],
  argTypes: {
    variant: { control: 'select', options: ['dark', 'light'] },
    loading: { control: 'boolean' },
    disabled: { control: 'boolean' },
  },
};
export default meta;
type Story = StoryObj<typeof ChatUI>;

const ChatDemo = ({ messages, variant = 'dark' as const, loading = false }) => {
  const [input, setInput] = useState('');
  return (
    <div className="h-[400px]">
      <ChatUI
        messages={messages}
        input={input}
        onChange={setInput}
        onSend={() => setInput('')}
        variant={variant}
        loading={loading}
      />
    </div>
  );
};

export const Default: Story = { render: () => <ChatDemo messages={sampleMessages} /> };
export const WithThinking: Story = { render: () => <ChatDemo messages={thinkingMessages} /> };
export const Loading: Story = { render: () => <ChatDemo messages={sampleMessages} loading /> };
export const Light: Story = { render: () => <ChatDemo messages={sampleMessages} variant="light" /> };
export const Empty: Story = { render: () => <ChatDemo messages={[]} /> };
