import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  MapPin,
  ExternalLink,
  Calendar as CalendarIcon,
  Trash2,
  Plane,
  Instagram,
  Heart,
  Sparkles,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { format, isSameDay, isWithinInterval, parseISO, parse, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import { TravelCalendar } from "@/components/TravelCalendar";
import { TravelPriceMonitor } from "@/components/TravelPriceMonitor";
import { TravelFavorites } from "@/components/TravelFavorites";
import { TravelPreferences } from "@/components/TravelPreferences";

type TravelSubTab = "agenda" | "favorites" | "preferences";

interface Trip {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  description: string;
  imageUrl: string;
  externalLink: string;
  instagramLink: string;
  purchased: boolean;
  initialPrice?: number | null;
}

const sampleTrips: Trip[] = [
  {
    id: "1",
    title: "Praia de Jericoacoara",
    startDate: "2026-03-15",
    endDate: "2026-03-20",
    description: "Fim de semana na praia. Passeio de buggy incluso!",
    imageUrl: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400&h=250&fit=crop",
    externalLink: "https://example.com",
    instagramLink: "",
    purchased: true,
    initialPrice: null,
  },
  {
    id: "2",
    title: "Trilha Chapada Diamantina",
    startDate: "2026-04-20",
    endDate: "2026-04-23",
    description: "Trilha de 3 dias com guia local.",
    imageUrl: "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=400&h=250&fit=crop",
    externalLink: "",
    instagramLink: "",
    purchased: false,
    initialPrice: null,
  },
  {
    id: "3",
    title: "Cancún All Inclusive",
    startDate: "2026-07-10",
    endDate: "2026-07-17",
    description: "Pacote all inclusive 7 dias em Cancún.",
    imageUrl: "https://images.unsplash.com/photo-1510414842594-a61c69b5ae57?w=400&h=250&fit=crop",
    externalLink: "",
    instagramLink: "",
    purchased: false,
    initialPrice: null,
  },
];

export const TravelAgenda = () => {
  const [subTab, setSubTab] = useState<TravelSubTab>("agenda");
  const [trips, setTrips] = useState<Trip[]>(sampleTrips);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingFavorites, setPendingFavorites] = useState<Array<{ id: string; title: string; description: string; link: string; imageUrl: string }>>([]);
  const [newTrip, setNewTrip] = useState({
    title: "",
    startDate: "",
    endDate: "",
    description: "",
    imageUrl: "",
    externalLink: "",
    instagramLink: "",
  });

  const handleAddToFavorites = (item: { title: string; description: string; link: string }) => {
    setPendingFavorites(prev => [...prev, { id: Date.now().toString(), title: item.title, description: item.description, link: item.link, imageUrl: "" }]);
    setSubTab("favorites");
  };

  const extractDateFromText = (text: string): string => {
    const currentYear = new Date().getFullYear();
    
    // Match patterns like "13/03/2026", "13/3/2026", "13/03", "13/3"
    const slashMatch = text.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
    if (slashMatch) {
      const day = parseInt(slashMatch[1]);
      const month = parseInt(slashMatch[2]);
      const year = slashMatch[3] ? (slashMatch[3].length === 2 ? 2000 + parseInt(slashMatch[3]) : parseInt(slashMatch[3])) : currentYear;
      const d = new Date(year, month - 1, day);
      if (isValid(d)) return format(d, "yyyy-MM-dd");
    }

    // Match patterns like "13 de março", "13 de mar"
    const months: Record<string, number> = {
      jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5,
      jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11,
      janeiro: 0, fevereiro: 1, março: 2, marco: 2, abril: 3, maio: 4, junho: 5,
      julho: 6, agosto: 7, setembro: 8, outubro: 9, novembro: 10, dezembro: 11,
    };
    const ptMatch = text.toLowerCase().match(/(\d{1,2})\s*(?:de\s+)?(\w+)/);
    if (ptMatch) {
      const day = parseInt(ptMatch[1]);
      const monthKey = Object.keys(months).find(k => ptMatch[2].startsWith(k));
      if (monthKey) {
        const d = new Date(currentYear, months[monthKey], day);
        if (isValid(d)) return format(d, "yyyy-MM-dd");
      }
    }

    return new Date().toISOString().split("T")[0];
  };

  const handleAddToCalendar = (item: { title: string; description: string; link: string }) => {
    const combinedText = `${item.title} ${item.description}`;
    const extractedDate = extractDateFromText(combinedText);
    const newId = Date.now().toString();
    setTrips(prev => [
      ...prev,
      {
        id: newId,
        title: item.title,
        startDate: extractedDate,
        endDate: extractedDate,
        description: item.description,
        imageUrl: "",
        externalLink: item.link,
        instagramLink: "",
        purchased: false,
        initialPrice: null,
      },
    ]);
    setSubTab("agenda");
    toast.success("Adicionado à agenda!");
  };

  const addTrip = () => {
    if (!newTrip.title.trim() || !newTrip.startDate) return;
    setTrips([
      ...trips,
      {
        id: Date.now().toString(),
        ...newTrip,
        endDate: newTrip.endDate || newTrip.startDate,
        purchased: false,
        initialPrice: null,
      },
    ]);
    setNewTrip({ title: "", startDate: "", endDate: "", description: "", imageUrl: "", externalLink: "", instagramLink: "" });
    setDialogOpen(false);
  };

  const togglePurchased = (id: string) => {
    setTrips(trips.map((t) => (t.id === id ? { ...t, purchased: !t.purchased } : t)));
  };

  const removeTrip = (id: string) => {
    setTrips(trips.filter((t) => t.id !== id));
  };

  const updateTripPrice = (tripId: string, price: number) => {
    setTrips((prev) =>
      prev.map((t) =>
        t.id === tripId ? { ...t, initialPrice: t.initialPrice ?? price } : t
      )
    );
  };

  const [selectedDate, setSelectedDate] = useState<Date | undefined>();

  // Generate all dates between start and end for each trip
  const eventDates = useMemo(() => {
    const dates: Date[] = [];
    trips.forEach((t) => {
      const start = new Date(t.startDate + "T12:00:00");
      const end = new Date((t.endDate || t.startDate) + "T12:00:00");
      const current = new Date(start);
      while (current <= end) {
        dates.push(new Date(current));
        current.setDate(current.getDate() + 1);
      }
    });
    return dates;
  }, [trips]);

  const sortedTrips = useMemo(() => {
    let filtered = [...trips];
    if (selectedDate) {
      filtered = filtered.filter((t) => {
        const start = new Date(t.startDate + "T12:00:00");
        const end = new Date((t.endDate || t.startDate) + "T12:00:00");
        return isWithinInterval(selectedDate, { start, end }) || isSameDay(selectedDate, start) || isSameDay(selectedDate, end);
      });
    }
    return filtered.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  }, [trips, selectedDate]);

  const formatDateRange = (startStr: string, endStr: string) => {
    try {
      const start = format(new Date(startStr + "T12:00:00"), "dd MMM", { locale: ptBR });
      const end = format(new Date(endStr + "T12:00:00"), "dd MMM, yyyy", { locale: ptBR });
      if (startStr === endStr) return format(new Date(startStr + "T12:00:00"), "dd 'de' MMM, yyyy", { locale: ptBR });
      return `${start} — ${end}`;
    } catch {
      return startStr;
    }
  };

  const daysUntil = (dateStr: string) => {
    const diff = Math.ceil(
      (new Date(dateStr + "T12:00:00").getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    if (diff < 0) return "Passado";
    if (diff === 0) return "Hoje!";
    if (diff === 1) return "Amanhã";
    return `em ${diff} dias`;
  };

  const isInstagramUrl = (url: string) => {
    return url.includes("instagram.com") || url.includes("instagr.am");
  };

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-1 bg-muted rounded-xl p-1">
        {[
          { key: "agenda" as TravelSubTab, label: "Agenda", icon: CalendarIcon },
          { key: "favorites" as TravelSubTab, label: "Favoritos", icon: Heart },
          { key: "preferences" as TravelSubTab, label: "Meus Gostos", icon: Sparkles },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setSubTab(tab.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-bold transition-all duration-200 ${
              subTab === tab.key
                ? "bg-card text-travel shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {subTab === "agenda" && (
          <motion.div key="agenda" initial={{ opacity: 0, x: -15 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 15 }} transition={{ duration: 0.15 }}>
            <div className="space-y-4">
              <TravelCalendar
                eventDates={eventDates}
                selectedDate={selectedDate}
                onDateSelect={(d) => setSelectedDate(d && selectedDate && isSameDay(d, selectedDate) ? undefined : d)}
              />

              {selectedDate && (
                <button onClick={() => setSelectedDate(undefined)} className="text-xs text-travel font-semibold hover:underline">
                  ← Mostrar todas as viagens
                </button>
              )}

              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="w-full h-12 rounded-xl bg-travel text-travel-foreground hover:bg-travel/90 font-semibold text-base gap-2">
                    <Plus size={20} />
                    Nova Viagem ou Passeio
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-sm mx-auto rounded-2xl">
                  <DialogHeader>
                    <DialogTitle className="font-display text-lg">Adicionar Viagem</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3 mt-2">
                    <Input placeholder="Nome do passeio" value={newTrip.title} onChange={(e) => setNewTrip({ ...newTrip, title: e.target.value })} className="rounded-xl h-11" />
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-muted-foreground font-semibold mb-1 block">Data início</label>
                        <Input type="date" value={newTrip.startDate} onChange={(e) => setNewTrip({ ...newTrip, startDate: e.target.value })} className="rounded-xl h-11" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground font-semibold mb-1 block">Data fim</label>
                        <Input type="date" value={newTrip.endDate} onChange={(e) => setNewTrip({ ...newTrip, endDate: e.target.value })} className="rounded-xl h-11" />
                      </div>
                    </div>
                    <Textarea placeholder="Descrição (opcional)" value={newTrip.description} onChange={(e) => setNewTrip({ ...newTrip, description: e.target.value })} className="rounded-xl min-h-[80px]" />
                    <Input placeholder="URL da imagem (opcional)" value={newTrip.imageUrl} onChange={(e) => setNewTrip({ ...newTrip, imageUrl: e.target.value })} className="rounded-xl h-11" />
                    <Input placeholder="Link do Instagram (opcional)" value={newTrip.instagramLink} onChange={(e) => setNewTrip({ ...newTrip, instagramLink: e.target.value })} className="rounded-xl h-11" />
                    <Input placeholder="Link externo do evento (opcional)" value={newTrip.externalLink} onChange={(e) => setNewTrip({ ...newTrip, externalLink: e.target.value })} className="rounded-xl h-11" />
                    <Button onClick={addTrip} className="w-full h-11 rounded-xl bg-travel text-travel-foreground hover:bg-travel/90 font-semibold">
                      Adicionar
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              <div className="space-y-3">
                <AnimatePresence>
                  {sortedTrips.map((trip) => (
                    <motion.div
                      key={trip.id}
                      layout
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -100 }}
                      className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden"
                    >
                      {trip.imageUrl && (
                        <div className="relative h-36 overflow-hidden">
                          <img src={trip.imageUrl} alt={trip.title} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                          <div className="absolute top-2 right-2 bg-card/80 backdrop-blur-sm text-card-foreground text-xs font-bold px-2.5 py-1 rounded-lg">
                            {daysUntil(trip.startDate)}
                          </div>
                        </div>
                      )}
                      <div className="p-4 space-y-2">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-display font-bold text-base text-card-foreground truncate">{trip.title}</h3>
                            <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                              <CalendarIcon size={13} />
                              {formatDateRange(trip.startDate, trip.endDate || trip.startDate)}
                            </p>
                          </div>
                          {!trip.imageUrl && (
                            <span className="text-xs font-bold text-travel bg-travel/10 px-2.5 py-1 rounded-lg shrink-0">{daysUntil(trip.startDate)}</span>
                          )}
                        </div>
                        {trip.description && <p className="text-sm text-muted-foreground leading-relaxed">{trip.description}</p>}
                        <div className="flex items-center gap-2 pt-1 flex-wrap">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => togglePurchased(trip.id)}
                            className={`rounded-lg text-xs font-semibold h-8 ${trip.purchased ? "bg-success/10 text-success border-success/30 hover:bg-success/20" : "bg-warning/10 text-warning border-warning/30 hover:bg-warning/20"}`}
                          >
                            {trip.purchased ? "✓ Comprado" : "Comprar"}
                          </Button>
                          {trip.instagramLink && (
                            <a href={trip.instagramLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs font-semibold hover:underline" style={{ color: "#E1306C" }}>
                              <Instagram size={13} /> Instagram
                            </a>
                          )}
                          {trip.externalLink && (
                            <a href={trip.externalLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-travel font-semibold hover:underline">
                              <ExternalLink size={13} /> Ver evento
                            </a>
                          )}
                          <div className="flex-1" />
                          <button onClick={() => removeTrip(trip.id)} className="text-muted-foreground/50 hover:text-destructive transition-colors p-1">
                            <Trash2 size={16} />
                          </button>
                        </div>
                        {!trip.purchased && (
                          <TravelPriceMonitor tripId={trip.id} tripTitle={trip.title} externalLink={trip.externalLink} startDate={trip.startDate} endDate={trip.endDate} initialPrice={trip.initialPrice} onPriceUpdate={updateTripPrice} />
                        )}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              {trips.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Plane size={48} className="mb-3 opacity-30" />
                  <p className="text-lg font-semibold">Nenhuma viagem</p>
                  <p className="text-sm">Adicione sua próxima aventura!</p>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {subTab === "favorites" && (
          <motion.div key="favorites" initial={{ opacity: 0, x: 15 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -15 }} transition={{ duration: 0.15 }}>
            <TravelFavorites externalItems={pendingFavorites} />
          </motion.div>
        )}

        {subTab === "preferences" && (
          <motion.div key="preferences" initial={{ opacity: 0, x: 15 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -15 }} transition={{ duration: 0.15 }}>
            <TravelPreferences onAddToFavorites={handleAddToFavorites} onAddToCalendar={handleAddToCalendar} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
