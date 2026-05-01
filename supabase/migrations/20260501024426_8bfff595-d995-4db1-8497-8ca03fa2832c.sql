-- Função para disparar e-mail de envio
CREATE OR REPLACE FUNCTION public.notify_order_shipping()
RETURNS TRIGGER AS $$
BEGIN
  -- Verifica se o status mudou para 'SHIPPED' (ou 'ENVIADO')
  IF (NEW.status = 'SHIPPED' OR NEW.status = 'ENVIADO') AND (OLD.status IS NULL OR OLD.status != NEW.status) THEN
    PERFORM
      net.http_post(
        url := (SELECT value FROM (SELECT current_setting('app.settings.supabase_url', true) AS value)) || '/functions/v1/send-email',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (SELECT value FROM (SELECT current_setting('app.settings.service_role_key', true) AS value))
        ),
        body := jsonb_build_object(
          'to', NEW.customer_email,
          'subject', 'Seu pedido foi enviado! - Still Informatica',
          'html', '<h1>Boa notícia!</h1><p>Seu pedido <strong>' || NEW.reference_id || '</strong> foi postado e está a caminho.</p><p>Em breve você poderá acompanhar o rastreamento.</p><br><p>Equipe Still Informatica</p>'
        )
      );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Gatilho na tabela orders
DROP TRIGGER IF EXISTS on_order_shipped ON public.orders;
CREATE TRIGGER on_order_shipped
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_order_shipping();