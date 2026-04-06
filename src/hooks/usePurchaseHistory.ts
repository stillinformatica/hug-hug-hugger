import { useState, useEffect, useCallback } from "react";

export interface PurchaseRecord {
  itemName: string;
  quantity: string;
  purchasedAt: number; // timestamp
}

export interface PurchaseSuggestion {
  itemName: string;
  avgIntervalDays: number;
  daysSinceLast: number;
  urgency: "now" | "soon" | "ok";
  lastQuantity: string;
}

const STORAGE_KEY = "purchase-history";

function loadHistory(): PurchaseRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(records: PurchaseRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

export function usePurchaseHistory() {
  const [history, setHistory] = useState<PurchaseRecord[]>(loadHistory);

  useEffect(() => {
    saveHistory(history);
  }, [history]);

  const recordPurchase = useCallback((itemName: string, quantity: string) => {
    setHistory((prev) => [
      ...prev,
      { itemName: itemName.toLowerCase().trim(), quantity, purchasedAt: Date.now() },
    ]);
  }, []);

  const getSuggestions = useCallback((): PurchaseSuggestion[] => {
    const byItem: Record<string, PurchaseRecord[]> = {};
    for (const r of history) {
      if (!byItem[r.itemName]) byItem[r.itemName] = [];
      byItem[r.itemName].push(r);
    }

    const suggestions: PurchaseSuggestion[] = [];

    for (const [itemName, records] of Object.entries(byItem)) {
      if (records.length < 2) continue; // need at least 2 purchases to calculate interval

      const sorted = [...records].sort((a, b) => a.purchasedAt - b.purchasedAt);
      const intervals: number[] = [];

      for (let i = 1; i < sorted.length; i++) {
        const diffDays = (sorted[i].purchasedAt - sorted[i - 1].purchasedAt) / (1000 * 60 * 60 * 24);
        intervals.push(diffDays);
      }

      const avgIntervalDays = Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length);
      const lastPurchase = sorted[sorted.length - 1];
      const daysSinceLast = Math.round((Date.now() - lastPurchase.purchasedAt) / (1000 * 60 * 60 * 24));

      let urgency: PurchaseSuggestion["urgency"] = "ok";
      if (daysSinceLast >= avgIntervalDays) {
        urgency = "now";
      } else if (daysSinceLast >= avgIntervalDays * 0.75) {
        urgency = "soon";
      }

      if (urgency !== "ok") {
        suggestions.push({
          itemName,
          avgIntervalDays,
          daysSinceLast,
          urgency,
          lastQuantity: lastPurchase.quantity,
        });
      }
    }

    return suggestions.sort((a, b) => (a.urgency === "now" ? -1 : 1) - (b.urgency === "now" ? -1 : 1));
  }, [history]);

  return { history, recordPurchase, getSuggestions };
}
