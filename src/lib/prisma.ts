import { PrismaClient } from "@prisma/client";

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
