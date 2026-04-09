import type { StorybookConfig } from '@storybook/react-vite';
import { resolve } from 'path';

const config: StorybookConfig = {
  stories: ['../src/stories/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-essentials'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  docs: {
    autodocs: 'tag',
  },
  viteFinal: async (config) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...config.resolve.alias,
      'next/link': resolve(__dirname, '../src/stories/__mocks__/next-link.tsx'),
      'next/navigation': resolve(
        __dirname,
        '../src/stories/__mocks__/next-navigation.ts'
      ),
    };
    return config;
  },
};

export default config;
