import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Field } from "@/app/components/bits";
import { Form, useAppForm, validate } from "@/app/components/form";
import { type SiteOption, SitePicker } from "@/app/components/site-picker";
import AuthShell from "@/app/pages/AuthShell";
import { loginRoute } from "@/app/router";
import { useSession } from "@/app/session";
import { post, useAction } from "@/lib/api";
import { loginSchema } from "@/lib/schemas";

export default function Login() {
  const navigate = useNavigate();
  // Koruma, gidilmek istenen yolu buraya taşıdı: giriş yapınca kullanıcı
  // panele değil, tıkladığı sayfaya döner.
  const { from } = loginRoute.useSearch();
  const { me, refetch } = useSession();
  const [site, setSite] = useState<SiteOption | null>(null);

  const go = useCallback(
    (replace = false) => navigate({ to: from ?? "/panel", replace }),
    [navigate, from],
  );

  useEffect(() => {
    if (me) go(true);
  }, [me, go]);

  const login = useAction(
    (input: { siteId: string; email: string; password: string }) =>
      post("/auth/login", input),
    {
      invalidate: ["/"],
      onDone: () => {
        refetch();
        go();
      },
    },
  );

  const form = useAppForm({
    defaultValues: { email: "", password: "" },
    ...validate(loginSchema),
    onSubmit: ({ value }) => site && login.mutateAsync({ siteId: site.id, ...value }),
  });

  return (
    <AuthShell
      title="Portala giriş"
      description="Önce sitenizi seçin. Aynı e-posta birden fazla sitede kayıtlı olabilir; her sitenin şifresi ayrıdır."
      footer={
        <>
          Site yönetimi misiniz?{" "}
          <Link to="/kayit" className="font-medium text-foreground hover:underline">
            Sitenizi kurun
          </Link>
        </>
      }
    >
      <Form form={form} className="grid gap-4">
        <Field label="Site">
          <SitePicker value={site} onChange={setSite} />
        </Field>
        <form.AppField name="email">
          {(f) => <f.TextField label="E-posta" type="email" autoComplete="username" />}
        </form.AppField>
        <form.AppField name="password">
          {(f) => (
            <f.TextField label="Şifre" type="password" autoComplete="current-password" />
          )}
        </form.AppField>
        <form.AppForm>
          <form.Submit disabled={!site}>
            {site ? "Giriş yap" : "Önce sitenizi seçin"}
          </form.Submit>
        </form.AppForm>
      </Form>
    </AuthShell>
  );
}
