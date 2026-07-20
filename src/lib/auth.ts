import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { normalizeUsername } from "./username";

/**
 * Autenticación por usuario y contraseña, con el comercio incorporado.
 *
 * Las cajas son PCs fijas: sesión deslizante de 30 días que se renueva con el
 * uso, para que una caja activa no vuelva a tipear la contraseña. Los roles
 * administrativos NO heredan esa sesión larga — el guardián los corta a las 8 h
 * (ver `session-guard.ts`).
 *
 * Usa un cliente Prisma SIN la extensión de tenant a propósito: el login ocurre
 * ANTES de que exista contexto de tenant, y es justamente donde se averigua a
 * qué comercio pertenece quien entra. Es la única lectura legítima de `User`
 * sin contexto, y por eso está acotada a buscar por `username`.
 */
const authDb = new PrismaClient();

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Usuario", type: "text" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null;

        const user = await authDb.user.findUnique({
          where: { username: normalizeUsername(credentials.username) },
          include: { organization: { select: { status: true, razonSocial: true } } },
        });
        if (!user || !user.isActive) return null;

        const ok = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!ok) return null;

        // Un comercio suspendido no opera, por más que la caja tenga credenciales.
        if (user.organization && user.organization.status === "SUSPENDIDA") return null;

        return {
          id: user.id,
          name: user.name,
          role: user.role,
          username: user.username,
          organizationId: user.organizationId,
          tokenVersion: user.tokenVersion,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // Solo en el sign-in inicial. `loginAt` no se puede derivar de `iat`: el
      // token se re-emite en cada renovación deslizante y perdería la edad real.
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.username = user.username;
        token.organizationId = user.organizationId;
        token.tokenVersion = user.tokenVersion;
        token.loginAt = Math.floor(Date.now() / 1000);
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.username = token.username ?? "";
        session.user.organizationId = token.organizationId ?? null;
      }
      session.loginAt = token.loginAt;
      session.tokenVersion = token.tokenVersion;
      return session;
    },
  },
};
