import type { StandardSchemaV1 } from "@standard-schema/spec";
import {
  createFormHook,
  createFormHookContexts,
  revalidateLogic,
} from "@tanstack/react-form";
import type { ComponentProps, ReactNode } from "react";
import { AmountInput, Field } from "@/app/components/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toCents } from "@/lib/format";

/**
 * Form köprüsü.
 *
 * Alanlar `useAppForm` üzerinden bağlanır; her alan kendi değerini, dokunulma
 * durumunu ve hatasını buradan alır. Kazanç doğrulamada: şema istemcide de
 * çalıştığı için kullanıcı hatayı sunucuya gidip dönmeden, alanın hemen
 * altında görür. Sunucu tarafı doğrulama yerinde duruyor — istemcideki
 * yalnızca daha erken bir uyarı, güvenlik sınırı değil.
 *
 * Hata yalnızca alana dokunulduktan sonra gösterilir: boş bir formu açar
 * açmaz her satırın kırmızıya dönmesi yardım değil, gürültüdür.
 */
const { fieldContext, formContext, useFieldContext, useFormContext } =
  createFormHookContexts();

/** Gösterilecek ilk hata; dokunulmadıysa yok. */
const useFieldError = (meta: { isTouched: boolean; errors: unknown[] }) => {
  if (!meta.isTouched) return undefined;
  const first = meta.errors[0] as { message?: string } | string | undefined;
  return typeof first === "string" ? first : first?.message;
};

function TextField({
  label,
  hint,
  ...props
}: { label: string; hint?: string } & ComponentProps<typeof Input>) {
  const field = useFieldContext<string>();
  return (
    <Field label={label} hint={hint} error={useFieldError(field.state.meta)}>
      <Input
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={(event) => field.handleChange(event.target.value)}
        {...props}
      />
    </Field>
  );
}

function TextAreaField({
  label,
  hint,
  ...props
}: { label: string; hint?: string } & ComponentProps<typeof Textarea>) {
  const field = useFieldContext<string>();
  return (
    <Field label={label} hint={hint} error={useFieldError(field.state.meta)}>
      <Textarea
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={(event) => field.handleChange(event.target.value)}
        {...props}
      />
    </Field>
  );
}

/** Kullanıcı TL yazar, alan kuruş tutar. */
function MoneyField({ label, hint }: { label: string; hint?: string }) {
  const field = useFieldContext<string>();
  const cents = toCents(field.state.value);
  return (
    <Field
      label={label}
      hint={hint}
      error={
        useFieldError(field.state.meta) ?? (cents < 0 ? "Tutar negatif olamaz" : undefined)
      }
    >
      <AmountInput
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={(event) => field.handleChange(event.target.value)}
      />
    </Field>
  );
}

/** Radix `Select` kendi DOM'unu ürettiği için sarmalayıcı çocuk olarak alınır. */
function ChoiceField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: (value: string, onChange: (next: string) => void) => ReactNode;
}) {
  const field = useFieldContext<string>();
  return (
    <Field label={label} hint={hint} error={useFieldError(field.state.meta)}>
      {children(field.state.value, field.handleChange)}
    </Field>
  );
}

/**
 * Gönder düğmesi.
 *
 * Yalnızca gönderim sürerken kapanır, form geçersiz diye değil: açıklamasız
 * kilitli bir düğme kullanıcıya neyin eksik olduğunu söylemez. Tıklayınca
 * doğrulama çalışır, eksik alanlar kendi altlarında işaretlenir.
 */
function Submit({ children, ...props }: ComponentProps<typeof Button>) {
  const form = useFormContext();
  return (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(isSubmitting) => (
        <Button type="submit" disabled={isSubmitting} {...props}>
          {children}
        </Button>
      )}
    </form.Subscribe>
  );
}

export const { useAppForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: { TextField, TextAreaField, MoneyField, ChoiceField },
  formComponents: { Submit },
});

/**
 * Şema doğrulaması: gönderimde başla, sonra yazdıkça sürdür.
 *
 * Form ilk açıldığında hiçbir alan kırmızı değil; bir kez uyarı verildikten
 * sonra düzeltilen alan anında temizleniyor. Her formda aynı davranış olsun
 * diye tek yerde.
 *
 *   const form = useAppForm({ defaultValues, ...validate(schema), onSubmit });
 */
export const validate = <TSchema extends StandardSchemaV1>(schema: TSchema) =>
  ({ validationLogic: revalidateLogic(), validators: { onDynamic: schema } }) as const;

/**
 * Form etiketi.
 *
 * `noValidate` şart: tarayıcının kendi doğrulaması (`type="email"`, `required`)
 * gönderimi bizim şemamız çalışmadan kesiyor ve kullanıcı, alanın altındaki
 * açıklayıcı uyarı yerine dile bile uymayan bir baloncuk görüyor. Doğrulama
 * tek elden, şemadan.
 */
export function Form({
  form,
  className,
  children,
}: {
  form: { handleSubmit: () => unknown };
  className?: string;
  children: ReactNode;
}) {
  return (
    <form
      noValidate
      className={className}
      onSubmit={(event) => {
        event.preventDefault();
        form.handleSubmit();
      }}
    >
      {children}
    </form>
  );
}
