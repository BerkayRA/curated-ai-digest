import styles from './EmptyState.module.css';

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className={styles.container} role="status">
      <div className={styles.dotCluster} aria-hidden="true">
        <span className={styles.dot} style={{ '--c': 'var(--color-brand)', '--s': '10px' } as React.CSSProperties} />
        <span className={styles.dot} style={{ '--c': 'var(--color-accent-teal)', '--s': '7px' } as React.CSSProperties} />
        <span className={styles.dot} style={{ '--c': 'var(--color-accent-orange)', '--s': '5px' } as React.CSSProperties} />
      </div>
      <h3 className={styles.title}>{title}</h3>
      {description && <p className={styles.description}>{description}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
