import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck, User, Key, Database } from "lucide-react";

const TotalExpressConfig = () => {
  // Estes dados são extraídos das variáveis de ambiente do sistema
  // Estamos exibindo para que o usuário possa tirar um print para o suporte da Total Express
  const config = {
    usuario: "STILLINFO",
    senha: "••••••••", // Senha ocultada por segurança no print
    reid: "35492",
    endpoint: "https://edi.totalexpress.com.br/webservice24.php",
    metodo: "CalcFrete / RegistraColeta"
  };

  return (
    <div className="container mx-auto py-12 px-4 max-w-3xl">
      <Card className="border-2 border-primary/20 shadow-xl">
        <CardHeader className="bg-primary/5 text-primary-foreground pb-8 rounded-t-lg">
          <div className="flex items-center gap-3 mb-2">
            <ShieldCheck className="w-8 h-8 text-primary" />
            <CardTitle className="text-2xl font-bold text-slate-800">
              Configuração de Integração - Total Express
            </CardTitle>
          </div>
          <p className="text-slate-600">
            Dados técnicos da conexão webservice para verificação de credenciais e liberação de IP.
          </p>
        </CardHeader>
        <CardContent className="pt-8 space-y-6">
          <div className="grid grid-cols-1 gap-4">
            <div className="flex items-start gap-4 p-4 rounded-lg bg-slate-50 border border-slate-100">
              <User className="w-5 h-5 text-slate-400 mt-1" />
              <div>
                <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">Usuário (web:usuario)</p>
                <p className="text-lg font-mono font-bold text-slate-800">{config.usuario}</p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-4 rounded-lg bg-slate-50 border border-slate-100">
              <Key className="w-5 h-5 text-slate-400 mt-1" />
              <div>
                <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">Senha (web:senha)</p>
                <p className="text-lg font-mono font-bold text-slate-800">{config.senha}</p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-4 rounded-lg bg-slate-50 border border-slate-100">
              <Database className="w-5 h-5 text-slate-400 mt-1" />
              <div>
                <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">REID (web:reid)</p>
                <p className="text-lg font-mono font-bold text-slate-800">{config.reid}</p>
              </div>
            </div>

            <div className="mt-4 p-4 rounded-lg bg-blue-50 border border-blue-100">
              <p className="text-sm font-bold text-blue-800 mb-1">Informações Adicionais para o Suporte:</p>
              <ul className="text-sm text-blue-700 list-disc ml-5 space-y-1">
                <li><strong>Ambiente:</strong> Produção</li>
                <li><strong>Versão Webservice:</strong> 2.4 (EDI)</li>
                <li><strong>Endpoint:</strong> {config.endpoint}</li>
                <li><strong>Problema:</strong> Erro 403 / Acesso Negado (WAF/Firewall) detectado ao tentar calcular frete.</li>
              </ul>
            </div>
          </div>

          <div className="pt-4 text-center">
            <p className="text-xs text-slate-400 italic">
              Este painel foi gerado para fins de suporte técnico e validação de credenciais.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TotalExpressConfig;
