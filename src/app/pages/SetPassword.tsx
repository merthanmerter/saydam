import { useNavigate } from "@tanstack/react-router";
import { Form, useAppForm, validate } from "@/app/components/form";
import AuthShell from "@/app/pages/AuthShell";
import { setPasswordRoute } from "@/app/router";
import { useSession } from "@/app/session";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { post, useAction, useApi } from "@/lib/api";
import { setPasswordSchema } from "@/lib/schemas";

export default function SetPassword() {
  const { token } = setPasswordRoute.useParams();
  const navigate = useNavigate();
  const { refetch } = useSession();

  const invite = useApi<{ siteName: string; email: string; fullName: string }>(
    `/auth/invite/${token}`,
  );

  const submit = useAction(
    (password: string) => post("/auth/setup-password", { token, password }),
    {
      success: "Şifreniz belirlendi",
      onDone: () => {
        refetch();
        navigate({ to: "/panel" });
      },
    },
  );

  const form = useAppForm({
    defaultValues: { password: "", repeat: "" },
    ...validate(setPasswordSchema),
    onSubmit: ({ value }) => submit.mutateAsync(value.password),
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

  return (
    <AuthShell
      title="Şifrenizi belirleyin"
      description={`${invite.data?.siteName} · ${invite.data?.email}`}
    >
      <Form form={form} className="grid gap-4">
        <form.AppField name="password">
          {(f) => (
            <f.TextField
              label="Yeni şifre"
              hint="En az 8 karakter"
              type="password"
              autoComplete="new-password"
            />
          )}
        </form.AppField>
        <form.AppField name="repeat">
          {(f) => (
            <f.TextField
              label="Yeni şifre (tekrar)"
              type="password"
              autoComplete="new-password"
            />
          )}
        </form.AppField>
        <form.AppForm>
          <form.Submit>Şifreyi kaydet ve giriş yap</form.Submit>
        </form.AppForm>
      </Form>
    </AuthShell>
  );
}
