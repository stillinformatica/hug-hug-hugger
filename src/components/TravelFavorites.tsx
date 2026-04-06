import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, Instagram, ExternalLink, Heart } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface Favorite {
  id: string;
  title: string;
  description: string;
  link: string;
  imageUrl: string;
}

interface TravelFavoritesProps {
  externalItems?: Favorite[];
}

const STORAGE_KEY = "travel-favorites";

const loadFavorites = (): Favorite[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return [];
};

export const TravelFavorites = ({ externalItems }: TravelFavoritesProps) => {
  const [favorites, setFavorites] = useState<Favorite[]>(loadFavorites);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newFav, setNewFav] = useState({ title: "", description: "", link: "", imageUrl: "" });

  // Add external items when they arrive
  useEffect(() => {
    if (externalItems && externalItems.length > 0) {
      setFavorites(prev => {
        const newItems = externalItems.filter(ext => !prev.some(p => p.id === ext.id));
        return newItems.length > 0 ? [...prev, ...newItems] : prev;
      });
    }
  }, [externalItems]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
  }, [favorites]);

  const addFavorite = () => {
    if (!newFav.title.trim() && !newFav.link.trim()) return;
    setFavorites([
      ...favorites,
      {
        id: Date.now().toString(),
        title: newFav.title || "Sem título",
        description: newFav.description,
        link: newFav.link,
        imageUrl: newFav.imageUrl,
      },
    ]);
    setNewFav({ title: "", description: "", link: "", imageUrl: "" });
    setDialogOpen(false);
  };

  const removeFavorite = (id: string) => {
    setFavorites(favorites.filter((f) => f.id !== id));
  };

  const isInstagram = (url: string) => url.includes("instagram.com") || url.includes("instagr.am");

  return (
    <div className="space-y-4">
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <Button className="w-full h-12 rounded-xl bg-travel text-travel-foreground hover:bg-travel/90 font-semibold text-base gap-2">
            <Plus size={20} />
            Adicionar aos Favoritos
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-sm mx-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">Novo Favorito</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <Input
              placeholder="Nome / Título"
              value={newFav.title}
              onChange={(e) => setNewFav({ ...newFav, title: e.target.value })}
              className="rounded-xl h-11"
            />
            <Input
              placeholder="Link do Instagram ou site"
              value={newFav.link}
              onChange={(e) => setNewFav({ ...newFav, link: e.target.value })}
              className="rounded-xl h-11"
            />
            <Textarea
              placeholder="Notas (opcional)"
              value={newFav.description}
              onChange={(e) => setNewFav({ ...newFav, description: e.target.value })}
              className="rounded-xl min-h-[70px]"
            />
            <Input
              placeholder="URL da imagem (opcional)"
              value={newFav.imageUrl}
              onChange={(e) => setNewFav({ ...newFav, imageUrl: e.target.value })}
              className="rounded-xl h-11"
            />
            <Button onClick={addFavorite} className="w-full h-11 rounded-xl bg-travel text-travel-foreground hover:bg-travel/90 font-semibold">
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="space-y-3">
        <AnimatePresence>
          {favorites.map((fav) => (
            <motion.div
              key={fav.id}
              layout
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -100 }}
              className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden"
            >
              {fav.imageUrl && (
                <div className="h-32 overflow-hidden">
                  <img
                    src={fav.imageUrl}
                    alt={fav.title}
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                </div>
              )}
              <div className="p-4 space-y-2">
                <div className="flex items-start justify-between">
                  <h3 className="font-display font-bold text-base text-card-foreground">{fav.title}</h3>
                  <button onClick={() => removeFavorite(fav.id)} className="text-muted-foreground/50 hover:text-destructive transition-colors p-1">
                    <Trash2 size={16} />
                  </button>
                </div>
                {fav.description && (
                  <p className="text-sm text-muted-foreground leading-relaxed">{fav.description}</p>
                )}
                {fav.link && (
                  <a
                    href={fav.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs font-semibold hover:underline"
                    style={isInstagram(fav.link) ? { color: "#E1306C" } : undefined}
                  >
                    {isInstagram(fav.link) ? <Instagram size={13} /> : <ExternalLink size={13} />}
                    {isInstagram(fav.link) ? "Ver no Instagram" : "Abrir link"}
                  </a>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {favorites.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Heart size={48} className="mb-3 opacity-30" />
          <p className="text-lg font-semibold">Nenhum favorito</p>
          <p className="text-sm">Salve links de coisas que quer fazer!</p>
        </div>
      )}
    </div>
  );
};
