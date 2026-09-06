import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Field } from "@/app/components/bits";
import AuthShell from "@/app/pages/AuthShell";
import { useSession } from "@/app/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { post, useAction } from "@/lib/api";

export default function Register() {
  const navigate = useNavigate();
  const { refetch } = useSession();
  const [form, setForm] = useState({
    siteName: "",
    city: "",
    address: "",
    adminName: "",
    adminEmail: "",
    password: "",
  });

  const set = (key: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm((previous) => ({ ...previous, [key]: event.target.value }));

  const register = useAction(() => post("/auth/register-site", form), {
    success: "Siteniz oluşturuldu",
    onDone: () => {
      refetch();
      navigate("/panel");
    },
  });

  return (
    <AuthShell
      title="Site yönetimi hesabı"
      description="Siteyi siz kurarsınız, sakinleri e-postalarıyla siz eklersiniz. Sakinler kendi başına kayıt olamaz."
      footer={
        <>
          Zaten hesabınız var mı?{" "}
          <Link to="/giris" className="font-medium text-foreground hover:underline">
            Giriş yapın
          </Link>
        </>
      }
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          register.mutate(undefined);
        }}
      >
        <Field label="Site adı">
          <Input required value={form.siteName} onChange={set("siteName")} />
        </Field>
        <Field label="Şehir">
          <Input value={form.city} onChange={set("city")} />
        </Field>
        <Field label="Adres">
          <Input value={form.address} onChange={set("address")} />
        </Field>

        <div className="mt-2 border-t pt-4">
          <p className="mb-3 font-medium text-sm">Yönetici hesabı</p>
          <div className="grid gap-4">
            <Field label="Ad soyad">
              <Input required value={form.adminName} onChange={set("adminName")} />
            </Field>
            <Field label="E-posta">
              <Input
                type="email"
                required
                value={form.adminEmail}
                onChange={set("adminEmail")}
              />
            </Field>
            <Field label="Şifre" hint="En az 8 karakter">
              <Input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={form.password}
                onChange={set("password")}
              />
            </Field>
          </div>
        </div>

        <Button type="submit" disabled={register.isPending} className="mt-1">
          {register.isPending ? "Oluşturuluyor…" : "Siteyi oluştur"}
        </Button>
      </form>
    </AuthShell>
  );
}
