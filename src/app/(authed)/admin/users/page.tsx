// /admin/users — searchable + role-filterable user table.
//
// Search and role-filter pills are driven by URL search params so each
// keystroke / pill click is a server round-trip (simple, no client state
// to manage). The Set-role select is a small client component that
// PATCHes /api/admin/users/[id] and refreshes.

import Link from "next/link";
import { Prisma, Role } from "@prisma/client";

import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { RoleSelect } from "./RoleSelect";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const VALID_ROLES = new Set<string>(Object.values(Role));

interface SP {
  q?: string;
  role?: string;
  offset?: string;
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await requireRole("ADMIN");

  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const roleFilter =
    sp.role && VALID_ROLES.has(sp.role) ? (sp.role as Role) : null;
  const offsetRaw = Number.parseInt(sp.offset ?? "0", 10);
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;

  const where: Prisma.UserWhereInput = {};
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
    ];
  }
  if (roleFilter) where.role = roleFilter;

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: offset,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        state: true,
        createdAt: true,
        lastLoginAt: true,
        emailVerifiedAt: true,
      },
    }),
    prisma.user.count({ where }),
  ]);

  function pillHref(role: Role | null): string {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (role) params.set("role", role);
    return `/admin/users${params.toString() ? `?${params.toString()}` : ""}`;
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-wider text-[#94a3b8]">
          Admin
        </p>
        <h1 className="text-3xl font-bold mt-1">Users</h1>
      </header>

      <form className="flex items-center gap-3" action="/admin/users" method="get">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Search name or email"
          className="bg-[#ffffff] border border-[#e5e7eb] rounded-lg px-3 py-2 text-sm text-[#0f172a] w-72"
        />
        {roleFilter && (
          <input type="hidden" name="role" value={roleFilter} />
        )}
        <button
          type="submit"
          className="px-3 py-2 rounded-lg bg-[#dc2626] text-[#ffffff] font-medium text-sm hover:bg-[#b91c1c]"
        >
          Search
        </button>
      </form>

      <div className="flex items-center gap-2 flex-wrap text-xs">
        <Link
          href={pillHref(null)}
          className={`px-3 py-1 rounded-full border ${
            roleFilter === null
              ? "bg-[#dc2626] text-[#ffffff] border-[#dc2626]"
              : "bg-[#ffffff] border-[#e5e7eb] text-[#475569] hover:text-[#0f172a]"
          }`}
        >
          All
        </Link>
        {Object.values(Role).map((role) => (
          <Link
            key={role}
            href={pillHref(role)}
            className={`px-3 py-1 rounded-full border ${
              roleFilter === role
                ? "bg-[#dc2626] text-[#ffffff] border-[#dc2626]"
                : "bg-[#ffffff] border-[#e5e7eb] text-[#475569] hover:text-[#0f172a]"
            }`}
          >
            {role}
          </Link>
        ))}
      </div>

      <p className="text-xs text-[#94a3b8]">
        {total} {total === 1 ? "user" : "users"}
        {q || roleFilter ? " matching filters" : ""}.
      </p>

      <div className="bg-[#ffffff] rounded-xl border border-[#e5e7eb] overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#ffffff] text-[#94a3b8]">
            <tr>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Role</Th>
              <Th>State</Th>
              <Th>Created</Th>
              <Th>Last login</Th>
              <Th>Verified</Th>
              <Th>Set role</Th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-8 text-center text-[#94a3b8]"
                >
                  No users match.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="border-t border-[#e5e7eb]">
                  <Td>{u.name}</Td>
                  <Td>{u.email}</Td>
                  <Td>{u.role}</Td>
                  <Td>{u.state}</Td>
                  <Td>{new Date(u.createdAt).toLocaleDateString()}</Td>
                  <Td>
                    {u.lastLoginAt
                      ? new Date(u.lastLoginAt).toLocaleDateString()
                      : "—"}
                  </Td>
                  <Td>{u.emailVerifiedAt ? "Yes" : "No"}</Td>
                  <Td>
                    <RoleSelect userId={u.id} currentRole={u.role} />
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {(offset > 0 || offset + users.length < total) && (
        <div className="flex items-center gap-2 text-sm">
          {offset > 0 && (
            <Link
              href={`/admin/users?${new URLSearchParams({
                ...(q ? { q } : {}),
                ...(roleFilter ? { role: roleFilter } : {}),
                offset: String(Math.max(0, offset - PAGE_SIZE)),
              }).toString()}`}
              className="px-3 py-1.5 rounded-lg bg-[#ffffff] border border-[#e5e7eb] text-[#475569]"
            >
              ← Previous
            </Link>
          )}
          {offset + users.length < total && (
            <Link
              href={`/admin/users?${new URLSearchParams({
                ...(q ? { q } : {}),
                ...(roleFilter ? { role: roleFilter } : {}),
                offset: String(offset + PAGE_SIZE),
              }).toString()}`}
              className="px-3 py-1.5 rounded-lg bg-[#ffffff] border border-[#e5e7eb] text-[#475569]"
            >
              Next →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-2 text-left text-xs uppercase tracking-wider font-medium">
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-2 text-[#0f172a]">{children}</td>;
}
