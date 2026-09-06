import { DoorOpen, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import type { z } from "zod";
import { DialogActions, EmptyState, PageHeader, Stat } from "@/app/components/bits";
import { actionsColumn, type Column, DataTable } from "@/app/components/data-table";
import { Form, useAppForm, validate } from "@/app/components/form";
import { RowActions } from "@/app/components/row-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  del,
  type Paged,
  patch,
  post,
  useAction,
  usePaged,
  useSuspenseApi,
} from "@/lib/api";
import { number } from "@/lib/format";
import { unitSchema } from "@/lib/schemas";
import type { Resident, Unit, UnitsSummary } from "@/lib/types";

export default function Units() {
  const units = usePaged<Unit, { summary: UnitsSummary }>("/units");
  const residents = useSuspenseApi<Paged<Resident>>("/residents?size=500");
  const summary = units.summary;
  /** Düzenlenen daire; aynı form hem ekleme hem düzenleme için kullanılıyor. */
  const [editing, setEditing] = useState<Unit | null>(null);
  const columns = useMemo(() => unitColumns(setEditing), []);

  return (
    <>
      <PageHeader
        title="Daireler"
        description="Aidat dağıtımının temeli. Ortak gider, tapudaki arsa payları oranında bölünür (KMK m.20)."
        actions={<UnitDialog units={units.items} residents={residents.data.items} />}
      />

      {editing && (
        <UnitDialog
          key={editing.id}
          unit={editing}
          units={units.items}
          residents={residents.data.items}
          onClose={() => setEditing(null)}
        />
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Daire sayısı"
          value={String(summary?.unitCount ?? 0)}
          icon={DoorOpen}
        />
        <Stat
          label="Toplam arsa payı"
          value={number(summary?.totalArsaPayi ?? 0)}
          hint="Her daire kendi payının bu toplama oranı kadar öder"
        />
      </div>

      <div className="mt-6">
        <DataTable
          columns={columns}
          rows={units.items}
          paging={units}
          empty={
            <EmptyState
              icon={DoorOpen}
              title="Henüz daire tanımlanmadı"
              description="Blok, kapı numarası ve tapudaki arsa payıyla daireleri ekleyin."
            />
          }
        />
      </div>
    </>
  );
}

const person = (name: string | null) =>
  name ?? <span className="text-muted-foreground">—</span>;

/**
 * Sütunlar bileşenin dışında: satır işaretlemesi tek yerde ve okunur kalıyor.
 * Düzenleme penceresini açan geri çağrı dışarıdan veriliyor.
 */
const unitColumns = (onEdit: (unit: Unit) => void): Column<Unit>[] => [
  {
    accessorKey: "no",
    header: "Daire",
    cell: ({ row }) => (
      <span className="font-medium">
        {row.original.block} {row.original.no}
      </span>
    ),
  },
  {
    accessorKey: "floor",
    header: "Kat",
    cell: ({ row }) => (
      <span className="text-muted-foreground text-sm">{row.original.floor ?? "—"}</span>
    ),
  },
  {
    accessorKey: "arsaPayi",
    header: "Arsa payı",
    meta: { align: "right" },
    cell: ({ row }) => <span className="tabular">{number(row.original.arsaPayi)}</span>,
  },
  {
    accessorKey: "ownerName",
    header: "Malik",
    cell: ({ row }) => <span className="text-sm">{person(row.original.ownerName)}</span>,
  },
  {
    accessorKey: "tenantName",
    header: "Kiracı",
    cell: ({ row }) => <span className="text-sm">{person(row.original.tenantName)}</span>,
  },
  actionsColumn<Unit>(({ row }) => (
    <UnitActions unit={row.original} onEdit={() => onEdit(row.original)} />
  )),
];

function UnitActions({ unit, onEdit }: { unit: Unit; onEdit: () => void }) {
  const remove = useAction(() => del(`/units/${unit.id}`), {
    invalidate: ["/units", "/reports", "/site"],
    success: "Daire silindi",
  });

  return (
    <RowActions
      actions={[
        { label: "Düzenle", onSelect: onEdit },
        {
          label: "Sil",
          destructive: true,
          disabled: remove.isPending,
          onSelect: () => remove.mutate(undefined),
          confirm: {
            title: "Daire silinsin mi?",
            description: `${unit.block} ${unit.no} ve buna bağlı tahakkuk geçmişi kaldırılacak. Tahakkuk edilmiş bir dönemi varsa silme reddedilir.`,
            confirmLabel: "Sil",
          },
        },
      ]}
    />
  );
}

/**
 * Daire formu — ekleme ve düzenleme aynı form.
 *
 * Yeni kayıtta alanlar son daireden türetilir: blok aynen korunur, kapı
 * numarası bir artırılır, kalanı boş gelir; ardışık girişte numara kendiliğinden
 * ilerler. `unit` verildiğinde form o dairenin değerleriyle açılır ve tetikleyici
 * düğme çizilmez — satır menüsünden açılır.
 */
function UnitDialog({
  unit,
  units,
  residents,
  onClose,
}: {
  unit?: Unit;
  units: Unit[];
  residents: Resident[];
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(unit !== undefined);

  /** "12" → "13", "A3" → "A4", harf içermeyen sonek yoksa olduğu gibi. */
  const nextNo = (no: string) => {
    const match = no.match(/^(.*?)(\d+)$/);
    return match ? `${match[1]}${Number(match[2]) + 1}` : no;
  };

  const defaults = () => {
    if (unit) {
      return {
        block: unit.block,
        no: unit.no,
        floor: unit.floor?.toString() ?? "",
        arsaPayi: String(unit.arsaPayi),
        ownerMembershipId: unit.ownerMembershipId ?? "none",
        tenantMembershipId: unit.tenantMembershipId ?? "none",
      };
    }
    const last = units.at(-1);
    return {
      block: last?.block ?? "",
      no: last ? nextNo(last.no) : "1",
      floor: "",
      arsaPayi: last ? String(last.arsaPayi) : "",
      ownerMembershipId: "none",
      tenantMembershipId: "none",
    };
  };

  const [rented, setRented] = useState(unit?.tenantMembershipId != null);

  const save = useAction(
    (value: z.infer<typeof unitSchema>) => {
      const payload = {
        block: value.block,
        no: value.no,
        floor: value.floor === "" ? null : Number(value.floor),
        arsaPayi: Number(value.arsaPayi.replace(",", ".")),
        ownerMembershipId:
          value.ownerMembershipId === "none" ? null : value.ownerMembershipId,
        tenantMembershipId:
          value.tenantMembershipId === "none" ? null : value.tenantMembershipId,
      };
      return unit ? patch(`/units/${unit.id}`, payload) : post("/units", payload);
    },
    {
      invalidate: ["/units", "/site", "/reports"],
      success: unit ? "Daire güncellendi" : "Daire eklendi",
      onDone: () => close(),
    },
  );

  const form = useAppForm({
    defaultValues: defaults(),
    ...validate(unitSchema),
    onSubmit: ({ value }) => save.mutateAsync(value),
  });

  const close = () => {
    setOpen(false);
    onClose?.();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) return close();
        setOpen(true);
        form.reset(defaults());
        setRented(unit?.tenantMembershipId != null);
      }}
    >
      {!unit && (
        <DialogTrigger asChild>
          <Button>
            <Plus className="size-4" /> Daire ekle
          </Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{unit ? `${unit.block} ${unit.no}` : "Daire ekle"}</DialogTitle>
          <DialogDescription>
            {unit
              ? "Arsa payını değiştirmek sonraki tahakkukları etkiler; geçmiş dönemler olduğu gibi kalır."
              : "Blok ve kapı numarası son daireden devam eder."}
          </DialogDescription>
        </DialogHeader>
        <Form form={form} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <form.AppField name="block">
              {(f) => <f.TextField label="Blok" placeholder="A" />}
            </form.AppField>
            <form.AppField name="no">
              {(f) => <f.TextField label="Kapı no" />}
            </form.AppField>
            <form.AppField name="floor">
              {(f) => <f.TextField label="Kat" inputMode="numeric" />}
            </form.AppField>
          </div>

          <form.AppField name="arsaPayi">
            {(f) => (
              <f.TextField
                label="Arsa payı"
                hint="Tapudaki pay. Ortak gider bu orana göre bölünür."
                inputMode="decimal"
              />
            )}
          </form.AppField>

          <form.AppField name="ownerMembershipId">
            {(f) => (
              <f.ChoiceField
                label="Malik"
                hint="Ortak giderden asıl sorumlu olan kişi (KMK m.20)"
              >
                {(value, onChange) => (
                  <PersonSelect
                    value={value === "none" ? null : value}
                    residents={residents}
                    onChange={(id) => onChange(id ?? "none")}
                  />
                )}
              </f.ChoiceField>
            )}
          </form.AppField>

          {/*
            Kiracı ayrı bir alan, çünkü hukuken ayrı bir kişi: KMK m.22 kiracıyı
            malikle birlikte, kira bedeli kadar müteselsil sorumlu tutar. Yine de
            dairelerin çoğu kirada olmadığı için alan varsayılan olarak kapalı.
          */}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-[var(--primary)]"
              checked={rented}
              onChange={(event) => {
                setRented(event.target.checked);
                if (!event.target.checked) form.setFieldValue("tenantMembershipId", "none");
              }}
            />
            Daire kirada
          </label>

          {rented && (
            <form.AppField name="tenantMembershipId">
              {(f) => (
                <f.ChoiceField
                  label="Kiracı"
                  hint="Kira bedeli kadar müteselsil sorumlu (KMK m.22)"
                >
                  {(value, onChange) => (
                    <PersonSelect
                      value={value === "none" ? null : value}
                      residents={residents}
                      onChange={(id) => onChange(id ?? "none")}
                    />
                  )}
                </f.ChoiceField>
              )}
            </form.AppField>
          )}

          <DialogActions>
            <form.AppForm>
              <form.Submit>{unit ? "Kaydet" : "Ekle"}</form.Submit>
            </form.AppForm>
          </DialogActions>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

/** Malik ve kiracı seçimi için ortak açılır liste. */
function PersonSelect({
  value,
  residents,
  onChange,
  label,
}: {
  value: string | null;
  residents: Resident[];
  onChange: (membershipId: string | null) => void;
  /** Tablo içinde `Field` yok; erişilebilir ad buradan gelir. */
  label?: string;
}) {
  return (
    <Select
      value={value ?? "none"}
      onValueChange={(next) => onChange(next === "none" ? null : next)}
    >
      <SelectTrigger className="h-8 w-full" aria-label={label}>
        <SelectValue placeholder="Boş" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">Boş</SelectItem>
        {residents
          .filter((resident) => resident.status === "active")
          .map((resident) => (
            <SelectItem key={resident.id} value={resident.id}>
              {resident.fullName}
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );
}
