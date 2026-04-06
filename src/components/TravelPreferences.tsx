import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, Music, Compass, Sparkles, Loader2, MapPin, Heart, CalendarPlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Preferences {
  bands: string[];
  activities: string[];
  interests: string[];
  city: string;
}

interface Suggestion {
  title: string;
  description: string;
  type: string;
  link?: string;
}

const STORAGE_KEY = "travel-preferences";

const loadPreferences = (): Preferences => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return { bands: [], activities: [], interests: [], city: "" };
};

interface TravelPreferencesProps {
  onAddToFavorites?: (item: { title: string; description: string; link: string }) => void;
  onAddToCalendar?: (item: { title: string; description: string; link: string }) => void;
}

export const TravelPreferences = ({ onAddToFavorites, onAddToCalendar }: TravelPreferencesProps) => {
  const [prefs, setPrefs] = useState<Preferences>(loadPreferences);
  const [newBand, setNewBand] = useState("");
  const [newActivity, setNewActivity] = useState("");
  const [newInterest, setNewInterest] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  }, [prefs]);

  const addItem = (field: keyof Omit<Preferences, "city">, value: string, setter: (v: string) => void) => {
    const trimmed = value.trim();
    if (!trimmed || prefs[field].includes(trimmed)) return;
    setPrefs({ ...prefs, [field]: [...prefs[field], trimmed] });
    setter("");
  };

  const removeItem = (field: keyof Omit<Preferences, "city">, value: string) => {
    setPrefs({ ...prefs, [field]: prefs[field].filter((i) => i !== value) });
  };

  const fetchSuggestions = async () => {
    if (prefs.bands.length === 0 && prefs.activities.length === 0 && prefs.interests.length === 0) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("travel-suggestions", {
        body: { preferences: prefs },
      });
      if (error) throw error;
      setSuggestions(data?.suggestions || []);
    } catch (err) {
      console.error("Error fetching suggestions:", err);
    } finally {
      setLoading(false);
    }
  };

  const hasPrefs = prefs.bands.length > 0 || prefs.activities.length > 0 || prefs.interests.length > 0;

  return (
    <div className="space-y-5">
      {/* City */}
      <div className="space-y-2">
        <label className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
          <MapPin size={13} /> Sua cidade / região
        </label>
        <Input
          placeholder="Ex: São Paulo, SP"
          value={prefs.city}
          onChange={(e) => setPrefs({ ...prefs, city: e.target.value })}
          className="rounded-xl h-11"
        />
      </div>

      {/* Bands */}
      <div className="space-y-2">
        <label className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
          <Music size={13} /> Bandas e artistas favoritos
        </label>
        <div className="flex gap-2">
          <Input
            placeholder="Ex: Coldplay, Marisa Monte..."
            value={newBand}
            onChange={(e) => setNewBand(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addItem("bands", newBand, setNewBand)}
            className="rounded-xl h-10"
          />
          <Button size="sm" onClick={() => addItem("bands", newBand, setNewBand)} className="h-10 rounded-xl bg-travel text-travel-foreground hover:bg-travel/90">
            <Plus size={16} />
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <AnimatePresence>
            {prefs.bands.map((b) => (
              <motion.div key={b} initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                <Badge variant="secondary" className="gap-1 cursor-pointer hover:bg-destructive/10" onClick={() => removeItem("bands", b)}>
                  {b} <X size={12} />
                </Badge>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Activities */}
      <div className="space-y-2">
        <label className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
          <Compass size={13} /> Tipos de passeio que gosto
        </label>
        <div className="flex gap-2">
          <Input
            placeholder="Ex: trilha, praia, gastronomia..."
            value={newActivity}
            onChange={(e) => setNewActivity(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addItem("activities", newActivity, setNewActivity)}
            className="rounded-xl h-10"
          />
          <Button size="sm" onClick={() => addItem("activities", newActivity, setNewActivity)} className="h-10 rounded-xl bg-travel text-travel-foreground hover:bg-travel/90">
            <Plus size={16} />
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <AnimatePresence>
            {prefs.activities.map((a) => (
              <motion.div key={a} initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                <Badge variant="secondary" className="gap-1 cursor-pointer hover:bg-destructive/10" onClick={() => removeItem("activities", a)}>
                  {a} <X size={12} />
                </Badge>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Interests */}
      <div className="space-y-2">
        <label className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
          <Sparkles size={13} /> Outros interesses
        </label>
        <div className="flex gap-2">
          <Input
            placeholder="Ex: vinícola, parque aquático..."
            value={newInterest}
            onChange={(e) => setNewInterest(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addItem("interests", newInterest, setNewInterest)}
            className="rounded-xl h-10"
          />
          <Button size="sm" onClick={() => addItem("interests", newInterest, setNewInterest)} className="h-10 rounded-xl bg-travel text-travel-foreground hover:bg-travel/90">
            <Plus size={16} />
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <AnimatePresence>
            {prefs.interests.map((i) => (
              <motion.div key={i} initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                <Badge variant="secondary" className="gap-1 cursor-pointer hover:bg-destructive/10" onClick={() => removeItem("interests", i)}>
                  {i} <X size={12} />
                </Badge>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Get Suggestions */}
      <Button
        onClick={fetchSuggestions}
        disabled={!hasPrefs || loading}
        className="w-full h-12 rounded-xl bg-travel text-travel-foreground hover:bg-travel/90 font-semibold text-base gap-2"
      >
        {loading ? <Loader2 size={20} className="animate-spin" /> : <Sparkles size={20} />}
        {loading ? "Buscando sugestões..." : "Buscar sugestões para mim"}
      </Button>

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-display font-bold text-sm text-muted-foreground">✨ Sugestões para você</h3>
          {suggestions.map((s, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="bg-card rounded-2xl border border-border p-4 space-y-2"
            >
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] font-bold text-travel border-travel/30">
                  {s.type}
                </Badge>
                <h4 className="font-display font-bold text-sm text-card-foreground">{s.title}</h4>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{s.description}</p>
              {s.link && (
                <a href={s.link} target="_blank" rel="noopener noreferrer" className="text-xs text-travel font-semibold hover:underline">
                  Ver mais →
                </a>
              )}
              <div className="flex gap-2 pt-1">
                {onAddToFavorites && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-lg text-xs h-8 gap-1.5 font-semibold"
                    onClick={() => {
                      onAddToFavorites({ title: s.title, description: s.description, link: s.link || "" });
                      toast.success("Salvo nos favoritos!");
                    }}
                  >
                    <Heart size={13} /> Favoritar
                  </Button>
                )}
                {onAddToCalendar && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-lg text-xs h-8 gap-1.5 font-semibold"
                    onClick={() => {
                      onAddToCalendar({ title: s.title, description: s.description, link: s.link || "" });
                      toast.success("Adicionado à agenda!");
                    }}
                  >
                    <CalendarPlus size={13} /> Agenda
                  </Button>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};
