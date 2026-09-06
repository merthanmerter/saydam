import {
  type ColumnDef,
  type RowData,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import type { ReactNode } from "react";
import { Pager } from "@/app/components/pager";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * Liste tablosu.
 *
 * Sütunlar veri olarak tanımlanır, işaretleme burada bir kez durur: her
 * sayfanın kendi `Table`/`TableHeader`/`Pager` iskelesini kurması gerekmez.
 * Boş liste, sayfa gezinmesi ve hizalama da buraya ait — sekiz ayrı tabloda
 * ayrı ayrı yazıldığında bunlar kaçınılmaz olarak birbirinden ayrışıyordu.
 *
 * Yalnızca çekirdek özellik açık: sıralama ve süzme sunucuda yapılıyor,
 * istemcide ikinci bir kopyasını çalıştırmanın anlamı yok.
 */
export const features = tableFeatures({
  columnMeta: {} as {
    /** Sayısal sütunlar sağa yaslanır. */
    align?: "right";
    /** İşlem sütunu gibi içeriğine göre daralanlar. */
    width?: string;
  },
});

export type Column<T extends RowData> = ColumnDef<typeof features, T>;

/** Satır eylemleri sütunu: başlığı ekran okuyucuya, genişliği içeriğe göre. */
export const actionsColumn = <T extends RowData>(cell: Column<T>["cell"]): Column<T> => ({
  id: "actions",
  header: () => <span className="sr-only">İşlemler</span>,
  meta: { width: "w-px" },
  cell,
});

type PageState = {
  page: number;
  size: number;
  hasMore: boolean;
  setPage: (p: number) => void;
};

export function DataTable<T extends RowData>({
  columns,
  rows,
  empty,
  paging,
  rowClassName,
}: {
  columns: Column<T>[];
  rows: T[];
  /** Liste boşsa tablo yerine bu çizilir. */
  empty?: ReactNode;
  paging?: PageState;
  /** Satırın durumunu belli eden sınıf (ör. ayrılmış sakin soluk görünür). */
  rowClassName?: (row: T) => string | undefined;
}) {
  const table = useTable({ features, columns, data: rows });

  if (rows.length === 0 && empty) return <>{empty}</>;

  return (
    <>
      <Card className="overflow-hidden py-0">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={cn(
                      header.column.columnDef.meta?.align === "right" && "text-right",
                      header.column.columnDef.meta?.width,
                    )}
                  >
                    {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} className={rowClassName?.(row.original)}>
                {row.getAllCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={cn(
                      cell.column.columnDef.meta?.align === "right" && "text-right",
                    )}
                  >
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      {paging && (
        <Pager
          page={paging.page}
          size={paging.size}
          count={rows.length}
          hasMore={paging.hasMore}
          onChange={paging.setPage}
        />
      )}
    </>
  );
}
