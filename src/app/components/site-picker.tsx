import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Loader2, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export type SiteOption = { id: string; name: string; city: string };

/** Yazma durduktan sonra sunucuya gitmek için kısa bekleme. */
function useDebounced<T>(value: T, ms = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/**
 * Site seçici. Arama sunucuda yapılır ve sonuç 20 ile sınırlıdır; bütün
 * siteleri istemciye indirmek site sayısı büyüdükçe hem yanıtı hem açılır
 * listeyi kullanılamaz hâle getirirdi.
 */
export function SitePicker({
  value,
  onChange,
}: {
  value: SiteOption | null;
  onChange: (site: SiteOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const query = useDebounced(term);

  const { data, isFetching } = useQuery({
    queryKey: ["/sites", query],
    queryFn: () => api<{ sites: SiteOption[] }>(`/sites?q=${encodeURIComponent(query)}`),
    enabled: open,
    placeholderData: (previous) => previous,
    staleTime: 30_000,
  });

  const sites = data?.sites ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between border-input font-normal hover:border-input-strong"
        >
          {value ? (
            <span className="truncate">
              {value.name}
              {value.city && <span className="text-muted-foreground"> · {value.city}</span>}
            </span>
          ) : (
            <span className="text-muted-foreground">Sitenizi arayın</span>
          )}
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
        {/* Süzme sunucuda yapıldığı için cmdk'nin istemci süzgeci kapatılır. */}
        <Command shouldFilter={false}>
          <div className="relative">
            <CommandInput
              placeholder="Site adı ya da şehir…"
              value={term}
              onValueChange={setTerm}
            />
            {isFetching && (
              <Loader2 className="absolute top-3 right-3 size-4 animate-spin text-muted-foreground" />
            )}
          </div>
          <CommandList>
            <CommandEmpty>{isFetching ? "Aranıyor…" : "Eşleşen site yok."}</CommandEmpty>
            <CommandGroup>
              {sites.map((site) => (
                <CommandItem
                  key={site.id}
                  value={site.id}
                  onSelect={() => {
                    onChange(site);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "size-4",
                      value?.id === site.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="truncate">{site.name}</span>
                  {site.city && (
                    <span className="ml-auto shrink-0 text-muted-foreground text-xs">
                      {site.city}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
            {sites.length === 20 && (
              <p className="flex items-center gap-1.5 border-t px-3 py-2 text-muted-foreground text-xs">
                <Search className="size-3" />
                İlk 20 sonuç gösteriliyor, aramayı daraltın.
              </p>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
