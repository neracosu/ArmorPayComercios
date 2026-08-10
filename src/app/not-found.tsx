import Link from "next/link";

/**
 * 404 con la marca y en español — antes caía en la página en inglés de Next,
 * que frente a un comercio parecía un sistema roto.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <p className="font-display text-base font-bold tracking-tight text-tinta">
        Armor<span className="text-marca-700">Pay</span>
      </p>
      <h1 className="mt-6 font-display text-3xl font-bold tracking-tight text-tinta">
        Esta página no existe
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-tinta-tenue">
        El enlace puede estar mal escrito o la página ya no está. Nada de tu
        operación se perdió.
      </p>
      <Link
        href="/inicio"
        className="mt-6 rounded-control bg-marca-700 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-marca-900"
      >
        Ir a mi panel
      </Link>
      <Link href="/" className="mt-3 text-sm text-tinta-tenue hover:text-tinta">
        o volver a la portada
      </Link>
    </main>
  );
}
