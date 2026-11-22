import { describe, expect, it } from "vitest";
import { buildSignatureHtml, EMPTY_SIGNATURE, parseSignature, validateSignature } from "./signature";

const base = { ...EMPTY_SIGNATURE, name: "Paula <b>Andrade</b>", role: "CEO", email: "paula@draw.com.br", phone: "(11) 99999-0000", website: "draw.com.br" };

describe("RF-M11-04 — assinatura HTML", () => {
  it("gera tabela com estilos inline e escapa o conteúdo", () => {
    const html = buildSignatureHtml(base);
    expect(html).toContain("<table");
    expect(html).toContain("style=");
    expect(html).not.toContain("<b>Andrade");
    expect(html).toContain("&lt;b&gt;Andrade");
    expect(html).not.toMatch(/<style|class=|var\(--/);
  });

  it("usa logo hospedado só com https e nunca como imagem única", () => {
    expect(buildSignatureHtml({ ...base, logoUrl: "http://x.com/logo.png" })).not.toContain("<img");
    const withLogo = buildSignatureHtml({ ...base, logoUrl: "https://draw.com.br/logo.png" });
    expect(withLogo).toContain('<img src="https://draw.com.br/logo.png"');
    expect(withLogo).toContain("Paula");
  });

  it("recupera os campos salvos e valida entradas", () => {
    expect(parseSignature(buildSignatureHtml(base))).toEqual(base);
    expect(parseSignature("<p>outra assinatura</p>")).toBeNull();
    expect(validateSignature({ ...base, name: "", email: "x", logoUrl: "http://a" })).toEqual({ name: expect.any(String), email: expect.any(String), logoUrl: expect.any(String) });
  });
});
