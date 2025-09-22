import React from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';

import styles from './index.module.css';

type FeatureItem = {
  title: string;
  description: JSX.Element;
};

const FeatureList: FeatureItem[] = [
  {
    title: 'Spec-first workflows',
    description: (
      <>
        Treat your specifications as first-class citizens. Edit, review, and
        ship changes with confidence using Speckit&apos;s TUI and CLI.
      </>
    ),
  },
  {
    title: 'AI assistance when you want it',
    description: (
      <>
        Toggle AI proposals at runtime and capture diffs that stay within your
        team&apos;s guardrails. Speckit works the same way with or without AI.
      </>
    ),
  },
  {
    title: 'Composable templates',
    description: (
      <>
        Start new work quickly with reusable templates that bundle the files
        and commands you need for each spec-driven flow.
      </>
    ),
  },
];

function HomepageHeader(): JSX.Element {
  const {siteConfig} = useDocusaurusContext();

  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <Heading as="h1" className="hero__title">
          {siteConfig.title}
        </Heading>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <Link className="button button--secondary button--lg" to="/docs/speckit-spec">
            Read the core spec
          </Link>
          <Link className="button button--outline button--lg" to="https://github.com/speckit-dev/speckit">
            View on GitHub
          </Link>
        </div>
      </div>
    </header>
  );
}

function Feature({title, description}: FeatureItem): JSX.Element {
  return (
    <div className={styles.feature}>
      <Heading as="h3">{title}</Heading>
      <p>{description}</p>
    </div>
  );
}

export default function Home(): JSX.Element {
  return (
    <Layout>
      <HomepageHeader />
      <main>
        <section className="container">
          <div className={styles.features}>
            {FeatureList.map((props, idx) => (
              <Feature key={idx} {...props} />
            ))}
          </div>
        </section>
      </main>
    </Layout>
  );
}
