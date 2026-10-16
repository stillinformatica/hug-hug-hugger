import { describe, expect, it } from "vitest";
import { catalogItems, matchesPayment } from "../../supabase/functions/_shared/payment-rules";

describe("Payment integrity", () => {
  it("uses catalog prices instead of injected cart prices", () => {
    const cart = [{ productId: "a", quantity: 2, unit_amount: 0.01 }];
    expect(catalogItems(cart, [{ id: "a", name: "Produto", price: 100 }])[0].unit_amount).toBe(100);
  });
  it("rejects missing products", () => { expect(() => catalogItems([{ productId: "missing", quantity: 1 }], [])).toThrow(); });
  it("rejects negative quantities", () => { expect(() => catalogItems([{ productId: "a", quantity: -1 }], [{id:"a",name:"Produto",price:100}])).toThrow(); });
  it("rejects mismatched verified payment amounts", () => {
    expect(matchesPayment({reference_id:"r",pagbank_id:"p",total_amount:100},{reference_id:"r",id:"p",amount:1})).toBe(false);
  });
  it("rejects payments from a different checkout", () => {
    expect(matchesPayment({reference_id:"r",pagbank_id:"p",total_amount:100},{reference_id:"r",id:"other",amount:10000})).toBe(false);
  });
  it("accepts exact verified payments", () => {
    expect(matchesPayment({reference_id:"r",pagbank_id:"p",total_amount:100},{reference_id:"r",id:"p",amount:10000})).toBe(true);
  });
});