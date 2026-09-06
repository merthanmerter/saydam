import { FileText, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { DialogActions, EmptyState, Field, PageHeader } from "@/app/components/bits";
import { actionsColumn, type Column, DataTable } from "@/app/components/data-table";
import { Form, useAppForm, validate } from "@/app/components/form";
import { FileUpload, type UploadedFile } from "@/app/components/inputs";
import { RowActions } from "@/app/components/row-actions";
import { useSession } from "@/app/session";
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
import { del, post, useAction, usePaged } from "@/lib/api";
import { date } from "@/lib/format";
import { documentSchema } from "@/lib/schemas";
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
  const columns = useMemo(() => docColumns(isAdmin), [isAdmin]);

  return (
    <>
      <PageHeader
        title="Dokümanlar"
        description="Site yönetmeliği, toplantı tutanakları, sözleşmeler ve projeler. Tüm sakinler görüntüleyebilir."
        actions={isAdmin && <UploadDialog />}
      />

      <DataTable
        columns={columns}
        rows={documents.items}
        paging={documents}
        empty={<EmptyState icon={FileText} title="Henüz doküman yüklenmedi" />}
      />
    </>
  );
}

const docColumns = (isAdmin: boolean): Column<Doc>[] => [
  {
    accessorKey: "title",
    header: "Başlık",
    cell: ({ row }) => (
      <>
        <div className="font-medium">{row.original.title}</div>
        <div className="text-muted-foreground text-xs">
          {row.original.fileName} · {size(row.original.sizeBytes)}
        </div>
      </>
    ),
  },
  {
    accessorKey: "category",
    header: "Kategori",
    cell: ({ row }) => (
      <Badge variant="secondary">{CATEGORIES[row.original.category]}</Badge>
    ),
  },
  {
    accessorKey: "uploaderName",
    header: "Yükleyen",
    cell: ({ row }) => (
      <span className="text-muted-foreground text-sm">
        {row.original.uploaderName ?? "—"}
      </span>
    ),
  },
  {
    accessorKey: "createdAt",
    header: "Tarih",
    cell: ({ row }) => (
      <span className="text-muted-foreground text-sm">{date(row.original.createdAt)}</span>
    ),
  },
  actionsColumn<Doc>(({ row }) => <DocActions doc={row.original} isAdmin={isAdmin} />),
];

function DocActions({ doc, isAdmin }: { doc: Doc; isAdmin: boolean }) {
  const remove = useAction(() => del(`/documents/${doc.id}`), {
    invalidate: ["/documents"],
    success: "Doküman silindi",
  });

  return (
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
  );
}

function UploadDialog() {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<UploadedFile | null>(null);

  const create = useAction(
    (value: { title: string; category: string }) =>
      post("/documents", {
        ...value,
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
        form.reset();
      },
    },
  );

  const form = useAppForm({
    defaultValues: { title: "", category: "yonetmelik" },
    ...validate(documentSchema),
    onSubmit: ({ value }) => create.mutateAsync(value),
  });

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
        <Form form={form} className="grid gap-4">
          <form.AppField name="title">
            {(f) => <f.TextField label="Başlık" />}
          </form.AppField>
          <form.AppField name="category">
            {(f) => (
              <f.SelectField
                label="Kategori"
                options={Object.entries(CATEGORIES).map(([value, label]) => ({
                  value,
                  label,
                }))}
              />
            )}
          </form.AppField>
          <Field label="Dosya">
            <FileUpload
              folder="dokumanlar"
              value={file}
              onChange={setFile}
              accept="application/pdf,image/*,.docx,.xlsx"
            />
          </Field>
          <DialogActions>
            <form.AppForm>
              <form.Submit disabled={!file}>Kaydet</form.Submit>
            </form.AppForm>
          </DialogActions>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
