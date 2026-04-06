import { Phone, Mail, MapPin } from "lucide-react";
import logo from "@/assets/logo.png";

export const StoreFooter = () => {
  return (
    <footer className="bg-secondary/50 border-t border-border mt-16">
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <img src={logo} alt="Still Informática" className="h-8 w-8 rounded-lg object-cover" />
              <span className="font-bold text-foreground">Still Informática</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Referência em soluções de informática desde 2005. Especializada em computadores gamer e componentes de alta performance.
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-foreground mb-3">Links Rápidos</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><a href="/" className="hover:text-primary transition-colors">Todos os Produtos</a></li>
              <li><a href="/?q=pc+gamer" className="hover:text-primary transition-colors">PCs Gamers</a></li>
              <li><a href="/?q=componente" className="hover:text-primary transition-colors">Componentes</a></li>
              <li><a href="/?q=monitor" className="hover:text-primary transition-colors">Monitores</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-foreground mb-3">Contato</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2"><Phone className="h-4 w-4" /> (11) 98259-6096</li>
              <li className="flex items-center gap-2"><Mail className="h-4 w-4" /> stillinformatica@stillinformatica.com.br</li>
              <li className="flex items-center gap-2"><MapPin className="h-4 w-4" /> Rua Gopouva 845, AP 5 - Guarulhos, SP</li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-foreground mb-3">Atendimento</h4>
            <p className="text-sm text-muted-foreground mb-3">
              Tire suas dúvidas e faça seu pedido pelo WhatsApp!
            </p>
            <a
              href="https://wa.me/5511982596096"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Falar no WhatsApp
            </a>
          </div>
        </div>

        <div className="border-t border-border mt-8 pt-6 text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} Still Informática. Todos os direitos reservados.
        </div>
      </div>
    </footer>
  );
};
