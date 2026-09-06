import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Field } from "@/app/components/bits";
import AuthShell from "@/app/pages/AuthShell";
import { setPasswordRoute } from "@/app/router";
import { useSession } from "@/app/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { post, useAction, useApi } from "@/lib/api";

export default function SetPassword() {
  const { token } = setPasswordRoute.useParams();
  const navigate = useNavigate();
  const { refetch } = useSession();
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");

  const invite = useApi<{ siteName: string; email: string; fullName: string }>(
    `/auth/invite/${token}`,
  );

  const submit = useAction(() => post("/auth/setup-password", { token, password }), {
    success: "Şifreniz belirlendi",
    onDone: () => {
      refetch();
      navigate({ to: "/panel" });
    },
  });

  if (invite.isPending) {
    return (
      <AuthShell title="Bağlantı doğrulanıyor…">
        <div className="grid gap-4">
          {[0, 1].map((row) => (
            <div key={row} className="space-y-1.5">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-9 w-full rounded-md" />
            </div>
          ))}
          <Skeleton className="h-9 w-full rounded-md" />
        </div>
      </AuthShell>
    );
  }

  if (invite.isError) {
    return (
      <AuthShell
        title="Bağlantı geçersiz"
        description="Davet bağlantısının süresi dolmuş ya da daha önce kullanılmış. Site yönetiminden yeni bir bağlantı isteyin."
      >
        <Button className="w-full" onClick={() => navigate({ to: "/giris", search: {} })}>
          Giriş sayfasına dön
        </Button>
      </AuthShell>
    );
  }

  const mismatch = repeat.length > 0 && password !== repeat;

  return (
    <AuthShell
      title="Şifrenizi belirleyin"
      description={`${invite.data?.siteName} · ${invite.data?.email}`}
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!mismatch) submit.mutate(undefined);
        }}
      >
        <Field label="Yeni şifre" hint="En az 8 karakter">
          <Input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field label="Yeni şifre (tekrar)">
          <Input
            type="password"
            required
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            aria-invalid={mismatch}
          />
        </Field>
        {mismatch && <p className="text-destructive text-xs">Şifreler eşleşmiyor</p>}
        <Button type="submit" disabled={submit.isPending || mismatch}>
          Şifreyi kaydet ve giriş yap
        </Button>
      </form>
    </AuthShell>
  );
}
