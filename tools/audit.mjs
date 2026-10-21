/**
 * Tide & Timber — theme audit.
 *
 * Checks the two palettes against the official `--dsw-alias-*` token contract
 * and computes WCAG 2.x contrast for the pairs that carry text or meaningful
 * UI. Zero dependencies; run from anywhere:
 *
 *   node dsh-theme-tide/tools/audit.mjs
 *   node dsh-theme-tide/tools/audit.mjs --json
 *   node dsh-theme-tide/tools/audit.mjs --write-preview
 *
 * Exit code: 0 when every required pair passes, 1 when coverage is incomplete
 * or a required contrast pair fails. Advisory UI pairs never fail the run.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { LIGHT, DARK, LABEL } from '../src/palette.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const args = new Set(process.argv.slice(2));
const JSON_OUT = args.has('--json');
const WRITE_PREVIEW = args.has('--write-preview');

const official = JSON.parse(readFileSync(path.join(root, 'src', 'official-tokens.json'), 'utf8'));

function parseColor(value) {
  const raw = String(value).trim();
  if (raw === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  const hex = raw.match(/^#([0-9a-f]{3,8})$/i);
  if (!hex) return null;
  let h = hex[1];
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
  if (h.length !== 6 && h.length !== 8) return null;
  const n = Number.parseInt(h.slice(0, 6), 16);
  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255,
    a: h.length === 8 ? Number.parseInt(h.slice(6, 8), 16) / 255 : 1,
  };
}

function mix(a, b, weight) {
  return {
    r: a.r * weight + b.r * (1 - weight),
    g: a.g * weight + b.g * (1 - weight),
    b: a.b * weight + b.b * (1 - weight),
    a: a.a * weight + b.a * (1 - weight),
  };
}

/** Resolve the palette values this theme actually uses: hex + simple srgb color-mix. */
function resolve(value) {
  if (typeof value !== 'string') return null;
  const direct = parseColor(value);
  if (direct) return direct;
  const m = value.match(/^color-mix\(in srgb,\s*(#[0-9a-f]{3,8})\s+([\d.]+)%,\s*(transparent|#[0-9a-f]{3,8})\s*\)$/i);
  if (!m) return null;
  const first = parseColor(m[1]);
  const second = parseColor(m[3]);
  if (!first || !second) return null;
  return mix(first, second, Number(m[2]) / 100);
}

function over(fg, bg) {
  const a = fg.a + bg.a * (1 - fg.a);
  if (a === 0) return { r: 0, g: 0, b: 0, a: 1 };
  return {
    r: (fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / a,
    g: (fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / a,
    b: (fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / a,
    a,
  };
}

function luminance({ r, g, b }) {
  const channel = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(fgValue, bgValue) {
  const fg = resolve(fgValue);
  const bg = resolve(bgValue);
  if (!fg || !bg) return null;
  const bgSolid = bg.a < 1 ? over(bg, { r: 255, g: 255, b: 255, a: 1 }) : bg;
  const fgSolid = over(fg, bgSolid);
  const [light, dark] = [luminance(fgSolid), luminance(bgSolid)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

/** Pairs that matter for readability; `strict` pairs fail the run. */
const PAIRS = [
  ['label-primary', 'bg-base', 4.5, true, '正文/主标签在主背景'],
  ['label-primary', 'bg-layer-2', 4.5, true, '正文/主标签在浮层'],
  ['label-primary', 'bg-layer-3', 4.5, true, '正文/主标签在第三层'],
  ['label-secondary', 'bg-base', 4.5, true, '次级文字在主背景'],
  ['label-secondary', 'bg-layer-2', 4.5, true, '次级文字在浮层'],
  ['label-tertiary', 'bg-base', 4.5, true, '三级文字在主背景'],
  ['label-tertiary', 'bg-layer-2', 4.5, true, '三级文字在浮层'],
  ['label-caption', 'bg-base', 4.5, true, '说明文字在主背景'],
  ['label-primary-bluish', 'bg-base', 4.5, true, '蓝调主标签在主背景'],
  ['link', 'bg-base', 4.5, true, '链接在主背景'],
  ['label-primary', 'markdown-code-block', 4.5, true, '代码块正文'],
  ['label-secondary', 'markdown-code-block', 4.5, true, '代码块次级文字'],
  ['label-primary', 'markdown-inline-code', 4.5, true, '行内代码'],
  ['toast-label', 'toast-bg', 4.5, true, 'Toast 文本'],
  ['label-primary-foreground', 'button-primary-fill', 4.5, true, '主按钮文字'],
  ['label-document-preview', 'bg-document-preview', 4.5, true, '文档预览文本'],
  ['state-error-primary', 'bg-base', 4.5, true, '错误状态文本'],
  ['state-success-primary', 'bg-base', 4.5, true, '成功状态文本'],
  ['state-warn-label', 'state-warn-tertiary', 4.5, true, '警告标签'],
  ['menu-icon', 'bg-layer-2', 3, true, '菜单图标（非文本 3:1）'],
  ['brand-primary', 'bg-base', 3, true, '品牌色在背景上（非文本 3:1）'],
  ['border-l3', 'bg-base', 3, false, '三级边框（建议值，失败不阻断）'],
  ['scrollbar-bg-l1', 'bg-base', 3, false, '滚动条（建议值，失败不阻断）'],
];

function tokenName(short) {
  return `--dsw-alias-${short}`;
}

function audit(scheme) {
  const palette = scheme === 'light' ? LIGHT : DARK;
  const keys = new Set(Object.keys(palette));
  const missing = official.tokens.filter((token) => !keys.has(token));
  const extra = [...keys].filter((token) => !official.tokens.includes(token));
  const rows = PAIRS.map(([fg, bg, min, strict, note]) => {
    const fgToken = tokenName(fg);
    const bgToken = tokenName(bg);
    const ratio = contrast(palette[fgToken], palette[bgToken]);
    return {
      fg: fgToken,
      bg: bgToken,
      min,
      strict,
      note,
      ratio: ratio === null ? null : Number(ratio.toFixed(2)),
      pass: ratio !== null && ratio >= min,
    };
  });
  return { scheme, missing, extra, rows };
}

function renderMarkdown(results) {
  const out = [];
  out.push(`# ${LABEL.zh} · ${LABEL.en} — theme audit`);
  out.push('');
  out.push(`> Generated by \`tools/audit.mjs\` · official token contract \`${official.source}\` (${official.count} tokens).`);
  out.push('');
  for (const result of results) {
    const coverage = result.missing.length === 0 && result.extra.length === 0;
    out.push(`## ${result.scheme === 'light' ? 'Light — Salt & Timber' : 'Dark — Twilight Cove'}`);
    out.push('');
    out.push(`- Alias token coverage: **${official.count - result.missing.length}/${official.count}**${coverage ? ' ✅' : ` ❌ missing ${result.missing.join(', ')}`}`);
    out.push('');
    out.push('| Pair | Min | Ratio | Result | Note |');
    out.push('| --- | ---: | ---: | --- | --- |');
    for (const row of result.rows) {
      const status = row.ratio === null ? '⚠️ unresolved' : row.pass ? '✅' : row.strict ? '❌' : '⚠️ advisory';
      out.push(`| ${row.fg} → ${row.bg} | ${row.min}:1 | ${row.ratio ?? '—'} | ${status} | ${row.note} |`);
    }
    out.push('');
  }
  const failures = results.flatMap((r) => r.rows.filter((row) => row.strict && !row.pass && row.ratio !== null));
  const coverageFailures = results.filter((r) => r.missing.length || r.extra.length);
  out.push(failures.length === 0 && coverageFailures.length === 0
    ? '**Result: PASS** — coverage complete and every required pair meets WCAG AA.'
    : `**Result: FAIL** — ${failures.length} required contrast pair(s), ${coverageFailures.length} coverage issue(s).`);
  out.push('');
  return out.join('\n');
}

const results = [audit('light'), audit('dark')];
const failures = results.flatMap((r) => r.rows.filter((row) => row.strict && !row.pass));
const coverageFailures = results.filter((r) => r.missing.length || r.extra.length);
const summary = {
  theme: `${LABEL.zh} / ${LABEL.en}`,
  officialTokens: official.count,
  coverage: Object.fromEntries(results.map((r) => [r.scheme, official.count - r.missing.length])),
  failures: failures.map((row) => `${row.fg} → ${row.bg}: ${row.ratio ?? 'unresolved'} < ${row.min}`),
  coverageFailures: coverageFailures.map((r) => ({ scheme: r.scheme, missing: r.missing, extra: r.extra })),
  pass: failures.length === 0 && coverageFailures.length === 0,
};

if (JSON_OUT) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  for (const result of results) {
    console.log(`\n${result.scheme.toUpperCase()} — coverage ${official.count - result.missing.length}/${official.count}`);
    for (const row of result.rows) {
      const mark = row.ratio === null ? '  ? ' : row.pass ? '  ✅' : row.strict ? '  ❌' : '  ⚠️';
      console.log(`${mark} ${String(row.ratio ?? '—').padStart(6)}:1  ${row.fg.replace('--dsw-alias-', '')} → ${row.bg.replace('--dsw-alias-', '')}`);
    }
    if (result.missing.length) console.log('  missing:', result.missing.join(', '));
    if (result.extra.length) console.log('  extra:', result.extra.join(', '));
  }
  console.log(`\n${summary.pass ? 'PASS' : 'FAIL'} — ${summary.failures.length} required failure(s)`);
}

if (WRITE_PREVIEW) {
  mkdirSync(path.join(root, 'previews'), { recursive: true });
  writeFileSync(path.join(root, 'previews', 'audit.md'), renderMarkdown(results));
  console.log('wrote previews/audit.md');
}

process.exitCode = summary.pass ? 0 : 1;
