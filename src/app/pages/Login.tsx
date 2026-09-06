import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Field } from "@/app/components/bits";
import { type SiteOption, SitePicker } from "@/app/components/site-picker";
import AuthShell from "@/app/pages/AuthShell";
import { loginRoute } from "@/app/router";
import { useSession } from "@/app/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { post, useAction } from "@/lib/api";

export default function Login() {
  const navigate = useNavigate();
  // Koruma, gidilmek istenen yolu buraya taşıdı: giriş yapınca kullanıcı
  // panele değil, tıkladığı sayfaya döner.
  const { from } = loginRoute.useSearch();
  const { me, refetch } = useSession();
  const [site, setSite] = useState<SiteOption | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

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
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (site) login.mutate({ siteId: site.id, email, password });
        }}
      >
        <Field label="Site">
          <SitePicker value={site} onChange={setSite} />
        </Field>

        <Field label="E-posta">
          <Input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>

        <Field label="Şifre">
          <Input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        <Button type="submit" disabled={!site || login.isPending} className="mt-1">
          {login.isPending ? "Giriş yapılıyor…" : "Giriş yap"}
        </Button>
        <p className="text-center text-muted-foreground text-xs">
          Şifrenizi bilmiyorsanız site yönetiminden sıfırlama isteyin.
        </p>
      </form>
    </AuthShell>
  );
}
