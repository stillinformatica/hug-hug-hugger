I will help you set up PagBank production and fix the AI tips error.

### 1. PagBank Production Setup
To move to production, you need to update your credentials and generate a public key:

*   **Update Token:** Go to the project settings (Secrets) and update `PAGBANK_TOKEN` with the production token you generated in iBanking.
*   **Public Key:** I've created a new function to generate the required production public key. Once you update the token, I will run it for you.
*   **Production Test:** We will perform a real transaction test to generate the logs requested by PagBank.

### 2. Fix AI Tips Error (400)
The error you saw ("Falha na IA: 400") is likely due to an invalid model name in the tips functions. I will update them to use a stable model.

### Technical Details
*   Deploying `pagbank-public-key` edge function to fetch the production public key.
*   Updating `marriage-tips` and `growth-tips` edge functions to use `google/gemini-2.0-flash` instead of the non-existent version.
*   Updating `Checkout.tsx` logic if needed (currently it uses redirect checkout which is simpler for production validation).

### Steps to follow:
1.  **Update the `PAGBANK_TOKEN`** in your project settings.
2.  I will then generate the public key and we can perform the test purchase.
