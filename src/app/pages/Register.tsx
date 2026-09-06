import { Link, useNavigate } from "@tanstack/react-router";
import { Form, useAppForm, validate } from "@/app/components/form";
import AuthShell from "@/app/pages/AuthShell";
import { useSession } from "@/app/session";
import { post, useAction } from "@/lib/api";
import { registerSchema } from "@/lib/schemas";

export default function Register() {
  const navigate = useNavigate();
  const { refetch } = useSession();

  const register = useAction((input: unknown) => post("/auth/register-site", input), {
    success: "Siteniz oluşturuldu",
    onDone: () => {
      refetch();
      navigate({ to: "/panel" });
    },
  });

  const form = useAppForm({
    defaultValues: {
      siteName: "",
      city: "",
      address: "",
      adminName: "",
      adminEmail: "",
      password: "",
    },
    ...validate(registerSchema),
    onSubmit: ({ value }) => register.mutateAsync(value),
  });

  return (
    <AuthShell
      title="Site yönetimi hesabı"
      description="Siteyi siz kurarsınız, sakinleri e-postalarıyla siz eklersiniz. Sakinler kendi başına kayıt olamaz."
      footer={
        <>
          Zaten hesabınız var mı?{" "}
          <Link
            to="/giris"
            search={{}}
            className="font-medium text-foreground hover:underline"
          >
            Giriş yapın
          </Link>
        </>
      }
    >
      <Form form={form} className="grid gap-4">
        <form.AppField name="siteName">
          {(field) => <field.TextField label="Site adı" />}
        </form.AppField>
        <form.AppField name="city">{(f) => <f.TextField label="Şehir" />}</form.AppField>
        <form.AppField name="address">{(f) => <f.TextField label="Adres" />}</form.AppField>

        <div className="mt-2 border-t pt-4">
          <p className="mb-3 font-medium text-sm">Yönetici hesabı</p>
          <div className="grid gap-4">
            <form.AppField name="adminName">
              {(f) => <f.TextField label="Ad soyad" />}
            </form.AppField>
            <form.AppField name="adminEmail">
              {(f) => <f.TextField label="E-posta" type="email" />}
            </form.AppField>
            <form.AppField name="password">
              {(f) => (
                <f.TextField
                  label="Şifre"
                  hint="En az 8 karakter"
                  type="password"
                  autoComplete="new-password"
                />
              )}
            </form.AppField>
          </div>
        </div>

        <form.AppForm>
          <form.Submit className="mt-1">
            {register.isPending ? "Oluşturuluyor…" : "Siteyi oluştur"}
          </form.Submit>
        </form.AppForm>
      </Form>
    </AuthShell>
  );
}
