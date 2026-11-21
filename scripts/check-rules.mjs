#!/usr/bin/env node
/**
 * Guarda das Leis do Projeto (CLAUDE.md). Roda em `npm run check:rules` e antes do build.
 * Falha se uma tela (src/app/**) usar primitivas HTML cruas, ícones fora do registro,
 * localStorage/serviços direto, ou cores hex soltas.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const src = join(root, "src");

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|css)$/.test(f) ? [p] : [];
  });
}

const rules = [
  { name: "Lei 1 — primitiva HTML crua em tela (use components/ui)", scope: /^src\/app\//, re: /<(button|input|select|textarea|table|thead|tbody|tr|td|th|h[1-6])(?=[\s>]|$)/ },
  { name: "Lei 1 — ícone importado fora de src/design/icons.ts (use <Icon name>)", scope: /^src\/(?!design\/icons\.ts)/, re: /from\s+["']lucide-react["']/ },
  { name: "Lei 5 — tela acessando localStorage (use hooks de src/data)", scope: /^src\/(app|components\/(ui|domain|features))\//, re: /localStorage/, allow: /draw:install-dismissed|draw:pref:/ },
  { name: "Lei 5 — tela chamando services direto sem hook (use useApiQuery/useApiMutation)", scope: /^src\/app\//, re: /from\s+["']@\/data\/db["']/ },
  { name: "Lei 3 — cor hex solta fora dos tokens", scope: /^src\/(app|components)\/.*\.tsx$/, re: /["'`\s(]#[0-9a-fA-F]{3,8}\b/, allow: /\/\/ token-ok/ },
  { name: "Lei 3 — style inline em tela (estenda o componente por prop)", scope: /^src\/app\//, re: /\sstyle=\{\{/, allow: /\/\/ style-ok/ },
];

const violations = [];
for (const file of walk(src)) {
  const rel = relative(root, file);
  const lines = readFileSync(file, "utf8").split("\n");
  for (const rule of rules) {
    if (!rule.scope.test(rel)) continue;
    lines.forEach((line, i) => {
      if (rule.re.test(line) && !(rule.allow && rule.allow.test(line))) violations.push(`${rel}:${i + 1}  ${rule.name}\n    ${line.trim().slice(0, 140)}`);
    });
  }
}

if (violations.length) {
  console.error(`\n✖ ${violations.length} violação(ões) das Leis do Projeto:\n\n${violations.join("\n")}\n`);
  process.exit(1);
}
console.log("✓ Leis do Projeto: nenhuma violação.");
