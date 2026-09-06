import { FileText, Upload } from "lucide-react";
import { useState } from "react";
import { DialogActions, EmptyState, Field, PageHeader } from "@/app/components/bits";
import { FileUpload, type UploadedFile } from "@/app/components/inputs";
import { Pager } from "@/app/components/pager";
import { RowActions } from "@/app/components/row-actions";
import { useSession } from "@/app/session";
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
import { del, post, useAction, usePaged } from "@/lib/api";
import { date } from "@/lib/format";
import type { Doc } from "@/lib/types";

const CATEGORIES = {
  yonetmelik: "Yönetmelik",
  toplanti: "Toplantı",
  sozlesme: "Sözleşme",
  proje: "Proje",
  diger: "Diğer",
} as const;

const size = (bytes: number) =>
  bytes > 1_048_576
    ? `${(bytes / 1_048_576).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export default function Documents() {
  const { isAdmin } = useSession();
  const documents = usePaged<Doc>("/documents");

  return (
    <>
      <PageHeader
        title="Dokümanlar"
        description="Site yönetmeliği, toplantı tutanakları, sözleşmeler ve projeler. Tüm sakinler görüntüleyebilir."
        actions={isAdmin && <UploadDialog />}
      />

      {documents.items.length === 0 ? (
        <EmptyState icon={FileText} title="Henüz doküman yüklenmedi" />
      ) : (
        <>
          <Card className="overflow-hidden py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Başlık</TableHead>
                  <TableHead>Kategori</TableHead>
                  <TableHead>Yükleyen</TableHead>
                  <TableHead>Tarih</TableHead>
                  <TableHead className="w-px">
                    <span className="sr-only">İşlemler</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.items.map((doc) => (
                  <DocRow key={doc.id} doc={doc} isAdmin={isAdmin} />
                ))}
              </TableBody>
            </Table>
          </Card>
          <Pager
            page={documents.page}
            size={documents.size}
            count={documents.items.length}
            hasMore={documents.hasMore}
            onChange={documents.setPage}
          />
        </>
      )}
    </>
  );
}

function DocRow({ doc, isAdmin }: { doc: Doc; isAdmin: boolean }) {
  const remove = useAction(() => del(`/documents/${doc.id}`), {
    invalidate: ["/documents"],
    success: "Doküman silindi",
  });

  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{doc.title}</div>
        <div className="text-muted-foreground text-xs">
          {doc.fileName} · {size(doc.sizeBytes)}
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="secondary">{CATEGORIES[doc.category]}</Badge>
      </TableCell>
      <TableCell className="text-muted-foreground text-sm">
        {doc.uploaderName ?? "—"}
      </TableCell>
      <TableCell className="text-muted-foreground text-sm">{date(doc.createdAt)}</TableCell>
      <TableCell className="text-right">
        <RowActions
          actions={[
            { label: "Aç", href: doc.fileUrl },
            ...(isAdmin
              ? [
                  {
                    label: "Sil",
                    destructive: true,
                    disabled: remove.isPending,
                    onSelect: () => remove.mutate(undefined),
                    confirm: {
                      title: "Doküman silinsin mi?",
                      description: `"${doc.title}" kalıcı olarak kaldırılacak; sakinler artık erişemeyecek.`,
                      confirmLabel: "Sil",
                    },
                  },
                ]
              : []),
          ]}
        />
      </TableCell>
    </TableRow>
  );
}

function UploadDialog() {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<UploadedFile | null>(null);
  const [form, setForm] = useState({ title: "", category: "yonetmelik" });

  const create = useAction(
    () =>
      post("/documents", {
        title: form.title || file?.name,
        category: form.category,
        fileUrl: file?.url,
        fileName: file?.name,
        sizeBytes: file?.size ?? 0,
      }),
    {
      invalidate: ["/documents"],
      success: "Doküman eklendi",
      onDone: () => {
        setOpen(false);
        setFile(null);
        setForm({ ...form, title: "" });
      },
    },
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Upload className="size-4" /> Doküman yükle
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Doküman yükle</DialogTitle>
          <DialogDescription>PDF, görsel veya Office belgesi.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (file) create.mutate(undefined);
          }}
        >
          <Field label="Başlık">
            <Input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </Field>
          <Field label="Kategori">
            <Select
              value={form.category}
              onValueChange={(category) => setForm({ ...form, category })}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORIES).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Dosya">
            <FileUpload
              folder="dokumanlar"
              value={file}
              onChange={setFile}
              accept="application/pdf,image/*,.docx,.xlsx"
            />
          </Field>
          <DialogActions>
            <Button type="submit" disabled={create.isPending || !file}>
              Kaydet
            </Button>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}
