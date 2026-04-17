export interface CatalogProduct {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  price: number;
  images: string[];
  created_at: string;
}

const placeholderImage = "/placeholder.svg";

export const fallbackProducts: CatalogProduct[] = [
  {
    id: "fallback-pc-gamer",
    name: "PC Gamer Ryzen 5 5600G 16GB SSD 480GB",
    description: "Desktop pronto para trabalho e jogos leves, com ótimo custo-benefício.",
    category: "Computadores Montados",
    price: 2899.9,
    images: [placeholderImage],
    created_at: "2026-04-01T10:00:00.000Z",
  },
  {
    id: "fallback-notebook-dell",
    name: "Notebook Dell i5 8GB SSD 256GB",
    description: "Notebook revisado, ideal para estudo, escritório e uso diário.",
    category: "Notebooks Usados",
    price: 2199.9,
    images: [placeholderImage],
    created_at: "2026-04-02T10:00:00.000Z",
  },
  {
    id: "fallback-ssd-1tb",
    name: "SSD SATA 1TB",
    description: "Armazenamento rápido para upgrade de PCs e notebooks.",
    category: "SSDs e HDs",
    price: 429.9,
    images: [placeholderImage],
    created_at: "2026-04-03T10:00:00.000Z",
  },
  {
    id: "fallback-fonte-600w",
    name: "Fonte 600W 80 Plus",
    description: "Fonte estável e silenciosa para computadores de médio desempenho.",
    category: "Fontes",
    price: 319.9,
    images: [placeholderImage],
    created_at: "2026-04-04T10:00:00.000Z",
  },
  {
    id: "fallback-kit-upgrade",
    name: "Kit Placa-Mãe + Processador + Memória",
    description: "Kit completo para upgrade com montagem e teste.",
    category: "Kit Placa-Mãe + Processador",
    price: 1599.9,
    images: [placeholderImage],
    created_at: "2026-04-05T10:00:00.000Z",
  },
  {
    id: "fallback-camera-ip",
    name: "Câmera IP Wi‑Fi Full HD",
    description: "Solução prática para monitoramento residencial e comercial.",
    category: "Segurança",
    price: 249.9,
    images: [placeholderImage],
    created_at: "2026-04-06T10:00:00.000Z",
  },
];

type ProductInput = Partial<CatalogProduct> & {
  images?: unknown;
};

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

export function normalizeProduct(product: ProductInput | null | undefined): CatalogProduct {
  return {
    id: product?.id || crypto.randomUUID(),
    name: product?.name || "Produto sem nome",
    description: product?.description ?? null,
    category: product?.category ?? null,
    price: Number(product?.price ?? 0),
    images: toStringArray(product?.images),
    created_at: product?.created_at || new Date().toISOString(),
  };
}

export function normalizeProducts(products: ProductInput[] | null | undefined): CatalogProduct[] {
  return (products || []).map((product) => normalizeProduct(product));
}

export function filterProducts(products: CatalogProduct[], searchQuery?: string): CatalogProduct[] {
  const term = searchQuery?.trim().toLowerCase();

  if (!term) return products;

  return products.filter((product) =>
    [product.name, product.category, product.description]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(term))
  );
}