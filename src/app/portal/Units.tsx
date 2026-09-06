import { DoorOpen, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { DialogActions, EmptyState, Field, PageHeader, Stat } from "@/app/components/bits";
import { actionsColumn, type Column, DataTable } from "@/app/components/data-table";
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
import { Input } from "@/components/ui/input";
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

  const [form, setForm] = useState(defaults);
  const [rented, setRented] = useState(unit?.tenantMembershipId != null);
  const set = (key: keyof ReturnType<typeof defaults>) => (value: string) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  const arsaPayi = Number(form.arsaPayi.replace(",", "."));
  const valid = form.no.trim().length > 0 && arsaPayi > 0;

  const payload = () => ({
    block: form.block.trim(),
    no: form.no.trim(),
    floor: form.floor.trim() === "" ? null : Number(form.floor),
    arsaPayi,
    ownerMembershipId: form.ownerMembershipId === "none" ? null : form.ownerMembershipId,
    tenantMembershipId: form.tenantMembershipId === "none" ? null : form.tenantMembershipId,
  });

  const save = useAction(
    () => (unit ? patch(`/units/${unit.id}`, payload()) : post("/units", payload())),
    {
      invalidate: ["/units", "/site", "/reports"],
      success: unit ? "Daire güncellendi" : "Daire eklendi",
      onDone: () => close(),
    },
  );

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
        setForm(defaults);
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
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (valid) save.mutate(undefined);
          }}
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Blok">
              <Input
                value={form.block}
                onChange={(e) => set("block")(e.target.value)}
                placeholder="A"
              />
            </Field>
            <Field label="Kapı no">
              <Input required value={form.no} onChange={(e) => set("no")(e.target.value)} />
            </Field>
            <Field label="Kat">
              <Input
                inputMode="numeric"
                value={form.floor}
                onChange={(e) => set("floor")(e.target.value)}
              />
            </Field>
          </div>

          <Field label="Arsa payı" hint="Tapudaki pay. Ortak gider bu orana göre bölünür.">
            <Input
              required
              inputMode="decimal"
              value={form.arsaPayi}
              onChange={(e) => set("arsaPayi")(e.target.value)}
            />
          </Field>

          <Field label="Malik" hint="Ortak giderden asıl sorumlu olan kişi (KMK m.20)">
            <PersonSelect
              value={form.ownerMembershipId === "none" ? null : form.ownerMembershipId}
              residents={residents}
              onChange={(id) => set("ownerMembershipId")(id ?? "none")}
            />
          </Field>

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
              onChange={(e) => {
                setRented(e.target.checked);
                if (!e.target.checked) set("tenantMembershipId")("none");
              }}
            />
            Daire kirada
          </label>

          {rented && (
            <Field label="Kiracı" hint="Kira bedeli kadar müteselsil sorumlu (KMK m.22)">
              <PersonSelect
                value={form.tenantMembershipId === "none" ? null : form.tenantMembershipId}
                residents={residents}
                onChange={(id) => set("tenantMembershipId")(id ?? "none")}
              />
            </Field>
          )}

          <DialogActions>
            <Button type="submit" disabled={save.isPending || !valid}>
              {unit ? "Kaydet" : "Ekle"}
            </Button>
          </DialogActions>
        </form>
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
