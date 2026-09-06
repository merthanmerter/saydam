import { upload } from "@vercel/blob/client";
import { FileUp, Loader2, Paperclip, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { useSession } from "@/app/session";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { periodLabel } from "@/lib/format";

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

/** Dosyayı doğrudan Blob deposuna yükler; sunucu yalnızca jeton üretir. */
export async function uploadFile(siteId: string, folder: string, file: File) {
  const safeName = file.name.replace(/[^\w.-]+/g, "_").slice(-80);
  const blob = await upload(`sites/${siteId}/${folder}/${safeName}`, file, {
    access: "public",
    handleUploadUrl: "/api/blob/upload",
  });
  return { url: blob.url, name: file.name, size: file.size };
}

/** Dönem seçici: YYYYMM tamsayısı üretir. */
export function PeriodPicker({
  value,
  onChange,
  years = 6,
}: {
  value: number;
  onChange: (period: number) => void;
  years?: number;
}) {
  const thisYear = new Date().getFullYear();
  const options = Array.from({ length: years }, (_, i) => thisYear + 1 - i);
  const year = Math.floor(value / 100);
  const month = value % 100;

  return (
    <div className="flex gap-2">
      <Select value={String(month)} onValueChange={(m) => onChange(year * 100 + Number(m))}>
        <SelectTrigger className="w-[130px]" aria-label="Ay">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MONTHS.map((m) => (
            <SelectItem key={m} value={String(m)}>
              {periodLabel(2000 * 100 + m).split(" ")[0]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={String(year)} onValueChange={(y) => onChange(Number(y) * 100 + month)}>
        <SelectTrigger className="w-[100px]" aria-label="Yıl">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((y) => (
            <SelectItem key={y} value={String(y)}>
              {y}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export type UploadedFile = { url: string; name: string; size: number };

/** Dosyayı doğrudan Blob deposuna yükler ve sonucu üst bileşene verir. */
export function FileUpload({
  folder,
  value,
  onChange,
  accept = "application/pdf,image/*",
  label = "Dosya seç",
}: {
  folder: string;
  value: UploadedFile | null;
  onChange: (file: UploadedFile | null) => void;
  accept?: string;
  label?: string;
}) {
  const { me } = useSession();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const id = useId();

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
        <Paperclip className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{value.name}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Kaldır"
          onClick={() => onChange(null)}
        >
          <X className="size-4" />
        </Button>
      </div>
    );
  }

  return (
    <>
      <input
        id={id}
        ref={inputRef}
        type="file"
        // Gizli olduğu için erişilebilirlik ağacında görünmez; yine de
        // adlandırılmış olsun ki denetim araçları da temiz raporlasın.
        aria-label={label}
        accept={accept}
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file || !me) return;
          setBusy(true);
          try {
            onChange(await uploadFile(me.siteId, folder, file));
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Dosya yüklenemedi");
          } finally {
            setBusy(false);
            if (inputRef.current) inputRef.current.value = "";
          }
        }}
      />
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />}
        {busy ? "Yükleniyor…" : label}
      </Button>
    </>
  );
}
