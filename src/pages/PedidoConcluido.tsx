import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PedidoConcluido() {
  const [params] = useSearchParams();
  const reference = params.get("reference_id") || params.get("charge_id") || params.get("id");

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="max-w-md w-full text-center space-y-6">
        <CheckCircle2 className="w-16 h-16 text-green-600 mx-auto" />
        <h1 className="text-2xl font-bold">Pedido recebido!</h1>
        <p className="text-muted-foreground">
          Obrigado pela sua compra. Assim que o pagamento for confirmado pelo PagBank,
          você receberá um e-mail com os detalhes e o código de rastreio.
        </p>
        {reference && (
          <p className="text-sm text-muted-foreground">
            Referência: <strong>{reference}</strong>
          </p>
        )}
        <Button asChild>
          <Link to="/">Voltar para a loja</Link>
        </Button>
      </div>
    </main>
  );
}
