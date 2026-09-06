/**
 * Tarayıcı tarafı güvenlik başlıkları.
 *
 * Uygulama tapu, kimlik ve borç bilgisi taşıdığı için varsayılan tarayıcı
 * davranışına güvenilmez: sayfa çerçevelenemez, MIME türü tahmin edilemez,
 * yalnızca izin verilen kaynaklardan betik yüklenebilir.
 */

/** Yalnızca ödeme sağlayıcılarının 3D Secure çerçevesine izin verilir. */
const PAYMENT_FRAMES = [
  "https://www.paytr.com",
  "https://sandbox-api.iyzipay.com",
  "https://api.iyzipay.com",
].join(" ");

const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "script-src 'self'",
  // Tailwind ve grafik bileşenleri satır içi stil üretir; yazı tipi Google Fonts.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self'",
  `frame-src ${PAYMENT_FRAMES}`,
  `form-action 'self' ${PAYMENT_FRAMES}`,
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": CSP,
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
};

/** Başlıkları yanıta ekler. Var olan bir başlık ezilmez. */
export function withSecurityHeaders(response: Response): Response {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!response.headers.has(name)) response.headers.set(name, value);
  }
  return response;
}
