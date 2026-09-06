import { Send, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PageHeader } from "@/app/components/bits";
import { useSession } from "@/app/session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type Paged, post, useAction, useApi, useSuspenseApi } from "@/lib/api";
import { dateTime, initials } from "@/lib/format";
import type { Conversation, Message, Peer } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function Messages() {
  const { me } = useSession();
  const inbox = useSuspenseApi<{
    conversations: Conversation[];
    peers: Peer[];
    unread: number;
  }>("/messages");
  const [peer, setPeer] = useState<string | null>(null);
  const thread = useApi<Paged<Message>>(`/messages/${peer}`, Boolean(peer));
  const [body, setBody] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: yeni mesajda alta kaydır
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [thread.data?.items.length]);

  const send = useAction(() => post("/messages", { recipientId: peer, body }), {
    invalidate: ["/messages"],
    onDone: () => setBody(""),
  });

  const peers = inbox.data?.peers ?? [];
  const conversations = inbox.data?.conversations ?? [];
  const peerName = peers.find((p) => p.id === peer)?.fullName;

  /**
   * Okundu işaretini ayrı bir uçla yapıp konuşma listesini tazeleriz; aksi
   * hâlde kenar çubuğundaki sayaç sayfa yenilenene kadar eski kalıyordu.
   */
  const markRead = useAction((peerId: string) => post(`/messages/${peerId}/read`), {
    invalidate: ["/messages"],
  });
  const markReadRef = useRef(markRead.mutate);
  markReadRef.current = markRead.mutate;

  const unreadForPeer = conversations.find((c) => c.peer === peer)?.unreadCount ?? 0;
  useEffect(() => {
    if (peer && unreadForPeer > 0) markReadRef.current(peer);
  }, [peer, unreadForPeer]);

  return (
    <>
      <PageHeader
        title="Mesajlar"
        description="Yönetimle ya da diğer sakinlerle birebir yazışın."
      />

      {/* Yükseklik iskeletle birebir aynı olmalı — route-skeleton.tsx "mesajlar". */}
      <Card className="grid h-[calc(100vh-10rem)] overflow-hidden py-0 md:grid-cols-[260px_1fr]">
        <div className="flex min-h-0 flex-col border-b md:border-r md:border-b-0">
          <div className="border-b p-3">
            <Select value={peer ?? ""} onValueChange={setPeer}>
              <SelectTrigger className="w-full" aria-label="Kişi seç">
                <SelectValue placeholder="Kişi seçip yazın" />
              </SelectTrigger>
              <SelectContent>
                {peers.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.fullName}
                    {option.role === "admin" ? " · Yönetim" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {conversations.map((conversation) => (
              <button
                type="button"
                key={conversation.peer}
                onClick={() => setPeer(conversation.peer)}
                className={cn(
                  "flex w-full items-start gap-2 border-b px-3 py-2.5 text-left transition-colors hover:bg-muted/60",
                  peer === conversation.peer && "bg-muted",
                )}
              >
                <div className="grid size-7 shrink-0 place-items-center rounded-full bg-secondary text-[10px] font-medium">
                  {initials(conversation.peerName)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-medium text-sm">
                      {conversation.peerName}
                    </span>
                    {conversation.peerRole === "admin" && (
                      <ShieldCheck className="size-3 shrink-0 text-primary" />
                    )}
                  </div>
                  <p className="truncate text-muted-foreground text-xs">
                    {conversation.body}
                  </p>
                </div>
                {conversation.unreadCount > 0 && (
                  <Badge className="h-5 min-w-5 shrink-0 px-1.5 text-[11px]">
                    {conversation.unreadCount}
                  </Badge>
                )}
              </button>
            ))}
            {conversations.length === 0 && (
              <p className="p-4 text-muted-foreground text-sm">Henüz yazışma yok.</p>
            )}
          </div>
        </div>

        <div className="flex min-h-0 flex-col">
          {peer ? (
            <>
              <div className="border-b px-4 py-3 font-medium text-sm">{peerName}</div>
              <div className="flex-1 space-y-2 overflow-y-auto p-4">
                {thread.data?.items.map((message) => {
                  const mine = message.senderId === me?.membershipId;
                  return (
                    <div
                      key={message.id}
                      className={cn("flex", mine ? "justify-end" : "justify-start")}
                    >
                      <div
                        className={cn(
                          "max-w-[75%] rounded-2xl px-3.5 py-2 text-sm",
                          mine
                            ? "rounded-br-sm bg-primary text-primary-foreground"
                            : "rounded-bl-sm bg-muted",
                        )}
                      >
                        <p className="whitespace-pre-wrap">{message.body}</p>
                        <p
                          className={cn(
                            "mt-1 text-[10px]",
                            mine ? "text-primary-foreground/70" : "text-muted-foreground",
                          )}
                        >
                          {dateTime(message.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>
              <form
                className="flex gap-2 border-t p-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (body.trim()) send.mutate(undefined);
                }}
              >
                <Input
                  placeholder="Mesaj yazın…"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
                <Button
                  type="submit"
                  size="icon"
                  aria-label="Gönder"
                  disabled={send.isPending}
                >
                  <Send className="size-4" />
                </Button>
              </form>
            </>
          ) : (
            <div className="grid flex-1 place-items-center p-8 text-center text-muted-foreground text-sm">
              Soldan bir kişi seçin ya da yukarıdan yeni bir yazışma başlatın.
            </div>
          )}
        </div>
      </Card>
    </>
  );
}
