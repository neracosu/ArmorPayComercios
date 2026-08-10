import { Mail, MessageCircle } from "lucide-react";
import { SOPORTE_EMAIL, SOPORTE_WHATSAPP_URL } from "@/lib/soporte";

/**
 * El canal de soporte, listo para pegar en cualquier página (server
 * component). `compacto` = solo los links en línea; sin él, una tarjeta.
 */
export default function ContactoSoporte({ compacto = false }: { compacto?: boolean }) {
  const links = (
    <span className="inline-flex flex-wrap items-center gap-x-4 gap-y-1">
      <a
        href={`mailto:${SOPORTE_EMAIL}`}
        className="inline-flex items-center gap-1.5 font-medium text-marca-700 hover:underline"
      >
        <Mail className="h-3.5 w-3.5" aria-hidden />
        {SOPORTE_EMAIL}
      </a>
      {SOPORTE_WHATSAPP_URL && (
        <a
          href={SOPORTE_WHATSAPP_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 font-medium text-marca-700 hover:underline"
        >
          <MessageCircle className="h-3.5 w-3.5" aria-hidden />
          WhatsApp
        </a>
      )}
    </span>
  );

  if (compacto) return links;

  return (
    <div className="rounded-card border border-tinta-borde bg-white p-5">
      <p className="text-sm font-semibold text-tinta">¿Necesitas ayuda?</p>
      <p className="mt-1 text-sm leading-relaxed text-tinta-tenue">
        Escríbenos y te respondemos: {links}
      </p>
    </div>
  );
}
