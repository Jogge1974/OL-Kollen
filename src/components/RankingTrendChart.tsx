import * as React from 'react';

import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';

import { ColorPalette, useColors } from '@/src/theme/ThemeContext';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';
import { SverigelistanTrendPoint } from '@/src/types/sverigelistan';

type RankingTrendChartProps = {
  classPoints?: SverigelistanTrendPoint[];
  points: SverigelistanTrendPoint[];
  showTitle?: boolean;
};

type ChartPoint = {
  label: string;
  monthKey?: string;
  rank: number | null;
  x: number;
  y: number | null;
};

const CHART_HEIGHT = 120;
const CHART_PADDING_BOTTOM = 24;
const CHART_PADDING_HORIZONTAL = 6;
const CHART_PADDING_TOP = 14;
const DOT_SIZE = 8;
const AXIS_WIDTH = 34;
const AXIS_GAP = 8;

export function RankingTrendChart({ classPoints = [], points, showTitle = true }: RankingTrendChartProps) {
  const colors = useColors();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [chartWidth, setChartWidth] = React.useState(0);

  const onLayout = (event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    if (nextWidth !== chartWidth) {
      setChartWidth(nextWidth);
    }
  };

  const usableWidth = Math.max(chartWidth - CHART_PADDING_HORIZONTAL * 2 - AXIS_WIDTH * 2 - AXIS_GAP * 2, 1);
  const usableHeight = CHART_HEIGHT - CHART_PADDING_TOP - CHART_PADDING_BOTTOM - DOT_SIZE;

  const primaryScale = getScale(points, 50);
  const secondaryScale = getScale(classPoints, 10);
  const primaryChartPoints = buildChartPoints(points, primaryScale, usableHeight, usableWidth);
  const secondaryChartPoints = buildChartPoints(classPoints, secondaryScale, usableHeight, usableWidth);

  return (
    <View style={styles.card}>
      {showTitle ? <Text style={styles.title}>Placering senaste m�naderna</Text> : null}

      <View onLayout={onLayout} style={styles.chartFrame}>
        <View style={styles.axisLeft}>
          <Text style={styles.axisTitle}>Plac.</Text>
          <Text style={styles.axisValueTop}>{primaryScale.worst}</Text>
          <Text style={styles.axisValueBottom}>{primaryScale.best}</Text>
        </View>

        <View style={styles.axisRight}>
          <Text style={styles.axisSpacer}> </Text>
          <Text style={styles.axisValueTop}>{secondaryScale.worst}</Text>
          <Text style={styles.axisValueBottom}>{secondaryScale.best}</Text>
        </View>

        <View style={styles.guideTop} />
        <View style={styles.guideBottom} />

        {primaryChartPoints.map((point, index) => {
          if (index === 0 || !point.monthKey) return null;
          const prev = primaryChartPoints[index - 1];
          if (!prev.monthKey) return null;
          const prevMonth = prev.monthKey.slice(5, 7);
          const currMonth = point.monthKey.slice(5, 7);
          if (prevMonth !== '12' || currMonth !== '01') return null;
          const lineX = (prev.x + point.x) / 2;
          return (
            <View
              key={`year-line-${point.monthKey}`}
              style={[
                styles.yearBoundary,
                { left: lineX },
              ]}
            />
          );
        })}

        {renderSegments(primaryChartPoints, styles.primarySegment, styles)}
        {renderSegments(secondaryChartPoints, styles.secondarySegment, styles)}
        {renderPoints(primaryChartPoints, styles.primaryDot, 'primary', styles)}
        {renderPoints(secondaryChartPoints, styles.secondaryDot, 'secondary', styles)}

        <View style={styles.labelsRow}>
          {primaryChartPoints.map((point, index) => (
            <Text key={`${point.label}-label`} style={styles.monthLabel}>
              {index % 2 === 0 ? point.label : ''}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}

function renderSegments(chartPoints: ChartPoint[], segmentStyle: object, styles: ReturnType<typeof createStyles>) {
  return chartPoints
    .map((point, index) => {
      const next = chartPoints[index + 1];
      if (!next || point.y === null || next.y === null) {
        return null;
      }

      const deltaX = next.x - point.x;
      const deltaY = next.y - point.y;
      const width = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      const angle = (Math.atan2(deltaY, deltaX) * 180) / Math.PI;

      return (
        <View
          key={`${point.label}-${next.label}-${angle}`}
          style={[
            styles.segmentBase,
            segmentStyle,
            {
              left: point.x,
              top: point.y,
              transform: [{ rotate: `${angle}deg` }],
              width,
            },
          ]}
        />
      );
    })
    .filter(Boolean);
}

function renderPoints(chartPoints: ChartPoint[], pointStyle: object, kind: string, styles: ReturnType<typeof createStyles>) {
  return chartPoints.map((point) =>
    point.y === null ? null : (
      <View
        key={`${point.label}-${point.rank}-${kind}`}
        style={[
          styles.dotBase,
          pointStyle,
          {
            left: point.x - DOT_SIZE / 2,
            top: point.y - DOT_SIZE / 2,
          },
        ]}
      />
    ),
  );
}

function buildChartPoints(
  points: SverigelistanTrendPoint[],
  scale: { max: number; min: number },
  usableHeight: number,
  usableWidth: number,
): ChartPoint[] {
  return points.map((point, index) => {
    const x = CHART_PADDING_HORIZONTAL + AXIS_WIDTH + AXIS_GAP + (usableWidth * index) / Math.max(points.length - 1, 1);

    if (point.rank === null) {
      return {
        label: point.label,
        monthKey: point.monthKey,
        rank: null,
        x,
        y: null,
      };
    }

    const spread = Math.max(scale.max - scale.min, 1);
    const ratio = (point.rank - scale.min) / spread;
    const y = CHART_PADDING_TOP + DOT_SIZE / 2 + (1 - ratio) * usableHeight;

    return {
      label: point.label,
      monthKey: point.monthKey,
      rank: point.rank,
      x,
      y,
    };
  });
}

function getScale(points: SverigelistanTrendPoint[], padding: number) {
  const rankedPoints = points.filter((point) => point.rank !== null).map((point) => point.rank as number);
  const best = rankedPoints.length > 0 ? Math.min(...rankedPoints) : 1;
  const worst = rankedPoints.length > 0 ? Math.max(...rankedPoints) : 2;

  return {
    max: Math.max(worst + padding, best + 1),
    min: Math.max(1, best - padding),
    best,
    worst,
  };
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
  axisLeft: {
    bottom: CHART_PADDING_BOTTOM,
    left: CHART_PADDING_HORIZONTAL,
    position: 'absolute',
    top: CHART_PADDING_TOP,
    width: AXIS_WIDTH,
  },
  axisRight: {
    bottom: CHART_PADDING_BOTTOM,
    position: 'absolute',
    right: CHART_PADDING_HORIZONTAL,
    top: CHART_PADDING_TOP,
    width: AXIS_WIDTH,
  },
  axisSpacer: {
    ...typography.caption,
    color: 'transparent',
  },
  axisTitle: {
    ...typography.captionStrong,
    color: colors.textMuted,
  },
  axisValueBottom: {
    ...typography.caption,
    bottom: 0,
    color: colors.textMuted,
    fontSize: 10,
    lineHeight: 12,
    position: 'absolute',
  },
  axisValueTop: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 10,
    lineHeight: 12,
    position: 'absolute',
    top: 20,
  },
  card: {
    gap: spacing.sm,
  },
  chartFrame: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    height: CHART_HEIGHT,
    overflow: 'hidden',
    position: 'relative',
  },
  dotBase: {
    borderRadius: 999,
    borderWidth: 2,
    height: DOT_SIZE,
    position: 'absolute',
    width: DOT_SIZE,
  },
  guideBottom: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    bottom: CHART_PADDING_BOTTOM + 8,
    left: CHART_PADDING_HORIZONTAL + AXIS_WIDTH + AXIS_GAP,
    position: 'absolute',
    right: CHART_PADDING_HORIZONTAL + AXIS_WIDTH + AXIS_GAP,
  },
  guideTop: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    left: CHART_PADDING_HORIZONTAL + AXIS_WIDTH + AXIS_GAP,
    position: 'absolute',
    right: CHART_PADDING_HORIZONTAL + AXIS_WIDTH + AXIS_GAP,
    top: CHART_PADDING_TOP + DOT_SIZE / 2,
  },
  yearBoundary: {
    borderLeftColor: colors.border,
    borderLeftWidth: 1,
    bottom: CHART_PADDING_BOTTOM,
    position: 'absolute',
    top: CHART_PADDING_TOP + DOT_SIZE / 2,
  },
  labelsRow: {
    bottom: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: CHART_PADDING_HORIZONTAL + AXIS_WIDTH + AXIS_GAP,
    position: 'absolute',
    right: CHART_PADDING_HORIZONTAL + AXIS_WIDTH + AXIS_GAP,
  },
  monthLabel: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 10,
    lineHeight: 12,
    textAlign: 'center',
    width: 24,
  },
  primaryDot: {
    backgroundColor: colors.accent,
    borderColor: colors.primaryDeep,
  },
  primarySegment: {
    backgroundColor: colors.primary,
  },
  secondaryDot: {
    backgroundColor: '#79B86C',
    borderColor: '#356E3E',
  },
  secondarySegment: {
    backgroundColor: '#5F9957',
  },
  segmentBase: {
    height: 2,
    position: 'absolute',
    transformOrigin: 'left center',
  },
  title: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    fontSize: 12,
    lineHeight: 16,
  },
});
}



