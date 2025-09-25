import React from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';

import styles from './index.module.css';

type FeatureItem = {
  title: string;
  eyebrow: string;
  description: JSX.Element;
  icon: string;
};

const FeatureList: FeatureItem[] = [
  {
    title: 'Spec-first workflows',
    eyebrow: 'Workflow clarity',
    icon: '🧭',
    description: (
      <>
        Treat your specifications as first-class citizens. Edit, review, and
        ship changes with confidence using Speckit&apos;s TUI and CLI.
      </>
    ),
  },
  {
    title: 'AI assistance when you want it',
    eyebrow: 'Respect the guardrails',
    icon: '✨',
    description: (
      <>
        Toggle AI proposals at runtime and capture diffs that stay within your
        team&apos;s expectations. Speckit works the same way with or without AI.
      </>
    ),
  },
  {
    title: 'Composable templates',
    eyebrow: 'Reusable building blocks',
    icon: '🧱',
    description: (
      <>
        Start new work quickly with reusable templates that bundle the files
        and commands you need for each spec-driven flow.
      </>
    ),
  },
];

function HomepageHero(): JSX.Element {
  const {siteConfig} = useDocusaurusContext();

  return (
    <section className={styles.hero}>
      <div className={clsx('container', styles.heroContainer)}>
        <div className={styles.heroText}>
          <span className={styles.badge}>Spec-driven shipping, refined</span>
          <Heading as="h1" className={styles.heroTitle}>
            Build resilient flows with {siteConfig.title}
          </Heading>
          <p className={styles.heroSubtitle}>
            {siteConfig.tagline} Extend your existing workflows with
            human-in-the-loop automation and AI proposals that respect the guardrails
            you set.
          </p>
          <div className={styles.heroActions}>
            <Link
              className={clsx('button button--lg button--primary', styles.primaryButton)}
              to="/docs/dev/specs/speckit-spec-v1-0-0"
            >
              Explore the docs
            </Link>
            <Link
              className={clsx('button button--lg button--outline', styles.secondaryButton)}
              to="https://github.com/speckit-dev/speckit"
            >
              GitHub repository
            </Link>
          </div>
          <ul className={styles.heroMeta}>
            <li>
              One source of truth at any scale — Keep distributed squads anchored to
              the same spec library so releases and audits all reference the latest
              commitments.
            </li>
            <li>
              Stack-flexible planning — When you pivot from React to Next.js (or
              beyond), adjust execution steps while the approved requirements stay
              intact.
            </li>
            <li>
              Requirements tracked like code — Store specs in git, review them
              through pull requests, and carry history with every change.
            </li>
            <li>
              Full-context AI assistance — Give the agent the complete narrative so
              proposals respect the guardrails your team already agreed on.
            </li>
          </ul>
        </div>
        <div className={styles.heroCard}>
          <div className={styles.cardHeader}>
            <span className={styles.cardBadge}>Preview</span>
            <span className={styles.cardAccent} />
          </div>
          <div className={styles.cardBody}>
            <p>
              Compose specs, preview AI proposals, and commit with full context in one
              ergonomic TUI experience.
            </p>
            <div className={styles.cardShell}>
              <div className={styles.shellHeader}>
                <span className={styles.shellDot} />
                <span className={styles.shellDot} />
                <span className={styles.shellDot} />
              </div>
              <pre className={styles.shellContent}>{`$ speckit propose --ai
✓ Guardrails satisfied
✓ Diff captured to ./specs/proposal.md

Next → review, comment, and ship.`}</pre>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Feature({title, eyebrow, description, icon}: FeatureItem): JSX.Element {
  return (
    <div className={styles.feature}>
      <div className={styles.featureIcon} aria-hidden="true">
        {icon}
      </div>
      <div className={styles.featureContent}>
        <span className={styles.featureEyebrow}>{eyebrow}</span>
        <Heading as="h3" className={styles.featureTitle}>
          {title}
        </Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

function FeatureSection(): JSX.Element {
  return (
    <section className={styles.featuresSection}>
      <div className="container">
        <div className={styles.sectionHeader}>
          <span className={styles.sectionBadge}>Why teams choose Speckit</span>
          <Heading as="h2" className={styles.sectionTitle}>
            Operational guardrails meet ergonomic tooling
          </Heading>
          <p>
            Everything you need to capture, review, and ship changes without losing
            the intent behind your specifications.
          </p>
        </div>
        <div className={styles.featureGrid}>
          {FeatureList.map((feature) => (
            <Feature key={feature.title} {...feature} />
          ))}
        </div>
      </div>
    </section>
  );
}

function CtaSection(): JSX.Element {
  return (
    <section className={styles.ctaSection}>
      <div className={clsx('container', styles.ctaContainer)}>
        <div className={styles.ctaContent}>
          <Heading as="h2">Ready to make specs the source of truth?</Heading>
          <p>
            Spin up the CLI, wire in your templates, and keep shipping. Speckit slots
            into existing repos without forcing a rewrite.
          </p>
        </div>
        <Link
          className={clsx('button button--lg button--primary', styles.primaryButton)}
          to="/docs/dev/specs/speckit-spec-v1-0-0"
        >
          View the specification
        </Link>
      </div>
    </section>
  );
}

export default function Home(): JSX.Element {
  return (
    <Layout>
      <main>
        <HomepageHero />
        <FeatureSection />
        <CtaSection />
      </main>
    </Layout>
  );
}
