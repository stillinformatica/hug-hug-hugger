import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink, Image as ImageIcon } from "lucide-react";

const ScreenshotsGallery = () => {
  const screenshots = [
    {
      id: 1,
      title: "1. Seleção de Produto (Home)",
      url: "https://f2bdd63e-a4db-47cf-b66e-ab3313dd4f64.lovableproject.com/tool-results://screenshots/20260505-214830-824878.png",
      description: "Visualização da página inicial com a listagem de produtos."
    },
    {
      id: 2,
      title: "2. Página do Produto",
      url: "https://f2bdd63e-a4db-47cf-b66e-ab3313dd4f64.lovableproject.com/tool-results://screenshots/20260505-214842-179644.png",
      description: "Detalhes do produto selecionado antes de adicionar ao carrinho."
    },
    {
      id: 3,
      title: "3. Carrinho Lateral",
      url: "https://f2bdd63e-a4db-47cf-b66e-ab3313dd4f64.lovableproject.com/tool-results://screenshots/20260505-214906-627821.png",
      description: "Resumo do pedido no painel lateral do carrinho."
    },
    {
      id: 4,
      title: "4. Checkout com Erro Total Express",
      url: "https://f2bdd63e-a4db-47cf-b66e-ab3313dd4f64.lovableproject.com/tool-results://screenshots/20260505-215023-710407.png",
      description: "Tela final de checkout exibindo o erro de bloqueio de IP da Total Express."
    }
  ];

  const downloadAll = () => {
    // In a real browser environment, we would trigger multiple downloads or a zip
    // For this simulation, we'll provide the logic
    screenshots.forEach(s => {
      const link = document.createElement('a');
      link.href = s.url;
      link.download = `passo-a-passo-${s.id}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="w-6 h-6" />
            Galeria de Capturas de Tela - Integração Total Express
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">
            Abaixo estão as imagens do processo de checkout documentando o erro de conexão com o webservice da Total Express.
          </p>
          <Button onClick={downloadAll} className="flex items-center gap-2">
            <Download className="w-4 h-4" />
            Baixar Todas as Imagens
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {screenshots.map((s) => (
          <Card key={s.id} className="overflow-hidden">
            <CardHeader className="bg-muted/50 p-4">
              <CardTitle className="text-lg">{s.title}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="aspect-video relative bg-slate-100 flex items-center justify-center border-b">
                <img 
                  src={s.url} 
                  alt={s.title}
                  className="max-h-full object-contain"
                  onError={(e) => {
                    e.currentTarget.src = "https://placehold.co/600x400?text=Captura+de+Tela";
                  }}
                />
              </div>
              <div className="p-4 flex justify-between items-center">
                <p className="text-sm text-muted-foreground italic">{s.description}</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <a href={s.url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </Button>
                  <Button size="sm" asChild>
                    <a href={s.url} download={`screenshot-${s.id}.png`}>
                      <Download className="w-4 h-4" />
                    </a>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default ScreenshotsGallery;
