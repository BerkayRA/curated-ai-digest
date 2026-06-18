import styles from './PageHeader.module.css';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  /**
   * Heading level for the title. The dashboard hero owns the page <h1>, so
   * section pages render an <h2> by default to keep heading order valid.
   */
  as?: 'h1' | 'h2';
}

export function PageHeader({ title, description, actions, as = 'h2' }: PageHeaderProps) {
  const Heading = as;
  return (
    <header className={styles.header}>
      <div className={styles.text}>
        <Heading className={styles.title}>{title}</Heading>
        {description && <p className={styles.description}>{description}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  );
}
