/**
 * Bağımlılıkları en son sürüme çeker ve ardından projeyi doğrular.
 *
 * Sürüm çözümlemesini Bun yapıyor (`bun outdated`, `bun update --latest`);
 * buradaki tek katkı, güncellemenin ardından tip denetimi, testler ve
 * derlemenin gerçekten geçtiğini görmek. "Latest" semver aralığını yok sayar,
 * yani ana sürüm atlamaları da gelir — kırılan bir şey varsa burada çıkar.
 *
 * Kullanım:
 *   bun run update:deps         güncelle ve doğrula
 *   bun run update:deps --dry   yalnızca neyin eskidiğini göster
 */
const dry = process.argv.includes("--dry");

await Bun.$`bun outdated`;
if (dry) process.exit(0);

await Bun.$`bun update --latest`;

const steps = [
  ["tip denetimi", "bunx tsc --noEmit"],
  ["biçim ve lint", "bunx biome check ."],
  ["testler", "bun test"],
  ["derleme", "bun run build"],
] as const;

const failed: string[] = [];
for (const [name, command] of steps) {
  const { exitCode } = await Bun.$`${{ raw: command }}`.quiet().nothrow();
  console.log(`${exitCode === 0 ? "✓" : "✗"} ${name}`);
  if (exitCode !== 0) failed.push(name);
}

if (failed.length) {
  console.log(
    `\n${failed.join(", ")} başarısız. Geri almak için:\n` +
      "  git checkout package.json bun.lock && bun install",
  );
  process.exit(1);
}
console.log("\nBağımlılıklar güncel, proje sağlam.");
