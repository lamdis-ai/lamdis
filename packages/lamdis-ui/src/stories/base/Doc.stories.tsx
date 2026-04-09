import type { Meta, StoryObj } from '@storybook/react';
import { DocPage, DocSection, P } from '../../components/base/Doc';

const meta: Meta = {
  title: 'Base/Doc',
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj;

export const FullPage: Story = {
  render: () => (
    <DocPage title="Getting Started">
      <DocSection heading="Installation">
        <P>Install the Lamdis CLI to get started with AI test automation.</P>
        <pre className="mt-2 p-3 bg-slate-800 rounded text-xs text-slate-300">
          npm install -g @lamdis-ai/cli
        </pre>
      </DocSection>
      <DocSection heading="Authentication">
        <P>Run the login command to configure your API key and organization.</P>
      </DocSection>
    </DocPage>
  ),
};
