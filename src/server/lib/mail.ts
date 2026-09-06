import { Resend } from "resend";
import { env } from "../env.ts";

const resend = env.resendApiKey ? new Resend(env.resendApiKey) : null;

type MailResult = { delivered: boolean; reason?: string };

/**
 * RESEND_API_KEY tanımlı değilse hata fırlatmaz: gönderim "delivered:false"
 * döner ve çağıran taraf bağlantıyı yöneticiye kopyalatır. Self-host kurulumun
 * mail servisi olmadan da çalışması için.
 */
export async function sendMail(
  to: string,
  subject: string,
  html: string,
): Promise<MailResult> {
  if (!resend) {
    console.info(`[mail devre dışı] ${to} — ${subject}`);
    return { delivered: false, reason: "RESEND_API_KEY tanımlı değil" };
  }
  const { error } = await resend.emails.send({
    from: env.mailFrom,
    to,
    subject,
    html,
  });
  if (error) {
    console.error("Mail gönderilemedi:", error);
    return { delivered: false, reason: error.message };
  }
  return { delivered: true };
}

const layout = (title: string, body: string, cta?: { href: string; label: string }) => `
<div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#1c2128">
  <div style="font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#5b6472">say-dam</div>
  <h1 style="font-size:20px;margin:12px 0 16px">${title}</h1>
  <div style="font-size:15px;line-height:1.6;color:#39414d">${body}</div>
  ${
    cta
      ? `<p style="margin:28px 0"><a href="${cta.href}" style="background:#2f5fd0;color:#fff;text-decoration:none;padding:11px 20px;border-radius:10px;display:inline-block;font-weight:600">${cta.label}</a></p>
         <p style="font-size:12px;color:#7a8390;word-break:break-all">${cta.href}</p>`
      : ""
  }
</div>`;

export const inviteMail = (siteName: string, link: string) => ({
  subject: `${siteName} — site portalına davet edildiniz`,
  html: layout(
    `${siteName} yönetimi sizi portala ekledi`,
    `Aidatlarınızı, site giderlerini ve duyuruları takip edebilmek için aşağıdaki bağlantıdan şifrenizi belirleyin. Bağlantı 3 gün geçerlidir.`,
    { href: link, label: "Şifremi belirle" },
  ),
});

export const resetMail = (siteName: string, link: string) => ({
  subject: `${siteName} — şifre sıfırlama`,
  html: layout(
    "Şifrenizi sıfırlayın",
    `${siteName} yönetimi hesabınız için şifre sıfırlama başlattı. Bağlantı 3 gün geçerlidir; siz talep etmediyseniz bu e-postayı yok sayabilirsiniz.`,
    { href: link, label: "Yeni şifre belirle" },
  ),
});
