import { useState, useEffect } from "react";

export interface Market {
  id: string;
  name: string;
  url: string;
}

const STORAGE_KEY = "saved-markets";

export function useMarkets() {
  const [markets, setMarkets] = useState<Market[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(markets));
  }, [markets]);

  const addMarket = (name: string, url: string) => {
    let formatted = url.trim();
    if (!formatted.startsWith("http")) formatted = `https://${formatted}`;
    setMarkets((prev) => [...prev, { id: Date.now().toString(), name: name.trim(), url: formatted }]);
  };

  const removeMarket = (id: string) => {
    setMarkets((prev) => prev.filter((m) => m.id !== id));
  };

  return { markets, addMarket, removeMarket };
}
