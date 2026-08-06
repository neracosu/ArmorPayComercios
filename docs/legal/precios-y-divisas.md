# Precios en divisas y la norma venezolana — investigación 2026-08-06

> Investigación hecha a pedido de Neri para que el checkout (web, `/pay`, plugin
> WooCommerce, tasa BCV por API) no roce ninguna norma de marcaje de precios.
> **No es opinión legal**: es el insumo para los abogados del gate G0. Fuentes al pie.

## Lo que dice la norma (estado 2025-2026)

1. **Referenciar precios en moneda extranjera es LEGAL** (Art. 128 de la Ley del
   BCV + Convenio Cambiario N° 1 de 2018), con dos condiciones: la conversión a
   bolívares se hace a la **tasa oficial del BCV del día**, y se informa con
   claridad **qué moneda y qué tasa** se aplican.
2. **El bolívar tiene que estar exhibido.** La obligación de expresar los
   precios en Bs aplica también a medios electrónicos y tiendas en línea.
3. **Lo que se sanciona** (SUNDDE en fiscalización activa durante 2025):
   - usar una tasa **paralela** para fijar precios o facturar (multas, cierres, y
     hasta vía penal por especulación/usura);
   - **precios distintos según la moneda de pago** (el descuento «solo si pagas
     en dólares» está siendo sancionado);
   - promociones expresadas únicamente en divisas;
   - fijar el precio en una divisa y cobrar la conversión con la tasa de OTRA (p. ej.
     fijar en USD y cobrar a tasa del euro).
4. SUNDDE publicó un **formato obligatorio (con QR) para divulgar la tasa BCV**
   en los comercios — la transparencia de la tasa es parte del cumplimiento.
5. Sobre el «REF»: es la costumbre comercial para no escribir «$». La norma no
   pide esconder la moneda — pide **transparencia**: Bs visible y, si se muestra
   la divisa, con su nombre y su tasa BCV declarados. Un «REF» mudo es MENOS
   transparente que un «USD … · tasa BCV …» explícito.

## Cómo cumple el producto (verificado contra el código)

| Punto de la norma | Cómo lo cumplimos |
|---|---|
| El precio en Bs exhibido | En `/pay` el monto en **Bs es el héroe**; el USD es referencia secundaria. |
| Moneda y tasa declaradas | La línea dice «Ref. USD 25,00 · tasa oficial BCV 755,9001» — nunca un `$` suelto ni una tasa muda. |
| Tasa oficial, jamás paralela | `src/lib/bcv.ts` solo consume el valor BCV; sin fuente utilizable hay **error explícito**, nunca una tasa inventada. |
| Demostrar qué tasa se usó | `ExchangeRate` es historial-auditoría: cada intent en USD guarda `exchangeRateUsed` + `exchangeRateId`. |
| Mismo precio en cualquier método | Cobramos **solo en bolívares** (pago móvil/C2P son VES): no hay precio-según-moneda posible, y el flujo no toca IGTF de divisas. |
| El carrito fija precios con la misma tasa | `GET /api/v1/exchange-rate` expone la tasa BCV al integrador — cero incentivo a usar una paralela. |

## Lo que queda del lado del comercio (decirlo en las docs, no asumirlo)

- Si su tienda muestra precios en USD, **debe mostrar también el Bs a tasa BCV**
  (nuestro `/pay` lo resuelve en el paso de pago; su catálogo es su
  responsabilidad — puede usar nuestro endpoint de tasa).
- Nada de precios distintos por método de pago ni promociones solo-divisa.
- El formato SUNDDE de divulgación de tasa aplica a su establecimiento.

## Fuentes (consultadas 2026-08-06)

- [El Nacional — Consecomercio: es legal fijar precios usando cualquier moneda publicada por el BCV](https://www.elnacional.com/2025/06/consecomercio-es-legal-fijar-precios-usando-cualquier-moneda-publicada-por-el-bcv/)
- [Efecto Cocuyo — No es ilegal referenciar precios en euros, pero debe ser acorde con las tasas del BCV](https://efectococuyo.com/economia/no-es-ilegal-referenciar-precios-en-euros-pero-debe-ser-acorde-a-las-tasas-del-bcv/)
- [Nayma Consultores — Uso de divisas en Venezuela: claves legales](https://naymaconsultores.com/precios-en-moneda-extranjera-en-venezuela-que-permite-la-ley/)
- [Alliot Group — Fijación de precios en moneda extranjera](https://alliottve.com/publicaciones/https-alliottve-com-precios-moneda-extranjera-comerciantes/)
- [Banca y Negocios — SUNDDE inicia despliegue para vigilar uso del dólar BCV](https://www.bancaynegocios.com/sundde-inicia-despliegue-activo-en-el-pais-para-vigilar-uso-del-dolar-bcv-en-los-comercios/)
- [El Informador — SUNDDE reitera ilegalidad de promociones en divisas y supervisa cobro a tasa BCV](https://elinformadorve.com/27/02/2025/destacada/sundde-reitera-ilegalidad-de-promociones-en-divisas-y-supervisa-cobro-a-tasa-bcv/)
- [Globovisión — SUNDDE publicó formato obligatorio para divulgar la tasa BCV](https://www.globovision.com/nacional/49077/sundde-publico-nuevo-formato-obligatorio-para-divulgar-la-tasa-oficial-del-bcv-en-los-comercios)
- [El Estímulo — SUNDDE visita comercios para vigilar que precios se fijen a dólar BCV](https://elestimulo.com/elinteres/de-interes/2025-03-31/sundde-precios-dolar-bcv/)
- [2001 — SUNDDE sanciona a locales que venden más económico si se paga solo en dólares](https://2001online.com/comunidad/sundde-sanciona-a-locales-que-venden-mas-economico-si-se-paga-solo-en-dolares-202522410360)
- [BCV — Precios de productos y servicios deben exhibirse (aplica a mecanismos electrónicos)](https://www.bcv.org.ve/notas-de-prensa/precios-de-productos-y-servicios-deben-exhibirse-en-la-nueva-escala-monetaria)
