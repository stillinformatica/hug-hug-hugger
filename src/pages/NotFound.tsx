import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="text-center max-w-md animate-in fade-in zoom-in duration-300">
        <h1 className="mb-4 text-7xl font-extrabold text-primary">404</h1>
        <h2 className="mb-4 text-2xl font-bold tracking-tight">Página não encontrada</h2>
        <p className="mb-8 text-muted-foreground leading-relaxed">
          A página que você está procurando não existe ou foi movida.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link 
            to="/screenshots" 
            className="inline-flex items-center justify-center rounded-md bg-primary px-8 py-3 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
          >
            Ver fotos dos erros
          </Link>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
