import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import prisma from "@/lib/prisma";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: "openid email profile https://www.googleapis.com/auth/gmail.modify",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        if (!ADMIN_PASSWORD) {
          throw new Error("ADMIN_PASSWORD not configured");
        }
        if (credentials?.password === ADMIN_PASSWORD) {
          return {
            id: "admin",
            name: credentials.username || "admin",
            email: "admin@example.com",
          };
        }
        return null;
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/auth/signin",
  },
  events: {
    // When connecting Google, persist tokens into EmailAccount and ensure a User exists.
    async signIn({ user, account }) {
      if (account?.provider === "google") {
        const email = account.email || user.email;
        if (!email) return;

        const dbUser = await prisma.user.upsert({
          where: { email },
          update: {},
          create: { email },
        });

        await prisma.emailAccount.upsert({
          where: {
            userId_provider: {
              userId: dbUser.id,
              provider: "google",
            },
          },
          create: {
            userId: dbUser.id,
            provider: "google",
            emailAddress: email,
            accessToken: account.access_token ?? null,
            refreshToken: account.refresh_token ?? null,
            expiresAt: account.expires_at
              ? new Date(account.expires_at * 1000)
              : null,
            scope: account.scope ?? null,
            tokenType: account.token_type ?? null,
          },
          update: {
            // Only overwrite fields we actually received in this sign-in event.
            ...(account.access_token ? { accessToken: account.access_token } : {}),
            ...(account.refresh_token ? { refreshToken: account.refresh_token } : {}),
            ...(typeof account.expires_at === "number"
              ? { expiresAt: new Date(account.expires_at * 1000) }
              : {}),
            ...(account.scope ? { scope: account.scope } : {}),
            ...(account.token_type ? { tokenType: account.token_type } : {}),
          },
        });
      }
    },
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.name = user.name;
        token.email = user.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.name = token.name;
        session.user.email = token.email as string;
      }
      return session;
    },
  },
};


