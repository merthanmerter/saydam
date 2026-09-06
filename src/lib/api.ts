import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { VIEW_HEADER, view } from "./store";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: { field: string; message: string }[],
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { ...(init?.headers as object) };
  if (init?.body) headers["content-type"] = "application/json";
  if (view.get() === "resident") headers[VIEW_HEADER] = "resident";

  const response = await fetch(`/api${path}`, {
    credentials: "same-origin",
    ...init,
    headers,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      payload?.error ?? "Beklenmeyen bir hata oluştu",
      response.status,
      payload?.details,
    );
  }
  return payload as T;
}

const send =
  (method: string) =>
  <T>(path: string, body?: unknown) =>
    api<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

export const post = send("POST");
export const patch = send("PATCH");
export const put = send("PUT");
export const del = send("DELETE");

/** GET sorgusu — anahtar doğrudan yol olduğu için invalidasyon öngörülebilir. */
export const query = <T>(path: string) =>
  queryOptions({ queryKey: [path], queryFn: () => api<T>(path) });

/**
 * Koşullu ya da sayfa düzeyinde olmayan sorgular için. Veri gelene kadar
 * `data` tanımsızdır; çağıran taraf bunu kendi ele alır.
 */
export function useApi<T>(path: string, enabled = true) {
  return useQuery({ ...query<T>(path), enabled });
}

/**
 * Sayfa düzeyindeki veriler için. Veri hazır olana kadar bileşen askıya alınır
 * ve en yakın `Suspense` sınırı devreye girer; böylece yükleme durumu
 * zamanlayıcıyla tahmin edilmez, React'in kendi bildiği gerçek durumdur.
 * `data` her zaman doludur.
 *
 * Yol değiştiğinde (dönem, yıl, sayfa numarası) çağıran taraf `useTransition`
 * kullanmalı: geçiş içindeki bir güncelleme askıya alındığında React önceki
 * içeriği ekranda tutar, yoksa her tıklamada bütün sayfa iskelete döner.
 * İskelet yalnızca elde hiç veri yokken, yani ilk açılışta görünmeli.
 */
export function useSuspenseApi<T>(path: string) {
  return useSuspenseQuery(query<T>(path));
}

/**
 * Mutasyon + otomatik cache tazeleme + hata bildirimi.
 * `invalidate` ile hangi yolların yenileneceği belirtilir (önek eşleşmesi).
 */
export function useAction<TInput, TResult>(
  fn: (input: TInput) => Promise<TResult>,
  options: { invalidate?: string[]; success?: string; onDone?: (r: TResult) => void } = {},
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (result) => {
      for (const prefix of options.invalidate ?? []) {
        client.invalidateQueries({
          predicate: (q) => String(q.queryKey[0] ?? "").startsWith(prefix),
        });
      }
      if (options.success) toast.success(options.success);
      options.onDone?.(result);
    },
    onError: (error: Error) => {
      const detail = error instanceof ApiError ? error.details?.[0]?.message : undefined;
      toast.error(detail ? `${error.message}: ${detail}` : error.message);
    },
  });
}

/**
 * Sunucudan gelen sayfa zarfı. Toplam satır sayısı yok: onu üretmek her
 * istekte tüm tablonun taranması demekti. `hasMore`, sunucunun bir fazla satır
 * çekerek anladığı "devamı var" bilgisi.
 */
export type Paged<T> = { items: T[]; page: number; size: number; hasMore: boolean };

export const PAGE_SIZE = 25;

/**
 * Sayfalı bir listenin sorgu yolu.
 *
 * Hem `usePaged` hem de yönlendiricinin loader'ı bunu kullanır: iki taraf
 * birebir aynı dizeyi üretmezse loader'ın doldurduğu önbellek ıskalanır ve
 * aynı veri iki kez istenir.
 */
export const pagedPath = (path: string, page = 1, size = PAGE_SIZE) =>
  `${path}${path.includes("?") ? "&" : "?"}page=${page}&size=${size}`;

/**
 * Sayfalı liste. Sayfa numarasını tutar ve yolu ona göre kurar; veri
 * `useSuspenseApi` üzerinden geldiği için yükleme durumu yine iskeletle
 * karşılanır. Sayfa değiştiğinde sorgu anahtarı da değiştiğinden önceki
 * sayfa önbellekte kalır, geri dönmek anında olur.
 */
export function usePaged<T, Extra = unknown>(path: string, size = PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const [pending, startTransition] = useTransition();
  const { data } = useSuspenseApi<Paged<T> & Extra>(pagedPath(path, page, size));
  return {
    // Zarfın yanındaki alanlar (ör. `debtVisibility`) olduğu gibi geçer.
    ...data,
    page,
    size,
    /** Geçiş içinde: sonraki sayfa gelene kadar mevcut liste ekranda kalır. */
    setPage: (next: number) => startTransition(() => setPage(next)),
    pending,
  };
}
