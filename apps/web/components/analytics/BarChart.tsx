import { EmptyState } from '@/components/ui/EmptyState';
import styles from './analytics.module.css';

interface BarItem {
  label: string;
  value: number;
}

interface BarChartProps {
  items: BarItem[];
  /** Optional scale ceiling; defaults to the largest value in `items`. */
  max?: number;
}

// Layout constants — keep the SVG geometry readable and dependency-free.
const ROW_HEIGHT = 34;
const LABEL_WIDTH = 132;
const VALUE_WIDTH = 56;
const BAR_HEIGHT = 18;
const VIEW_WIDTH = 480;
const MIN_BAR = 2;

/**
 * BarChart — pure inline-SVG horizontal bars. No chart library, no animation.
 * Bars are Process-Blue rects scaled to value/max; y-labels are eyebrow-styled,
 * value labels are mono. Renders a friendly empty state when there is no data.
 */
export function BarChart({ items, max }: BarChartProps) {
  if (items.length === 0) {
    return <EmptyState title="Henüz veri yok" />;
  }

  const ceiling = Math.max(max ?? 0, ...items.map((item) => item.value), 1);
  const trackStart = LABEL_WIDTH;
  const trackWidth = VIEW_WIDTH - LABEL_WIDTH - VALUE_WIDTH;
  const height = items.length * ROW_HEIGHT;

  return (
    <svg
      className={styles.barChart}
      viewBox={`0 0 ${VIEW_WIDTH} ${height}`}
      role="img"
      preserveAspectRatio="xMidYMid meet"
    >
      {items.map((item, index) => {
        const y = index * ROW_HEIGHT;
        const barY = y + (ROW_HEIGHT - BAR_HEIGHT) / 2;
        const scaled = (item.value / ceiling) * trackWidth;
        const barWidth = item.value > 0 ? Math.max(scaled, MIN_BAR) : 0;
        return (
          <g key={`${item.label}-${index}`}>
            <text x={0} y={y + ROW_HEIGHT / 2} className={styles.barLabel} dominantBaseline="middle">
              {item.label}
            </text>
            <rect
              x={trackStart}
              y={barY}
              width={trackWidth}
              height={BAR_HEIGHT}
              rx={3}
              className={styles.barTrack}
            />
            <rect
              x={trackStart}
              y={barY}
              width={barWidth}
              height={BAR_HEIGHT}
              rx={3}
              className={styles.barFill}
            />
            <text
              x={VIEW_WIDTH}
              y={y + ROW_HEIGHT / 2}
              className={styles.barValue}
              textAnchor="end"
              dominantBaseline="middle"
            >
              {item.value}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
