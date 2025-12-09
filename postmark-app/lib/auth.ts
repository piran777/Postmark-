import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

export const authOptions: NextAuthOptions = {
  providers: [
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


