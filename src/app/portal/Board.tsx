import { Megaphone, MessageCircle, MessagesSquare, Pin, Plus, Send } from "lucide-react";
import { useState } from "react";
import { DialogActions, EmptyState, Field, PageHeader } from "@/app/components/bits";
import { Pager } from "@/app/components/pager";
import { RowActions } from "@/app/components/row-actions";
import { useSession } from "@/app/session";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { del, patch, post, useAction, useApi, usePaged } from "@/lib/api";
import { dateTime, initials } from "@/lib/format";
import type { Comment, Post } from "@/lib/types";

/**
 * Pano.
 *
 * Duyuru da bir gönderidir; farkı yönetim tarafından yazılması ve listenin
 * başına sabitlenebilmesidir. Ayrı bir "duyurular" ekranı, aynı içeriği ikiye
 * bölmekten başka bir işe yaramıyordu.
 */
export default function Board() {
  const { isAdmin } = useSession();
  const posts = usePaged<Post>("/posts");
  const [openId, setOpenId] = useState<string | null>(null);

  const all = posts.items ?? [];
  const pinned = all.filter((p) => p.pinned);
  const rest = all.filter((p) => !p.pinned);

  const card = (post: Post) => (
    <PostCard
      key={post.id}
      post={post}
      isAdmin={isAdmin}
      open={openId === post.id}
      onToggle={() => setOpenId(openId === post.id ? null : post.id)}
    />
  );

  return (
    <>
      <PageHeader
        title="Pano"
        description={
          isAdmin
            ? "Duyurular ve site gündemi tek yerde. Duyuruyu sabitlerseniz listenin başında kalır."
            : "Yönetimin duyuruları ve site sakinlerinin gündemi. Herkes konu açabilir ve yorum yazabilir."
        }
        actions={<NewPostDialog isAdmin={isAdmin} />}
      />

      {all.length === 0 ? (
        <EmptyState
          icon={MessagesSquare}
          title="Pano boş"
          description={
            isAdmin ? "İlk duyuruyu ya da konuyu siz açın." : "İlk konuyu siz açın."
          }
        />
      ) : (
        <div className="grid gap-3">
          {pinned.map(card)}
          {pinned.length > 0 && rest.length > 0 && (
            <div className="mt-2 flex items-center gap-3 text-muted-foreground text-xs">
              <span className="h-px flex-1 bg-border" />
              Gündem
              <span className="h-px flex-1 bg-border" />
            </div>
          )}
          {rest.map(card)}
        </div>
      )}

      <Pager
        page={posts.page}
        size={posts.size}
        count={posts.items.length}
        hasMore={posts.hasMore}
        onChange={posts.setPage}
      />
    </>
  );
}

function PostCard({
  post,
  isAdmin,
  open,
  onToggle,
}: {
  post: Post;
  isAdmin: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const { me } = useSession();
  const thread = useApi<{ post: Post; comments: Comment[] }>(`/posts/${post.id}`, open);
  const [body, setBody] = useState("");

  const comment = useAction(() => post_(post.id, body), {
    invalidate: [`/posts/${post.id}`, "/posts"],
    onDone: () => setBody(""),
  });
  const remove = useAction(() => del(`/posts/${post.id}`), {
    invalidate: ["/posts"],
    success: "Gönderi silindi",
  });
  const pin = useAction(() => patch(`/posts/${post.id}/pin`, { pinned: !post.pinned }), {
    invalidate: ["/posts"],
    success: post.pinned ? "Sabitleme kaldırıldı" : "Panoya sabitlendi",
  });

  return (
    <Card className={post.pinned ? "border-primary/30 bg-primary/[0.03]" : undefined}>
      <CardContent>
        <div className="flex items-start gap-3">
          <Avatar className="size-8">
            <AvatarFallback className="text-xs">
              {post.kind === "announcement" ? (
                <Megaphone className="size-3.5" />
              ) : (
                initials(post.authorName)
              )}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <h2 className="flex flex-wrap items-center gap-2 font-medium">
              {post.title}
              {post.kind === "announcement" && <Badge variant="secondary">Duyuru</Badge>}
              {post.pinned && (
                <span className="flex items-center gap-1 text-muted-foreground text-xs">
                  <Pin className="size-3" /> Sabit
                </span>
              )}
            </h2>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{post.body}</p>
            <div className="mt-3 flex items-center gap-3 text-muted-foreground text-xs">
              <span>{post.authorName ?? "Ayrılmış üye"}</span>
              <span>{dateTime(post.createdAt)}</span>
              <button
                type="button"
                onClick={onToggle}
                className="flex items-center gap-1 hover:text-foreground"
              >
                <MessageCircle className="size-3.5" />
                {post.commentCount} yorum
              </button>
            </div>
          </div>
          <div className="shrink-0">
            {(post.authorId === me?.membershipId || isAdmin) && (
              <RowActions
                actions={[
                  ...(isAdmin
                    ? [
                        {
                          label: post.pinned ? "Sabitlemeyi kaldır" : "Panoya sabitle",
                          disabled: pin.isPending,
                          onSelect: () => pin.mutate(undefined),
                        },
                      ]
                    : []),
                  {
                    label: "Sil",
                    destructive: true,
                    disabled: remove.isPending,
                    onSelect: () => remove.mutate(undefined),
                    confirm: {
                      title:
                        post.kind === "announcement"
                          ? "Duyuru silinsin mi?"
                          : "Konu silinsin mi?",
                      description: `"${post.title}" ve altındaki bütün yorumlar kaldırılacak.`,
                      confirmLabel: "Sil",
                    },
                  },
                ]}
              />
            )}
          </div>
        </div>

        {open && (
          <div className="mt-4 space-y-3 border-t pt-4">
            {thread.data?.comments.map((item) => (
              <div key={item.id} className="flex gap-2.5">
                <Avatar className="size-7">
                  <AvatarFallback className="text-[10px]">
                    {initials(item.authorName)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1 rounded-lg bg-muted px-3 py-2">
                  <p className="text-xs">
                    <span className="font-medium">{item.authorName ?? "Ayrılmış üye"}</span>{" "}
                    <span className="text-muted-foreground">
                      {dateTime(item.createdAt)}
                    </span>
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm">{item.body}</p>
                </div>
              </div>
            ))}
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (body.trim()) comment.mutate(undefined);
              }}
            >
              <Input
                placeholder="Yorum yazın…"
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
              <Button
                type="submit"
                size="icon"
                aria-label="Gönder"
                disabled={comment.isPending}
              >
                <Send className="size-4" />
              </Button>
            </form>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const post_ = (postId: string, body: string) => post(`/posts/${postId}/comments`, { body });

function NewPostDialog({ isAdmin }: { isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const empty = { title: "", body: "", announcement: isAdmin, pinned: false };
  const [form, setForm] = useState(empty);

  const create = useAction(
    () =>
      post("/posts", {
        title: form.title,
        body: form.body,
        kind: form.announcement ? "announcement" : "topic",
        pinned: form.announcement && form.pinned,
      }),
    {
      invalidate: ["/posts"],
      success: form.announcement ? "Duyuru yayınlandı" : "Konu açıldı",
      onDone: () => {
        setOpen(false);
        setForm(empty);
      },
    },
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> {isAdmin ? "Panoya yaz" : "Konu aç"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{form.announcement ? "Yeni duyuru" : "Yeni konu"}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate(undefined);
          }}
        >
          <Field label="Başlık">
            <Input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </Field>
          <Field label="İçerik">
            <Textarea
              required
              rows={6}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
            />
          </Field>
          {isAdmin && (
            <div className="grid gap-2 rounded-lg border bg-muted/40 p-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--primary)]"
                  checked={form.announcement}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      announcement: e.target.checked,
                      pinned: e.target.checked && form.pinned,
                    })
                  }
                />
                Duyuru olarak yayınla
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--primary)]"
                  disabled={!form.announcement}
                  checked={form.pinned}
                  onChange={(e) => setForm({ ...form, pinned: e.target.checked })}
                />
                <span className={form.announcement ? "" : "text-muted-foreground"}>
                  Panonun başına sabitle
                </span>
              </label>
            </div>
          )}

          <DialogActions>
            <Button type="submit" disabled={create.isPending}>
              Yayınla
            </Button>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}
