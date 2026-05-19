I will fix the integration with Melhor Envio so that orders correctly appear in their dashboard after a purchase.

### Changes:

#### Frontend
- Update `src/pages/Checkout.tsx` to include the selected shipping service ID in the order data sent to the payment process. This ensures the backend knows which carrier service was chosen (e.g., Sedex, PAC, etc.).

#### Backend (Edge Functions)
- **`calculate-shipping`**:
    - Fix the product price mapping to use the correct field (`unit_amount`), preventing the "invalid monetary value" error from Melhor Envio.
    - Update the service selection to use the ID chosen by the customer.
    - Default to a reasonable service ID if none is provided.
- **`mercadopago-webhook`**:
    - Update log messages to correctly reflect "Melhor Envio" instead of "Total Express".

### Technical Details:
- The `unitary_value` error was caused by the function looking for `item.price` while the database stores it as `item.unit_amount`.
- Passing the `shipping_service_id` from the frontend to the backend will ensure the correct label is generated.
