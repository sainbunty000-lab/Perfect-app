/**
 * Lightweight chart components built on react-native-svg (already installed).
 * No extra dependencies — works offline, renders identically on Android & iOS.
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Path, Line, Rect, Circle, Text as SvgText, Defs, LinearGradient as SvgGrad, Stop, G } from "react-native-svg";

// ─── Helpers ────────────────────────────────────────────────────────────────
export function compactINR(n: number): string {
  if (Math.abs(n) >= 1e7) return "₹" + (n / 1e7).toFixed(1) + "Cr";
  if (Math.abs(n) >= 1e5) return "₹" + (n / 1e5).toFixed(1) + "L";
  if (Math.abs(n) >= 1e3) return "₹" + (n / 1e3).toFixed(0) + "K";
  return "₹" + n.toFixed(0);
}

// ─── LineChart ───────────────────────────────────────────────────────────────
export interface LineDataset {
  label: string;
  color: string;
  values: (number | null)[];
}
interface LineChartProps {
  datasets: LineDataset[];
  labels: string[];
  width?: number;
  height?: number;
  showGrid?: boolean;
  showDots?: boolean;
  formatY?: (n: number) => string;
}

export function LineChart({
  datasets, labels, width = 320, height = 180,
  showGrid = true, showDots = true,
  formatY = compactINR,
}: LineChartProps) {
  const PAD = { top: 20, right: 12, bottom: 36, left: 52 };
  const W = width - PAD.left - PAD.right;
  const H = height - PAD.top - PAD.bottom;

  const allVals = datasets.flatMap((d) => d.values.filter((v): v is number => v !== null));
  if (allVals.length === 0) return null;
  const minV = Math.min(0, ...allVals);
  const maxV = Math.max(...allVals) * 1.1 || 1;
  const n = labels.length;
  const xStep = n > 1 ? W / (n - 1) : W;

  const toX = (i: number) => PAD.left + (n > 1 ? i * xStep : W / 2);
  const toY = (v: number) => PAD.top + H - ((v - minV) / (maxV - minV)) * H;

  const gridLines = 4;

  return (
    <Svg width={width} height={height}>
      <Defs>
        {datasets.map((ds, di) => (
          <SvgGrad key={di} id={`lg${di}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={ds.color} stopOpacity="0.25" />
            <Stop offset="1" stopColor={ds.color} stopOpacity="0" />
          </SvgGrad>
        ))}
      </Defs>

      {/* Grid lines */}
      {showGrid && Array.from({ length: gridLines + 1 }, (_, gi) => {
        const val = minV + ((maxV - minV) * gi) / gridLines;
        const y = toY(val);
        return (
          <G key={gi}>
            <Line x1={PAD.left} y1={y} x2={PAD.left + W} y2={y} stroke="#1E3A54" strokeWidth={1} strokeDasharray="4,4" />
            <SvgText x={PAD.left - 4} y={y + 4} textAnchor="end" fontSize={9} fill="#4A6A84" fontFamily="Inter_400Regular">
              {formatY(val)}
            </SvgText>
          </G>
        );
      })}

      {/* X-axis labels */}
      {labels.map((label, i) => (
        <SvgText key={i} x={toX(i)} y={PAD.top + H + 16} textAnchor="middle" fontSize={9} fill="#4A6A84">
          {label}
        </SvgText>
      ))}

      {/* Area fills + lines */}
      {datasets.map((ds, di) => {
        const pts = ds.values
          .map((v, i) => v !== null ? { x: toX(i), y: toY(v), v } : null)
          .filter(Boolean) as { x: number; y: number; v: number }[];
        if (pts.length < 1) return null;

        // Filled area path
        const areaD = pts.length > 1
          ? `M${pts[0].x},${toY(minV)} L${pts[0].x},${pts[0].y} ` +
            pts.slice(1).map((p) => `L${p.x},${p.y}`).join(" ") +
            ` L${pts[pts.length - 1].x},${toY(minV)} Z`
          : "";

        // Line path
        const lineD = pts.length > 1
          ? `M${pts[0].x},${pts[0].y} ` + pts.slice(1).map((p) => `L${p.x},${p.y}`).join(" ")
          : "";

        return (
          <G key={di}>
            {areaD ? <Path d={areaD} fill={`url(#lg${di})`} /> : null}
            {lineD ? <Path d={lineD} stroke={ds.color} strokeWidth={2.5} fill="none" strokeLinejoin="round" /> : null}
            {showDots && pts.map((p, pi) => (
              <Circle key={pi} cx={p.x} cy={p.y} r={4} fill={ds.color} stroke="#0F1E30" strokeWidth={1.5} />
            ))}
          </G>
        );
      })}
    </Svg>
  );
}

// ─── BarChart ────────────────────────────────────────────────────────────────
export interface BarDataset {
  label: string;
  color: string;
  values: number[];
}
interface BarChartProps {
  datasets: BarDataset[];
  labels: string[];
  width?: number;
  height?: number;
  formatY?: (n: number) => string;
  grouped?: boolean;
}

export function BarChart({
  datasets, labels, width = 320, height = 180,
  formatY = compactINR, grouped = true,
}: BarChartProps) {
  const PAD = { top: 20, right: 12, bottom: 36, left: 52 };
  const W = width - PAD.left - PAD.right;
  const H = height - PAD.top - PAD.bottom;

  const allVals = datasets.flatMap((d) => d.values);
  const maxV = Math.max(...allVals) * 1.12 || 1;
  const n = labels.length;
  const groupW = W / n;
  const barCount = grouped ? datasets.length : 1;
  const barGap = 3;
  const barW = Math.max(6, (groupW - barGap * (barCount + 1)) / barCount);

  const toY = (v: number) => PAD.top + H - (v / maxV) * H;
  const barH = (v: number) => Math.max(2, (v / maxV) * H);
  const gridLines = 4;

  return (
    <Svg width={width} height={height}>
      {/* Grid */}
      {Array.from({ length: gridLines + 1 }, (_, gi) => {
        const val = (maxV * gi) / gridLines;
        const y = toY(val);
        return (
          <G key={gi}>
            <Line x1={PAD.left} y1={y} x2={PAD.left + W} y2={y} stroke="#1E3A54" strokeWidth={1} strokeDasharray="4,4" />
            <SvgText x={PAD.left - 4} y={y + 4} textAnchor="end" fontSize={9} fill="#4A6A84">
              {formatY(val)}
            </SvgText>
          </G>
        );
      })}

      {/* Bars */}
      {labels.map((label, gi) => {
        const groupX = PAD.left + gi * groupW;
        return (
          <G key={gi}>
            {datasets.map((ds, di) => {
              const v = ds.values[gi] ?? 0;
              const x = groupX + barGap + di * (barW + barGap);
              return (
                <G key={di}>
                  <Rect
                    x={x} y={toY(v)} width={barW} height={barH(v)}
                    rx={3} fill={ds.color} opacity={0.85}
                  />
                </G>
              );
            })}
            <SvgText x={groupX + groupW / 2} y={PAD.top + H + 16} textAnchor="middle" fontSize={9} fill="#4A6A84">
              {label}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

// ─── MiniSparkline ──────────────────────────────────────────────────────────
export function MiniSparkline({ values, color, width = 80, height = 32 }: { values: number[]; color: string; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values) || 1;
  const pts = values.map((v, i) => ({
    x: (i / (values.length - 1)) * width,
    y: height - ((v - min) / (max - min || 1)) * height * 0.85 - height * 0.05,
  }));
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  return (
    <Svg width={width} height={height}>
      <Defs>
        <SvgGrad id="spark" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0.3" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </SvgGrad>
      </Defs>
      <Path d={`${d} L${pts[pts.length - 1].x},${height} L0,${height} Z`} fill="url(#spark)" />
      <Path d={d} stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" />
    </Svg>
  );
}

// ─── DonutGauge ─────────────────────────────────────────────────────────────
export function DonutGauge({ value, max = 100, color, size = 80, label }: { value: number; max?: number; color: string; size?: number; label?: string }) {
  const r = (size - 10) / 2;
  const cx = size / 2, cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const pct = Math.min(1, value / max);
  const stroke = pct * circumference;

  return (
    <View style={{ alignItems: "center" }}>
      <Svg width={size} height={size}>
        <Circle cx={cx} cy={cy} r={r} fill="none" stroke="#1E3A54" strokeWidth={8} />
        <Circle
          cx={cx} cy={cy} r={r} fill="none"
          stroke={color} strokeWidth={8}
          strokeDasharray={`${stroke} ${circumference}`}
          strokeLinecap="round"
          rotation={-90} originX={cx} originY={cy}
        />
        <SvgText x={cx} y={cy + 5} textAnchor="middle" fontSize={14} fill="#E8F4FF" fontFamily="Inter_700Bold">
          {Math.round(pct * 100)}%
        </SvgText>
      </Svg>
      {label && <Text style={styles.gaugeLabel}>{label}</Text>}
    </View>
  );
}

// ─── Legend ──────────────────────────────────────────────────────────────────
export function ChartLegend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <View style={styles.legend}>
      {items.map((item, i) => (
        <View key={i} style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: item.color }]} />
          <Text style={styles.legendLabel}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  gaugeLabel: { fontSize: 10, color: "#7A9BB5", fontFamily: "Inter_400Regular", marginTop: 4, textAlign: "center" },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "center", marginTop: 8 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 10, color: "#7A9BB5", fontFamily: "Inter_400Regular" },
});
