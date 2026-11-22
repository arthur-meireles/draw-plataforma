/**
 * Assinatura de e-mail (RF-M11-04): campos estruturados → HTML em tabela com estilos inline,
 * compatível com Gmail e Outlook (sem CSS externo, sem imagem única, logo hospedado).
 * As cores ficam literais de propósito: clientes de e-mail não entendem variáveis CSS.
 */
export interface SignatureFields {
  name: string;
  role: string;
  company: string;
  phone: string;
  email: string;
  website: string;
  logoUrl: string;
}

export const EMPTY_SIGNATURE: SignatureFields = { name: "", role: "", company: "Draw Legal Design", phone: "", email: "", website: "", logoUrl: "" };

const MARK = "drawsig:";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const isHttps = (u: string) => /^https:\/\/\S+$/.test(u.trim());
const href = (u: string) => (/^https?:\/\//.test(u.trim()) ? u.trim() : `https://${u.trim()}`);
const encode = (f: SignatureFields) => (typeof btoa === "function" ? btoa(unescape(encodeURIComponent(JSON.stringify(f)))) : Buffer.from(JSON.stringify(f)).toString("base64"));
const decode = (s: string) => JSON.parse(typeof atob === "function" ? decodeURIComponent(escape(atob(s))) : Buffer.from(s, "base64").toString("utf8"));

export function validateSignature(f: SignatureFields): Record<string, string> {
  const e: Record<string, string> = {};
  if (!f.name.trim()) e.name = "Informe o nome que aparece na assinatura";
  if (f.email.trim() && !/^\S+@\S+\.\S+$/.test(f.email.trim())) e.email = "Informe um e-mail válido";
  if (f.logoUrl.trim() && !isHttps(f.logoUrl)) e.logoUrl = "Use o endereço https:// de um logo hospedado (as imagens não vão anexadas)";
  return e;
}

export function buildSignatureHtml(f: SignatureFields): string {
  const line = (s: string) => `<div style="margin:0 0 2px 0;line-height:18px;">${s}</div>`;
  const contact: string[] = [];
  if (f.phone.trim()) contact.push(esc(f.phone.trim()));
  if (f.email.trim()) contact.push(`<a href="mailto:${esc(f.email.trim())}" style="color:#2f5fe3;text-decoration:none;">${esc(f.email.trim())}</a>`);
  const roleLine = [f.role.trim(), f.company.trim()].filter(Boolean).map(esc).join(" · ");
  const logo = isHttps(f.logoUrl)
    ? `<td valign="top" style="padding:0 14px 0 0;"><img src="${esc(f.logoUrl.trim())}" alt="${esc(f.company.trim() || f.name.trim())}" width="72" style="display:block;border:0;outline:none;max-width:72px;height:auto;" /></td>`
    : "";
  return [
    `<!--${MARK}${encode(f)}-->`,
    `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#333333;border-collapse:collapse;">`,
    `<tr>${logo}<td valign="top" style="padding:0 0 0 ${logo ? "14px" : "0"};${logo ? "border-left:2px solid #2f5fe3;" : ""}">`,
    `<div style="margin:0 0 2px 0;font-size:15px;line-height:20px;font-weight:bold;color:#111111;">${esc(f.name.trim())}</div>`,
    roleLine ? line(`<span style="color:#666666;">${roleLine}</span>`) : "",
    contact.length ? line(contact.join(' <span style="color:#999999;">|</span> ')) : "",
    f.website.trim() ? line(`<a href="${esc(href(f.website))}" style="color:#2f5fe3;text-decoration:none;">${esc(f.website.trim().replace(/^https?:\/\//, ""))}</a>`) : "",
    `</td></tr></table>`,
  ]
    .filter(Boolean)
    .join("");
}

/** Recupera os campos de uma assinatura criada por esta tela; `null` se o HTML veio de outro lugar. */
export function parseSignature(html: string): SignatureFields | null {
  const m = html.match(new RegExp(`<!--${MARK}([A-Za-z0-9+/=]+)-->`));
  if (!m) return null;
  try {
    return { ...EMPTY_SIGNATURE, ...decode(m[1]) };
  } catch {
    return null;
  }
}
