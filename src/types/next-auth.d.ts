import type { Role } from "@prisma/client";
import "next-auth";
import "next-auth/jwt";

/**
 * El `organizationId` viaja en la sesión porque de él sale el contexto de
 * tenant de cada petición. `PLATFORM_ADMIN` lo tiene en null: no pertenece a
 * ningún comercio y opera en modo plataforma, siempre de forma explícita.
 */
declare module "next-auth" {
  interface User {
    id: string;
    role: Role;
    username: string;
    organizationId: string | null;
    tokenVersion: number;
  }

  interface Session {
    user: {
      id: string;
      name: string;
      role: Role;
      username: string;
      organizationId: string | null;
    };
    loginAt?: number;
    tokenVersion?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    username: string;
    organizationId: string | null;
    tokenVersion: number;
    loginAt: number;
  }
}
