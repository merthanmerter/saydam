import { areaY, defineChart, lineY } from "@tanstack/charts";
import { d3Curve } from "@tanstack/charts/d3/shape";
import { Chart } from "@tanstack/charts/react";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { scalePoint } from "@tanstack/charts/scales/point";
import { tooltip } from "@tanstack/charts/tooltip";
import { curveNatural } from "d3-shape";
import { useMemo } from "react";
import { money, periodLabel } from "@/lib/format";

export type MonthlyPoint = {
  period: number;
  collectedCents: number;
  spentCents: number;
  accruedCents: number;
};

/** Para yönü rengi anlam taşır: tahsilat yeşil, harcama kırmızı. */
const SERIES = [
  { key: "collected", label: "Tahsilat", color: "var(--success)" },
  { key: "spent", label: "Harcama", color: "var(--danger)" },
] as const;

const shortMonth = (period: number) => periodLabel(period).slice(0, 3);
const smooth = d3Curve(curveNatural);

/**
 * Son on iki ayın tahsilat–harcama seyri.
 *
 * İki alan üst üste çizilir, üst üste yığılmaz: `y1`/`y2` açıkça verilmezse
 * `areaY` katmanları her x'te toplar ve harcama, tahsilatın üstüne biner.
 *
 * Grafik kütüphanesi ağır olduğu için yalnızca portalda, tembel yüklemeyle
 * çağrılır; tanıtım sayfası bu maliyeti ödemez.
 */
export default function TreasuryChart({ months }: { months: MonthlyPoint[] }) {
  const definition = useMemo(() => {
    const rows = months.map((point) => ({
      ay: shortMonth(point.period),
      collected: point.collectedCents / 100,
      spent: point.spentCents / 100,
    }));

    return defineChart({
      /*
       * Dolgu ve çizgi ayrı: `areaY`'nin konturu şeklin tamamını dolaşıyor,
       * yani grafiğin iki ucunda dikey çizgiler bırakıyor. Üst sınır ayrı bir
       * `lineY` olunca yalnızca eğri çiziliyor.
       *
       * Dolgu aşağı doğru saydamlaşıyor: iki alan üst üste bindiğinde düz
       * opaklık çamurlu bir renk bırakıyordu.
       */
      marks: SERIES.flatMap((series) => [
        areaY(rows, {
          id: `${series.key}-alan`,
          x: "ay",
          y1: 0,
          y2: series.key,
          fill: `url(#dolgu-${series.key})`,
          curve: smooth,
        }),
        lineY(rows, {
          id: series.key,
          x: "ay",
          y: series.key,
          stroke: series.color,
          strokeWidth: 2,
          curve: smooth,
        }),
      ]),
      scales: {
        x: { scale: scalePoint },
        y: {
          scale: scaleLinear,
          nice: true,
          grid: true,
          axis: { ticks: { format: (value: number) => money(value * 100) } },
        },
      },
      gradients: SERIES.map((series) => ({
        id: `dolgu-${series.key}`,
        x1: 0,
        y1: 1,
        x2: 0,
        y2: 0,
        stops: [
          { offset: 0, color: series.color, opacity: 0.02 },
          { offset: 1, color: series.color, opacity: 0.3 },
        ],
      })),
      clip: true,
      tooltip,
    });
  }, [months]);

  return (
    <>
      <Chart
        definition={definition}
        height={220}
        ariaLabel="Son on iki ayın tahsilat ve harcama seyri"
      />
      <div className="mt-2 flex justify-center gap-4 text-xs">
        {SERIES.map((series) => (
          <span key={series.key} className="flex items-center gap-1.5">
            <span className="size-2 rounded-[2px]" style={{ background: series.color }} />
            {series.label}
          </span>
        ))}
      </div>
    </>
  );
}
