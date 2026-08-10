"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Reactividad pragmática del stack: re-renderiza los server components de la
 * ruta cuando la pestaña recupera el foco y, si se pide, cada `intervaloMs`
 * mientras esté visible. La frescura máxima posible ya la acota el ciclo de
 * 15s del gateway, así que sondear le empata a un push sin WebSockets — y de
 * paso las pestañas abiertas dejan de quedarse semanas con un build fantasma
 * (el «Failed to find Server Action» que se comió unas subidas el 2026-08-10).
 *
 * `router.refresh()` NO toca el estado de los client components: los
 * formularios a medio llenar sobreviven el refresco.
 */
export default function AutoRefresco({ intervaloMs }: { intervaloMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const alVolver = () => {
      if (!document.hidden) router.refresh();
    };
    window.addEventListener("focus", alVolver);
    document.addEventListener("visibilitychange", alVolver);

    const timer = intervaloMs
      ? setInterval(() => {
          if (!document.hidden) router.refresh();
        }, intervaloMs)
      : undefined;

    return () => {
      window.removeEventListener("focus", alVolver);
      document.removeEventListener("visibilitychange", alVolver);
      if (timer) clearInterval(timer);
    };
  }, [router, intervaloMs]);

  return null;
}
