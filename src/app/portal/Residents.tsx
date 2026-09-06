import { Copy, UserPlus, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { DialogActions, EmptyState, Field, PageHeader } from "@/app/components/bits";
import { actionsColumn, type Column, DataTable } from "@/app/components/data-table";
import { RowActions } from "@/app/components/row-actions";
import { Badge } from "@/components/ui/badge";
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
import { post, useAction, usePaged } from "@/lib/api";
import { date } from "@/lib/format";
import type { Resident } from "@/lib/types";

type InviteResult = { link: string; delivered: boolean; reason?: string };

export default function Residents() {
  const residents = usePaged<Resident>("/residents");
  const [invite, setInvite] = useState<InviteResult | null>(null);
  const columns = useMemo(() => residentColumns(setInvite), []);

  return (
    <>
      <PageHeader
        title="Site sakinleri"
        description="Sakinler kendi başına kayıt olamaz; yönetim e-postayla ekler. Siteden çıkarılan bir sakinin geçmişi silinmez."
        actions={<AddDialog onInvite={setInvite} />}
      />

      {invite && <InviteBanner invite={invite} onClose={() => setInvite(null)} />}

      <DataTable
        columns={columns}
        rows={residents.items}
        paging={residents}
        rowClassName={(r) => (r.status === "removed" ? "opacity-55" : undefined)}
        empty={<EmptyState icon={Users} title="Henüz sakin eklenmedi" />}
      />
    </>
  );
}

const residentColumns = (onInvite: (invite: InviteResult) => void): Column<Resident>[] => [
  {
    accessorKey: "fullName",
    header: "Ad soyad",
    cell: ({ row }) => (
      <>
        <span className="font-medium">{row.original.fullName}</span>
        <div className="text-muted-foreground text-xs">
          Eklendi: {date(row.original.createdAt)}
        </div>
      </>
    ),
  },
  {
    accessorKey: "email",
    header: "E-posta",
    cell: ({ row }) => (
      <span className="text-muted-foreground text-sm">{row.original.email}</span>
    ),
  },
  {
    id: "units",
    header: "Daireler",
    cell: ({ row }) => (
      <span className="text-sm">
        {row.original.units.length === 0
          ? "—"
          : row.original.units
              .map((u) => `${u.block ? `${u.block} ` : ""}${u.no}`)
              .join(", ")}
      </span>
    ),
  },
  {
    accessorKey: "role",
    header: "Rol",
    cell: ({ row }) => (
      <Badge variant={row.original.role === "admin" ? "default" : "secondary"}>
        {row.original.role === "admin" ? "Yönetim" : "Sakin"}
      </Badge>
    ),
  },
  {
    accessorKey: "status",
    header: "Durum",
    cell: ({ row }) =>
      row.original.status === "removed" ? (
        <Badge variant="outline">Ayrıldı</Badge>
      ) : row.original.hasPassword ? (
        <Badge variant="outline">Aktif</Badge>
      ) : (
        <Badge variant="secondary">Davet bekliyor</Badge>
      ),
  },
  actionsColumn<Resident>(({ row }) => (
    <ResidentActions resident={row.original} onInvite={onInvite} />
  )),
];

function InviteBanner({ invite, onClose }: { invite: InviteResult; onClose: () => void }) {
  return (
    <div className="mb-5 rounded-xl border bg-muted/50 p-4">
      <p className="font-medium text-sm">
        {invite.delivered
          ? "Davet e-postası gönderildi."
          : "E-posta gönderilemedi — bağlantıyı kendiniz iletin."}
      </p>
      {invite.reason && (
        <p className="mt-1 text-muted-foreground text-xs">{invite.reason}</p>
      )}
      <div className="mt-3 flex gap-2">
        <Input readOnly value={invite.link} className="font-mono text-xs" />
        <Button
          variant="outline"
          onClick={() => {
            navigator.clipboard.writeText(invite.link);
            toast.success("Bağlantı kopyalandı");
          }}
        >
          <Copy className="size-4" /> Kopyala
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Kapat
        </Button>
      </div>
    </div>
  );
}

function ResidentActions({
  resident,
  onInvite,
}: {
  resident: Resident;
  onInvite: (invite: InviteResult) => void;
}) {
  const reset = useAction<undefined, InviteResult>(
    () => post(`/residents/${resident.id}/reset-password`),
    { invalidate: ["/residents"], onDone: onInvite },
  );
  const remove = useAction(() => post(`/residents/${resident.id}/remove`), {
    invalidate: ["/residents", "/units"],
    success: "Sakin siteden çıkarıldı",
  });

  return (
    <RowActions
      actions={[
        {
          label: "Şifre sıfırla",
          disabled: reset.isPending || resident.status === "removed",
          onSelect: () => reset.mutate(undefined),
          confirm: {
            title: "Şifre sıfırlansın mı?",
            description: `${resident.fullName} için yeni bir şifre belirleme bağlantısı oluşturulur; mevcut şifresi geçersiz olur.`,
            confirmLabel: "Sıfırla",
          },
        },
        {
          label: "Siteden çıkar",
          destructive: true,
          disabled: remove.isPending || resident.status === "removed",
          onSelect: () => remove.mutate(undefined),
          confirm: {
            title: "Siteden çıkarılsın mı?",
            description: `${resident.fullName} artık giriş yapıp yeni işlem yapamaz. Geçmiş ödeme ve tahakkuk kayıtları silinmez, kendisi görüntülemeye devam eder.`,
            confirmLabel: "Çıkar",
          },
        },
      ]}
    />
  );
}

function AddDialog({ onInvite }: { onInvite: (invite: InviteResult) => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    role: "resident" as "resident" | "admin",
  });

  const add = useAction<undefined, { invite: InviteResult }>(
    () =>
      post("/residents", {
        fullName: form.fullName,
        email: form.email,
        phone: form.phone || null,
        role: form.role,
        unitIds: [],
      }),
    {
      invalidate: ["/residents"],
      onDone: (result) => {
        setOpen(false);
        setForm({ ...form, fullName: "", email: "", phone: "" });
        onInvite(result.invite);
      },
    },
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="size-4" /> Sakin ekle
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sakin ekle</DialogTitle>
          <DialogDescription>
            Kişiye şifre belirleme bağlantısı gönderilir. Daire ataması "Daireler"
            sayfasından yapılır.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            add.mutate(undefined);
          }}
        >
          <Field label="Ad soyad">
            <Input
              required
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            />
          </Field>
          <Field label="E-posta">
            <Input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Telefon">
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </Field>
            <Field label="Rol">
              <Select
                value={form.role}
                onValueChange={(role) =>
                  setForm({ ...form, role: role as "resident" | "admin" })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="resident">Site sakini</SelectItem>
                  <SelectItem value="admin">Site yönetimi</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <DialogActions>
            <Button type="submit" disabled={add.isPending}>
              Ekle ve davet gönder
            </Button>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}
