import { PrismaClient } from "@prisma/client";

// Re-export HAS_DB so call sites can do:
//   import { prisma, HAS_DB } from "@/lib/prisma";
export { HAS_DB } from "./env";

declare const globalThis: {
  prismaGlobal: PrismaClient;
} & typeof global;

function createPrismaClient(): PrismaClient {
  return new PrismaClient();
}

// Safe: PrismaClient constructor does not throw when DATABASE_URL is missing.
// Queries will throw — but all query call sites are guarded by HAS_DB checks.
export const prisma: PrismaClient =
  globalThis.prismaGlobal ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalThis.prismaGlobal = prisma;
