import * as React from 'react';

import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/src/theme/colors';
import { spacing } from '@/src/theme/spacing';
import { typography } from '@/src/theme/typography';
import { SverigelistanTrendPoint } from '@/src/types/sverigelistan';

type RankingTrendChartProps = {
  classPoints?: SverigelistanTrendPoint[];
  points: SverigelistanTrendPoint[];
};

type ChartPoint = {
  label: string;
  rank: number | null;
  x: number;
  y: number | null;
};

const CHART_HEIGHT = 180;
const CHART_PADDING_BOTTOM = 34;
const CHART_PADDING_HORIZONTAL = 4;
const CHART_PADDING_TOP = 18;
const DOT_SIZE = 10;
const AXIS_WIDTH = 28;
const AXIS_GAP = 6;

export function RankingTrendChart({ classPoints = [], points }: RankingTrendChartProps) {
  const [chartWidth, setChartWidth] = React.useState(0);

  const onLayout = (event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    if (nextWidth !== chartWidth) {
      setChartWidth(nextWidth);
    }
  };

  const usableWidth = Math.max(chartWidth - CHART_PADDING_HORIZONTAL * 2 - AXIS_WIDTH * 2 - AXIS_GAP * 2, 1);
  const usableHeight = CHART_HEIGHT - CHART_PADDING_TOP - CHART_PADDING_BOTTOM - DOT_SIZE;

  const primaryScale = getScale(points);
  const secondaryScale = getScale(classPoints);
  const primaryChartPoints = buildChartPoints(points, primaryScale, usableHeight, usableWidth);
  const secondaryChartPoints = buildChartPoints(classPoints, secondaryScale, usableHeight, usableWidth);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Placering senaste 12 månaderna</Text>

      <View onLayout={onLayout} style={styles.chartFrame}>
        <View style={styles.axisLeft}>
          <Text style={styles.axisTitle}>Plac.</Text>
          <Text style={styles.axisValueTop}>{primaryScale.best}</Text>
          <Text style={styles.axisValueBottom}>{primaryScale.worst}</Text>
        </View>

        <View style={styles.axisRight}>
          <Text style={styles.axisSpacer}> </Text>
          <Text style={styles.axisValueTop}>{secondaryScale.best}</Text>
          <Text style={styles.axisValueBottom}>{secondaryScale.worst}</Text>
        </View>

        <View style={styles.guideTop} />
        <View style={styles.guideBottom} />

        {renderSegments(primaryChartPoints, styles.primarySegment)}
        {renderSegments(secondaryChartPoints, styles.secondarySegment)}
        {renderPoints(primaryChartPoints, styles.primaryDot)}
        {renderPoints(secondaryChartPoints, styles.secondaryDot)}

        <View style={styles.labelsRow}>
          {primaryChartPoints.map((point) => (
            <Text key={`${point.label}-label`} style={styles.monthLabel}>
              {point.label}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}

function renderSegments(chartPoints: ChartPoint[], segmentStyle: object) {
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

function renderPoints(chartPoints: ChartPoint[], pointStyle: object) {
  return chartPoints.map((point) =>
    point.y === null ? null : (
      <View
        key={`${point.label}-${point.rank}-${pointStyle === styles.secondaryDot ? 'secondary' : 'primary'}`}
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

function buildChartPoints(points: SverigelistanTrendPoint[], scale: { best: number; spread: number }, usableHeight: number, usableWidth: number): ChartPoint[] {
  return points.map((point, index) => {
    const x = CHART_PADDING_HORIZONTAL + AXIS_WIDTH + AXIS_GAP + (usableWidth * index) / Math.max(points.length - 1, 1);

    if (point.rank === null) {
      return {
        label: point.label,
        rank: null,
        x,
        y: null,
      };
    }

    const ratio = scale.spread === 0 ? 0.5 : (point.rank - scale.best) / scale.spread;
    const y = CHART_PADDING_TOP + DOT_SIZE / 2 + ratio * usableHeight;

    return {
      label: point.label,
      rank: point.rank,
      x,
      y,
    };
  });
}

function getScale(points: SverigelistanTrendPoint[]) {
  const rankedPoints = points.filter((point) => point.rank !== null).map((point) => point.rank as number);
  const best = rankedPoints.length > 0 ? Math.min(...rankedPoints) : 1;
  const worst = rankedPoints.length > 0 ? Math.max(...rankedPoints) : 2;

  return {
    best,
    spread: Math.max(worst - best, 1),
    worst,
  };
}

const styles = StyleSheet.create({
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
    fontSize: 12,
    lineHeight: 16,
    position: 'absolute',
  },
  axisValueTop: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
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
    fontSize: 12,
    lineHeight: 16,
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
    fontSize: 14,
    lineHeight: 20,
  },
});
