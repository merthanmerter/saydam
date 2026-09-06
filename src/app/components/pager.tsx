import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Sayfa gezinmesi.
 *
 * Sayfa numarası basmıyor: kaçıncı sayfada olduğunu ve toplamı söylemek
 * yeterli, düğme kalabalığı listeye bir şey katmıyor. Tek sayfalık listelerde
 * hiç görünmez.
 */
export function Pager({
  page,
  size,
  count,
  hasMore,
  onChange,
}: {
  page: number;
  size: number;
  /** Bu sayfada gösterilen satır sayısı. */
  count: number;
  hasMore: boolean;
  onChange: (page: number) => void;
}) {
  if (page === 1 && !hasMore) return null;

  const from = (page - 1) * size + 1;
  const to = from + count - 1;

  return (
    <div className="mt-3 flex items-center justify-between gap-3">
      <span className="tabular text-muted-foreground text-sm">
        {from}–{to}
      </span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          aria-label="Önceki sayfa"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          aria-label="Sonraki sayfa"
          disabled={!hasMore}
          onClick={() => onChange(page + 1)}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
