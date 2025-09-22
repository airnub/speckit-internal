import type {Config} from '@docusaurus/types';
import {themes as prismThemes} from 'prism-react-renderer';

const config: Config = {
  title: 'Speckit',
  tagline: 'Spec-driven development for resilient shipping.',
  favicon: 'img/logo.svg',

  url: 'https://speckit.dev',
  baseUrl: '/',

  organizationName: 'speckit',
  projectName: 'speckit',

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          path: '../specs',
          routeBasePath: 'docs',
          sidebarPath: './sidebars.ts',
          exclude: [
            '**/docs/website/**',
            '**/docs/.docusaurs/**',
            '**/docs/node_modules/**',
            '**/docs/bubild/**',
            '../website/**',
            '../.docusaurs/**',
            '../.docusaurus/**',
            '../node_modules/**',
            '../bubild/**',
            '../build/**',
            '.docusaurus/**',
            'node_modules/**',
            'build/**'
          ],
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      },
    ],
  ],

  themeConfig: {
    navbar: {
      title: 'Speckit',
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'tutorialSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          href: 'https://github.com/speckit-dev/speckit',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Community',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/speckit-dev/speckit',
            },
            {
              label: 'Issues',
              href: 'https://github.com/speckit-dev/speckit/issues',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Speckit contributors. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  },
};

export default config;
