import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Heart, Lightbulb, MessageCircleHeart, Sparkles, RefreshCw, Quote } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

interface MarriageContent {
  dailyPhrase: string;
  tip: string;
  tipTitle: string;
  compliment: string;
  activity: string;
  activityTitle: string;
  reflection: string;
  category: string;
  date: string;
}

const categoryIcons: Record<string, string> = {
  romance: "💕",
  gratidão: "🙏",
  parceria: "🤝",
  admiração: "🌟",
  cumplicidade: "💑",
  carinho: "🥰",
};

const CACHE_KEY = "marriage-tips-cache";

export const MarriageTips = () => {
  const [content, setContent] = useState<MarriageContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [wifeName, setWifeName] = useState(() => localStorage.getItem("wife-name") || "");
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(wifeName);
  const { toast } = useToast();

  const fetchTips = async (force = false) => {
    const today = new Date().toDateString();
    const cached = localStorage.getItem(CACHE_KEY);

    if (!force && cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed._cacheDate === today) {
          setContent(parsed);
          setLoading(false);
          return;
        }
      } catch {}
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("marriage-tips", {
        body: { wifeName: localStorage.getItem("wife-name") || "" },
      });

      if (error) throw error;

      const withCache = { ...data, _cacheDate: today };
      localStorage.setItem(CACHE_KEY, JSON.stringify(withCache));
      setContent(data);
    } catch (e: any) {
      console.error(e);
      toast({
        title: "Erro ao buscar dicas",
        description: e.message || "Tente novamente mais tarde",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTips();
  }, []);

  const saveName = () => {
    localStorage.setItem("wife-name", nameInput);
    setWifeName(nameInput);
    setEditingName(false);
    localStorage.removeItem(CACHE_KEY);
    fetchTips(true);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <motion.div
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
        >
          <Heart className="text-destructive" size={40} fill="currentColor" />
        </motion.div>
        <p className="text-muted-foreground text-sm">Preparando seu conteúdo do dia...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-4">
      {/* Wife name */}
      <Card className="border-destructive/20 bg-destructive/5">
        <CardContent className="p-4">
          {editingName ? (
            <div className="flex gap-2">
              <Input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Nome da sua esposa"
                className="flex-1"
              />
              <Button size="sm" onClick={saveName}>Salvar</Button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {wifeName ? (
                  <>Conteúdo personalizado para <span className="font-bold text-destructive">{wifeName}</span> 💕</>
                ) : (
                  "Adicione o nome da sua esposa para personalizar"
                )}
              </p>
              <Button variant="ghost" size="sm" onClick={() => { setNameInput(wifeName); setEditingName(true); }}>
                {wifeName ? "Editar" : "Adicionar"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {content && (
        <>
          {/* Daily phrase - hero card */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="bg-gradient-to-br from-destructive/10 via-destructive/5 to-accent/10 border-destructive/20 overflow-hidden">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Quote className="text-destructive" size={18} />
                  <span className="text-xs font-semibold text-destructive uppercase tracking-wider">
                    Frase do Dia {categoryIcons[content.category] || "💕"}
                  </span>
                </div>
                <p className="text-lg font-medium text-foreground leading-relaxed italic">
                  "{content.dailyPhrase}"
                </p>
                <p className="text-xs text-muted-foreground mt-3">{content.date}</p>
              </CardContent>
            </Card>
          </motion.div>

          {/* Compliment */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card className="border-primary/20">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="bg-primary/10 rounded-full p-2 mt-0.5">
                    <MessageCircleHeart className="text-primary" size={18} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-foreground mb-1">Elogio para Hoje</h3>
                    <p className="text-sm text-muted-foreground">{content.compliment}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Tip */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="bg-warning/10 rounded-full p-2 mt-0.5">
                    <Lightbulb className="text-warning" size={18} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-foreground mb-1">{content.tipTitle}</h3>
                    <p className="text-sm text-muted-foreground">{content.tip}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Activity */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="bg-success/10 rounded-full p-2 mt-0.5">
                    <Sparkles className="text-success" size={18} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-foreground mb-1">{content.activityTitle}</h3>
                    <p className="text-sm text-muted-foreground">{content.activity}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Reflection */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
            <Card className="bg-muted/50">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="bg-foreground/10 rounded-full p-2 mt-0.5">
                    <Heart className="text-foreground/60" size={18} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-foreground mb-1">Reflexão do Dia</h3>
                    <p className="text-sm text-muted-foreground italic">{content.reflection}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Refresh button */}
          <div className="flex justify-center pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { localStorage.removeItem(CACHE_KEY); fetchTips(true); }}
              className="gap-2"
            >
              <RefreshCw size={14} />
              Gerar nova inspiração
            </Button>
          </div>
        </>
      )}
    </div>
  );
};
