import { Copy, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DialogActions, EmptyState, Field, PageHeader } from "@/app/components/bits";
import { Pager } from "@/app/components/pager";
import { RowActions } from "@/app/components/row-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { post, useAction, usePaged } from "@/lib/api";
import { date } from "@/lib/format";
import type { Resident } from "@/lib/types";

type InviteResult = { link: string; delivered: boolean; reason?: string };

export default function Residents() {
  const residents = usePaged<Resident>("/residents");
  const [invite, setInvite] = useState<InviteResult | null>(null);

  return (
    <>
      <PageHeader
        title="Site sakinleri"
        description="Sakinler kendi başına kayıt olamaz; yönetim e-postayla ekler. Siteden çıkarılan bir sakinin geçmişi silinmez."
        actions={<AddDialog onInvite={setInvite} />}
      />

      {invite && <InviteBanner invite={invite} onClose={() => setInvite(null)} />}

      {residents.items.length === 0 ? (
        <EmptyState icon={Users} title="Henüz sakin eklenmedi" />
      ) : (
        <>
          <Card className="overflow-hidden py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ad soyad</TableHead>
                  <TableHead>E-posta</TableHead>
                  <TableHead>Daireler</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead className="w-px">
                    <span className="sr-only">İşlemler</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {residents.items.map((resident) => (
                  <ResidentRow key={resident.id} resident={resident} onInvite={setInvite} />
                ))}
              </TableBody>
            </Table>
          </Card>
          <Pager
            page={residents.page}
            size={residents.size}
            count={residents.items.length}
            hasMore={residents.hasMore}
            onChange={residents.setPage}
          />
        </>
      )}
    </>
  );
}

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

function ResidentRow({
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
    <TableRow className={resident.status === "removed" ? "opacity-55" : undefined}>
      <TableCell className="font-medium">
        {resident.fullName}
        <div className="text-muted-foreground text-xs">
          Eklendi: {date(resident.createdAt)}
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground text-sm">{resident.email}</TableCell>
      <TableCell className="text-sm">
        {resident.units.length === 0
          ? "—"
          : resident.units.map((u) => `${u.block ? `${u.block} ` : ""}${u.no}`).join(", ")}
      </TableCell>
      <TableCell>
        <Badge variant={resident.role === "admin" ? "default" : "secondary"}>
          {resident.role === "admin" ? "Yönetim" : "Sakin"}
        </Badge>
      </TableCell>
      <TableCell>
        {resident.status === "removed" ? (
          <Badge variant="outline">Ayrıldı</Badge>
        ) : resident.hasPassword ? (
          <Badge variant="outline">Aktif</Badge>
        ) : (
          <Badge variant="secondary">Davet bekliyor</Badge>
        )}
      </TableCell>
      <TableCell className="text-right">
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
      </TableCell>
    </TableRow>
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
