import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { money, periodLabel } from "@/lib/format";

export type MonthlyPoint = {
  period: number;
  collectedCents: number;
  spentCents: number;
  accruedCents: number;
};

/** Para yönü rengi anlam taşır: tahsilat yeşil, harcama kırmızı. */
const config = {
  collected: { label: "Tahsilat", color: "var(--success)" },
  spent: { label: "Harcama", color: "var(--danger)" },
} satisfies ChartConfig;

const shortMonth = (period: number) => periodLabel(period).slice(0, 3);

/**
 * Son on iki ayın tahsilat–harcama seyri. Ağır bir kütüphane olduğu için
 * (recharts) yalnızca portalda, tembel yüklemeyle çağrılır; tanıtım sayfası
 * bu maliyeti ödemez.
 */
export default function TreasuryChart({ months }: { months: MonthlyPoint[] }) {
  const data = months.map((point) => ({
    ay: shortMonth(point.period),
    collected: point.collectedCents / 100,
    spent: point.spentCents / 100,
  }));

  return (
    <ChartContainer config={config} className="h-[220px] w-full">
      <AreaChart data={data} margin={{ left: 18, right: 18, top: 4 }}>
        <defs>
          {(["collected", "spent"] as const).map((key) => (
            <linearGradient key={key} id={`fill-${key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={`var(--color-${key})`} stopOpacity={0.35} />
              <stop offset="100%" stopColor={`var(--color-${key})`} stopOpacity={0.03} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="ay"
          tickLine={false}
          axisLine={false}
          tickMargin={10}
          interval={0}
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              formatter={(value, name) => (
                <div className="flex w-full items-center justify-between gap-4">
                  <span className="text-muted-foreground">
                    {config[name as keyof typeof config]?.label ?? name}
                  </span>
                  <span className="tabular font-medium">{money(Number(value) * 100)}</span>
                </div>
              )}
            />
          }
        />
        {(["collected", "spent"] as const).map((key) => (
          <Area
            key={key}
            dataKey={key}
            type="natural"
            stroke={`var(--color-${key})`}
            strokeWidth={2}
            fill={`url(#fill-${key})`}
            // Giriş animasyonu kısa tutulur; uzun sürerse grafik yarım
            // çizilmiş gibi görünür (ekran görüntülerinde de öyle çıkmıştı).
            animationDuration={700}
          />
        ))}
        <ChartLegend content={<ChartLegendContent />} />
      </AreaChart>
    </ChartContainer>
  );
}
