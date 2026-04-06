import { Link, useNavigate } from "react-router-dom";
import { Search, Menu, X, User, LogOut, Shield } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CartDrawer } from "./CartDrawer";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import logo from "@/assets/logo.png";

interface StoreHeaderProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

const navLinks = [
  { label: "Todos", href: "/" },
  { label: "Computadores Montados", href: "/?q=computadores+montados" },
  { label: "Eletrônicos", href: "/?q=eletronicos" },
  { label: "Fontes", href: "/?q=fontes" },
  { label: "Gabinetes", href: "/?q=gabinetes" },
  { label: "Kit Placa-Mãe + Processador", href: "/?q=kit+placa+mae+processador" },
  { label: "Memórias", href: "/?q=memorias" },
  { label: "Notebooks Peças", href: "/?q=notebooks+pecas" },
  { label: "Notebooks Usados", href: "/?q=notebooks+usados" },
  { label: "Periféricos", href: "/?q=perifericos" },
  { label: "Placa de Vídeo", href: "/?q=placa+de+video" },
  { label: "Placa-mãe", href: "/?q=placa+mae" },
  { label: "Processador", href: "/?q=processador" },
  { label: "Segurança", href: "/?q=seguranca" },
  { label: "SSDs e HDs", href: "/?q=ssds+e+hds" },
];

export const StoreHeader = ({ searchQuery, onSearchChange }: StoreHeaderProps) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16 gap-4">
          <Link to="/" className="flex items-center gap-3 shrink-0">
            <img src={logo} alt="Still Informática" className="h-10 w-10 rounded-lg object-cover" />
            <div className="hidden sm:block">
              <h1 className="text-lg font-bold text-foreground leading-tight">Still Informática</h1>
              <p className="text-xs text-muted-foreground">Soluções em tecnologia desde 2005</p>
            </div>
          </Link>

          <div className="flex-1 max-w-xl hidden md:block">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar produtos..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="pl-10 bg-secondary border-border rounded-xl h-10"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="rounded-xl">
                    <User className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <div className="px-2 py-1.5 text-sm text-muted-foreground truncate">
                    {user.email}
                  </div>
                  <DropdownMenuSeparator />
                  {isAdmin && (
                    <DropdownMenuItem onClick={() => navigate("/admin")} className="gap-2 cursor-pointer">
                      <Shield className="h-4 w-4" /> Painel Admin
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={signOut} className="gap-2 cursor-pointer text-destructive">
                    <LogOut className="h-4 w-4" /> Sair
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button variant="outline" size="sm" className="rounded-xl gap-2" onClick={() => navigate("/auth")}>
                <User className="h-4 w-4" /> Entrar
              </Button>
            )}
            <CartDrawer />
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        <nav className="hidden md:flex items-center gap-1 pb-2 -mt-1 overflow-x-auto scrollbar-hide">
          {navLinks.map((link) => (
            <Link
              key={link.label}
              to={link.href}
              className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden border-t border-border bg-background p-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar produtos..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-10 bg-secondary border-border rounded-xl h-10"
            />
          </div>
          <div className="flex flex-col gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.label}
                to={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-primary rounded-lg transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </header>
  );
};
