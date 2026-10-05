# Corrigir os riscos de segurança do site

## Objetivo
Eliminar vulnerabilidades exploráveis no acesso administrativo, pagamentos, e-mails, frete, sincronização de produtos, banco e dependências, sem interromper a compra pública.

## Etapas
1. Remover o mecanismo inseguro que cria/promove administrador com senha fixa e impedir qualquer elevação de privilégio pelo navegador.
2. Exigir autenticação e função de administrador nas operações privilegiadas: geração de etiqueta, envio manual de e-mail e limpeza/sincronização de produtos.
3. Endurecer o checkout público: validar e limitar todos os campos, recalcular produtos e preços no servidor e não devolver dados internos ou chaves desnecessárias.
4. Validar notificações do PagBank consultando o pagamento diretamente no provedor antes de atualizar pedidos, evitando confirmações falsas.
5. Restringir permissões do banco e execução de funções sensíveis, mantendo leitura pública somente do catálogo.
6. Atualizar dependências vulneráveis para versões corrigidas e preservar compatibilidade.
7. Ativar proteções de senha vazada e exigência da senha atual para alterações.
8. Executar testes, auditorias de dependências, banco e segurança novamente; corrigir qualquer falha restante.

## Detalhes técnicos
- A autenticação administrativa continuará baseada em `user_roles` e políticas do banco.
- Funções públicas necessárias ao checkout terão validação Zod, limites de payload e respostas sem detalhes sensíveis.
- Webhooks serão tratados como entrada não confiável e confirmados contra a API PagBank.
- As funções de banco com privilégios elevados terão `EXECUTE` revogado de usuários anônimos e liberado apenas ao papel estritamente necessário.
