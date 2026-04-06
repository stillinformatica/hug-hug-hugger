import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { TrendingUp, Lightbulb, Target, BookOpen, RefreshCw, Quote, DollarSign } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface GrowthContent {
  dailyPhrase: string;
  financeTip: string;
  financeTipTitle: string;
  successHabit: string;
  successHabitTitle: string;
  debtTip: string;
  debtTipTitle: string;
  reflection: string;
  category: string;
  date: string;
}

const categoryIcons: Record<string, string> = {
  finanças: "💰",
  mentalidade: "🧠",
  disciplina: "🎯",
  investimentos: "📈",
  produtividade: "⚡",
  liderança: "👑",
};

const CACHE_KEY = "growth-tips-cache";

export const GrowthTips = () => {
  const [content, setContent] = useState<GrowthContent | null>(null);
  const [loading, setLoading] = useState(true);
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
      const { data, error } = await supabase.functions.invoke("growth-tips");
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

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <motion.div
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
        >
          <TrendingUp className="text-primary" size={40} />
        </motion.div>
        <p className="text-muted-foreground text-sm">Preparando suas dicas do dia...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-4">
      {content && (
        <>
          {/* Daily phrase - hero card */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="bg-gradient-to-br from-primary/10 via-primary/5 to-accent/10 border-primary/20 overflow-hidden">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Quote className="text-primary" size={18} />
                  <span className="text-xs font-semibold text-primary uppercase tracking-wider">
                    Frase do Dia {categoryIcons[content.category] || "🚀"}
                  </span>
                </div>
                <p className="text-lg font-medium text-foreground leading-relaxed italic">
                  "{content.dailyPhrase}"
                </p>
                <p className="text-xs text-muted-foreground mt-3">{content.date}</p>
              </CardContent>
            </Card>
          </motion.div>

          {/* Finance tip */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card className="border-success/20">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="bg-success/10 rounded-full p-2 mt-0.5">
                    <DollarSign className="text-success" size={18} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-foreground mb-1">{content.financeTipTitle}</h3>
                    <p className="text-sm text-muted-foreground">{content.financeTip}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Success habit */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="bg-warning/10 rounded-full p-2 mt-0.5">
                    <Target className="text-warning" size={18} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-foreground mb-1">{content.successHabitTitle}</h3>
                    <p className="text-sm text-muted-foreground">{content.successHabit}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Debt tip */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <Card className="border-destructive/20">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="bg-destructive/10 rounded-full p-2 mt-0.5">
                    <Lightbulb className="text-destructive" size={18} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-foreground mb-1">{content.debtTipTitle}</h3>
                    <p className="text-sm text-muted-foreground">{content.debtTip}</p>
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
                    <BookOpen className="text-foreground/60" size={18} />
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
