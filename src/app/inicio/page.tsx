import { redirect } from "next/navigation";
import { getVerifiedSession } from "@/lib/session-guard";

export const dynamic = "force-dynamic";

/**
 * Aterrizaje único tras el login: cada rol a su casa. El dueño entra a VER
 * cómo va el negocio (/comercio), no a la pantalla de cobrar — cobrar sigue
 * a un clic para el que también atiende caja.
 */
export default async function InicioPage() {
  const session = await getVerifiedSession();
  if (!session) redirect("/login");

  switch (session.user.role) {
    case "PLATFORM_ADMIN":
      redirect("/plataforma");
    case "PLATFORM_REVIEWER":
      redirect("/plataforma/comercios");
    case "ORG_ADMIN":
      redirect("/comercio");
    default:
      redirect("/validar");
  }
}
