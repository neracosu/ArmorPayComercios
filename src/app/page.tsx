/**
 * Marcador de posición. La identidad visual todavía no está construida:
 * la dirección de diseño (inspirada en Nequi, con las restricciones de un
 * panel de caja) está definida en el plan del proyecto y se implementa junto
 * con el panel operativo.
 */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-6">
      <p className="text-sm font-medium uppercase tracking-widest text-slate-500">ArmorPay</p>
      <h1 className="text-3xl font-semibold tracking-tight">
        Plataforma de validación de pagos
      </h1>
      <p className="text-slate-600">
        Confirmá en segundos que el pago móvil llegó a tu cuenta, con control por caja,
        turnos y cierre. En construcción.
      </p>
    </main>
  );
}
