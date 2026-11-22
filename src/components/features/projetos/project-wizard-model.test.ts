import { describe, expect, it } from "vitest";
import { installmentsForCondition } from "./project-wizard-model";

describe("condições de pagamento do assistente", () => {
  it("à vista gera 1 parcela com o total", () => {
    const rows = installmentsForCondition("a_vista", 100_000, "", []);
    expect(rows).toHaveLength(1);
    expect(rows[0].amountCents).toBe(100_000);
  });

  it("50/50 divide em 2 parcelas que somam o total (resto na segunda)", () => {
    const rows = installmentsForCondition("50_50", 100_001, "2026-12-30", []);
    expect(rows.map((r) => r.amountCents)).toEqual([50_000, 50_001]);
    expect(rows[1].expectedAt).toBe("2026-12-30");
  });

  it("preserva chave e data editada ao recalcular", () => {
    const first = installmentsForCondition("50_50", 100_000, "", []);
    const edited = first.map((r, i) => (i === 0 ? { ...r, expectedAt: "2027-01-10" } : r));
    const again = installmentsForCondition("50_50", 200_000, "", edited);
    expect(again[0].key).toBe(edited[0].key);
    expect(again[0].expectedAt).toBe("2027-01-10");
    expect(again.reduce((a, r) => a + r.amountCents, 0)).toBe(200_000);
  });

  it("parcelado não mexe nas parcelas", () => {
    const cur = installmentsForCondition("a_vista", 1000, "", []);
    expect(installmentsForCondition("parcelado", 5000, "", cur)).toBe(cur);
  });
});
