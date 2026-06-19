import styles from './EyebrowLabel.module.css';

interface EyebrowLabelProps {
  children: React.ReactNode;
  /** Render the label in the monospace family (e.g. isoWeek numbers). */
  mono?: boolean;
  /** Optional element override; defaults to a <p>. */
  as?: 'p' | 'span' | 'div';
  className?: string;
}

/**
 * Eyebrow label — the signature Mega tell: a small uppercase muted kicker.
 * Part of the Mega design language
 * (0.7rem / .07em / weight 700 / muted). Reused across the dashboard,
 * archive cards, and (via parity) the email templates.
 */
export function EyebrowLabel({
  children,
  mono = false,
  as = 'p',
  className = '',
}: EyebrowLabelProps) {
  const Tag = as;
  const classes = [styles.eyebrow, mono ? styles.mono : '', className].filter(Boolean).join(' ');
  return <Tag className={classes}>{children}</Tag>;
}
