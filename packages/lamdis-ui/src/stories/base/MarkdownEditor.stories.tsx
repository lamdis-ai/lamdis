import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import MarkdownEditor from '../../components/base/MarkdownEditor';

const meta: Meta<typeof MarkdownEditor> = {
  title: 'Base/MarkdownEditor',
  component: MarkdownEditor,
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof MarkdownEditor>;

const sampleMarkdown = `# Test Suite Documentation

## Objective
Verify the assistant handles password reset requests **securely**.

### Steps
1. User requests password reset
2. Assistant asks for identity verification
3. User provides email
4. Assistant confirms reset link sent

> Note: The assistant must verify identity before processing the reset.
`;

const EditorDemo = ({ initial = '' }) => {
  const [value, setValue] = useState(initial);
  return <MarkdownEditor value={value} onChange={setValue} placeholder="Write your documentation..." />;
};

export const Default: Story = { render: () => <EditorDemo initial={sampleMarkdown} /> };
export const Empty: Story = { render: () => <EditorDemo /> };
