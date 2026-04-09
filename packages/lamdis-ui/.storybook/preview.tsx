import type { Preview } from '@storybook/react';
import '../src/stories/storybook.css';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      default: 'dark',
      values: [
        { name: 'dark', value: '#0f172a' },
        { name: 'light', value: '#ffffff' },
      ],
    },
    layout: 'padded',
  },
  decorators: [
    (Story) => (
      <div style={{ color: '#e2e8f0', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <Story />
      </div>
    ),
  ],
};

export default preview;
