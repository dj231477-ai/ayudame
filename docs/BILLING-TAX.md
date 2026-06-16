# Facturación e impuestos (proceso) — SPEC §C-21

> Artefacto de **proceso** (no código). Documenta la configuración operativa/legal de la SAS
> colombiana. El código aplica `automatic_tax` en el checkout (`apps/flowday/lib/billing.ts`).

## Stripe

- **Stripe Tax** activado: el checkout usa `automatic_tax: { enabled: true }` ⇒ Stripe calcula
  IVA 19% para clientes Colombia y 0% para exportación de servicios digitales (§C-21.3/§C-21.5).
- Stripe es la **autoridad** del estado de suscripción y compras (AR-5); la app refleja el estado
  vía webhook (`/api/v1/billing/webhook`, §C-12.4).
- Configura los `STRIPE_PRICE_ID_*` (§C-24.2): starter/growth/power (one-time), pro mensual/anual,
  team (precio por asiento, recurrente).

## DIAN (facturación electrónica)

- Habilitación previa en `catalogo-vpfe.dian.gov.co` (software gratuito DIAN, ~30 min con RUT) (§C-21.4).
- Clientes Colombia → factura con IVA 19%. Internacionales → factura de exportación (IVA 0%).
- Plan Free → sin factura (no hay transacción).
- Migración futura a Alegra/Siigo cuando el volumen lo justifique.

## Flujo del dinero (§C-21.2)

```
Usuario paga (USD/EUR/COP) → Stripe (−2.9% −$0.30)
  → saldo Stripe USD (pagar APIs sin convertir)
  → giro a Nequi Empresas (COP al TRM)
  → DIAN: IVA (bimestral), ICA (bimestral), Renta (anual)
```

## Impuestos (§C-21.3)

| Impuesto | Tasa | Nota |
|---|---|---|
| IVA Colombia | 19% | bimestral (Stripe Tax lo calcula) |
| IVA internacional | 0% | exportación de servicios digitales |
| Renta corporativa | 35% | sobre utilidad neta |
| ICA (Barranquilla) | ~4.14‰ | verificar tarifa vigente |
