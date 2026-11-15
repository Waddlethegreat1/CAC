import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { checkContactField } from "./lib/contact";
import { callerFor, requireCaller } from "./lib/identity";
import {
  companyRole, companyView, eventSummary, fail, MAX_MEMBERSHIPS, membershipOf, MAX_ROWS, requireMember, requireVerified, slugify, toCompany, toEvent,
} from "./lib/connections";

const MAX_OWNED = 10;
const MAX_CLAIMABLE = 50;
const CLAIM_SCAN = 4000;
const CLAIM_LOOKBACK_MS = 365 * 86_400_000;
const CLAIM_LOOKAHEAD_MS = 365 * 86_400_000;

const hostSlugs = (event: Doc<"events">) => [...event.hosts, ...(event.organizer ? [event.organizer] : [])].map(slugify);
const MAX_MEMBERS = 100;
const MAX_PENDING_INVITES = 20;

function cleanUrl(raw: string | undefined, label: string) {
  if (raw === undefined || raw.trim() === "") return undefined;
  const text = raw.trim();
  let url: URL;
  try { url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`); } catch { return fail("invalid", `Enter a valid ${label} URL`); }
  if (url.protocol !== "https:" && url.protocol !== "http:") fail("invalid", `Enter a valid ${label} URL`);
  if (url.href.length > 300) fail("invalid", `Keep the ${label} URL under 300 characters`);
  return url.href;
}

export const create = mutation({
  args: { deviceId: v.string(), name: v.string(), website: v.optional(v.string()), logo: v.optional(v.string()) },
  returns: v.id("companies"),
  handler: async (ctx, { deviceId, name: rawName, website, logo }) => {
    const user = await requireCaller(ctx, deviceId);
    const name = rawName.trim().replace(/\s+/g, " ");
    if (/[\p{Cc}\p{Cf}]/u.test(name) || Array.from(name).length < 2 || Array.from(name).length > 80) fail("invalid", "Company names are 2 to 80 characters on one line");
    const slug = slugify(name);
    if (slug.length < 2) fail("invalid", "Company names need at least two letters or digits");
    if (await ctx.db.query("companies").withIndex("by_slug", (q) => q.eq("slug", slug)).unique()) fail("invalid", "A company with that name already exists");
    const owned = await ctx.db.query("company_members").withIndex("by_user", (q) => q.eq("userId", user._id)).take(MAX_MEMBERSHIPS);
    if (owned.length >= MAX_MEMBERSHIPS || owned.filter((m) => m.role === "owner").length >= MAX_OWNED) fail("rate_limited", `You can own at most ${MAX_OWNED} companies and join at most ${MAX_MEMBERSHIPS}`);
    const now = Date.now();
    const companyId = await ctx.db.insert("companies", {
      name, slug, createdAt: now,
      ...(cleanUrl(website, "website") ? { website: cleanUrl(website, "website") } : {}),
      ...(cleanUrl(logo, "logo") ? { logo: cleanUrl(logo, "logo") } : {}),
    });
    await ctx.db.insert("company_members", { companyId, userId: user._id, role: "owner", createdAt: now });
    return companyId;
  },
});

const inviteFor = (ctx: QueryCtx, companyId: Id<"companies">, email: string) =>
  ctx.db.query("company_invites").withIndex("by_company", (q) => q.eq("companyId", companyId).eq("email", email)).unique();

function normalizedEmail(raw: string) {
  const checked = checkContactField("email", raw);
  return "error" in checked ? fail("invalid", checked.error) : checked.value;
}

async function requireOwner(ctx: QueryCtx, companyId: Id<"companies">, userId: Id<"users">) {
  const membership = await requireMember(ctx, companyId, userId);
  if (membership.role !== "owner") fail("forbidden", "Only the company owner can do that");
  return membership;
}

export const invite = mutation({
  args: { deviceId: v.string(), companyId: v.id("companies"), email: v.string() },
  returns: v.null(),
  handler: async (ctx, { deviceId, companyId, email: raw }) => {
    const user = await requireCaller(ctx, deviceId);
    await requireOwner(ctx, companyId, user._id);
    const email = normalizedEmail(raw);
    if (await inviteFor(ctx, companyId, email)) return null;
    const [members, invites] = await Promise.all([
      ctx.db.query("company_members").withIndex("by_company", (q) => q.eq("companyId", companyId)).take(MAX_MEMBERS),
      ctx.db.query("company_invites").withIndex("by_company", (q) => q.eq("companyId", companyId)).take(MAX_PENDING_INVITES),
    ]);
    if (members.length >= MAX_MEMBERS) fail("rate_limited", `Companies can have at most ${MAX_MEMBERS} members`);
    if (invites.length >= MAX_PENDING_INVITES) fail("rate_limited", `At most ${MAX_PENDING_INVITES} invites can be pending`);
    await ctx.db.insert("company_invites", { companyId, email, invitedBy: user._id, createdAt: Date.now() });
    return null;
  },
});

export const cancelInvite = mutation({
  args: { deviceId: v.string(), companyId: v.id("companies"), email: v.string() },
  returns: v.null(),
  handler: async (ctx, { deviceId, companyId, email }) => {
    const user = await requireCaller(ctx, deviceId);
    await requireOwner(ctx, companyId, user._id);
    const invite = await inviteFor(ctx, companyId, normalizedEmail(email));
    if (invite) await ctx.db.delete(invite._id);
    return null;
  },
});

export const respondInvite = mutation({
  args: { deviceId: v.string(), companyId: v.id("companies"), accept: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { deviceId, companyId, accept }) => {
    const user = await requireCaller(ctx, deviceId);
    const invite = user.email ? await inviteFor(ctx, companyId, user.email) : null;
    if (!invite) return fail("not_found", "No pending invite for this company");
    await ctx.db.delete(invite._id);
    if (accept && !await membershipOf(ctx, companyId, user._id)) {
      const joined = await ctx.db.query("company_members").withIndex("by_user", (q) => q.eq("userId", user._id)).take(MAX_MEMBERSHIPS);
      if (joined.length >= MAX_MEMBERSHIPS) fail("rate_limited", `You can join at most ${MAX_MEMBERSHIPS} companies`);
      await ctx.db.insert("company_members", { companyId, userId: user._id, role: "member", createdAt: Date.now() });
    }
    return null;
  },
});

export const removeMember = mutation({
  args: { deviceId: v.string(), companyId: v.id("companies"), userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { deviceId, companyId, userId }) => {
    const user = await requireCaller(ctx, deviceId);
    const mine = await requireMember(ctx, companyId, user._id);
    if (userId !== user._id && mine.role !== "owner") fail("forbidden", "Only the company owner can remove members");
    const target = await membershipOf(ctx, companyId, userId);
    if (!target) return null;
    if (target.role === "owner") fail("forbidden", "The owner cannot be removed");
    await ctx.db.delete(target._id);
    return null;
  },
});

export const mine = query({
  args: { deviceId: v.string() },
  returns: v.object({
    memberships: v.array(v.object({ company: companyView, role: companyRole })),
    invites: v.array(v.object({ company: companyView, invitedByName: v.union(v.string(), v.null()) })),
  }),
  handler: async (ctx, { deviceId }) => {
    const user = await callerFor(ctx, deviceId);
    if (!user) return { memberships: [], invites: [] };
    const rows = await ctx.db.query("company_members").withIndex("by_user", (q) => q.eq("userId", user._id)).take(MAX_MEMBERSHIPS);
    const memberships = [];
    for (const row of rows) {
      const company = await ctx.db.get(row.companyId);
      if (company) memberships.push({ company: toCompany(company), role: row.role });
    }
    const email = user.email;
    const pending = email ? await ctx.db.query("company_invites").withIndex("by_email", (q) => q.eq("email", email)).take(MAX_MEMBERSHIPS) : [];
    const invites = [];
    for (const invite of pending) {
      const company = await ctx.db.get(invite.companyId);
      if (!company || rows.some((r) => r.companyId === company._id)) continue;
      invites.push({ company: toCompany(company), invitedByName: (await ctx.db.get(invite.invitedBy))?.name ?? null });
    }
    return { memberships, invites };
  },
});

export const get = query({
  args: { deviceId: v.string(), companyId: v.id("companies") },
  returns: v.union(v.null(), v.object({
    company: companyView,
    myRole: v.union(companyRole, v.null()),
    members: v.array(v.object({ name: v.union(v.string(), v.null()), userId: v.optional(v.id("users")), role: v.optional(companyRole) })),
    pendingInvites: v.optional(v.array(v.object({ email: v.string(), createdAt: v.number() }))),
    hostedEvents: v.array(eventSummary),
  })),
  handler: async (ctx, { deviceId, companyId }) => {
    const company = await ctx.db.get(companyId);
    if (!company) return null;
    const user = await callerFor(ctx, deviceId);
    const myRole = (user ? await membershipOf(ctx, companyId, user._id) : null)?.role ?? null;
    const rows = await ctx.db.query("company_members").withIndex("by_company", (q) => q.eq("companyId", companyId)).take(MAX_MEMBERS);
    const members = await Promise.all(rows.map(async (r) => {
      const name = (await ctx.db.get(r.userId))?.name ?? null;
      return myRole ? { name, userId: r.userId, role: r.role } : { name };
    }));
    const invites = myRole === "owner" ? await ctx.db.query("company_invites").withIndex("by_company", (q) => q.eq("companyId", companyId)).take(MAX_PENDING_INVITES) : null;
    const links = await ctx.db.query("event_hosts").withIndex("by_company", (q) => q.eq("companyId", companyId)).take(MAX_ROWS);
    const events = (await Promise.all(links.map((l) => ctx.db.get(l.eventId)))).filter((e) => e !== null);
    return {
      company: toCompany(company),
      myRole,
      members,
      ...(invites ? { pendingInvites: invites.map(({ email, createdAt }) => ({ email, createdAt })) } : {}),
      hostedEvents: events.sort((a, b) => b.startTime - a.startTime).map(toEvent),
    };
  },
});

export const claimEvent = mutation({
  args: { deviceId: v.string(), companyId: v.id("companies"), eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, { deviceId, companyId, eventId }) => {
    const user = await requireCaller(ctx, deviceId);
    await requireMember(ctx, companyId, user._id);
    const company = await requireVerified(ctx, companyId);
    const event = await ctx.db.get(eventId);
    if (!event) return fail("not_found", "Event not found");
    if (!hostSlugs(event).includes(company.slug)) fail("forbidden", "This event does not list your company as a host or organizer");
    const existing = await ctx.db.query("event_hosts").withIndex("by_event", (q) => q.eq("eventId", eventId).eq("companyId", companyId)).unique();
    if (!existing) await ctx.db.insert("event_hosts", { eventId, companyId, claimedBy: user._id, createdAt: Date.now() });
    return null;
  },
});

export const unclaimEvent = mutation({
  args: { deviceId: v.string(), companyId: v.id("companies"), eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, { deviceId, companyId, eventId }) => {
    const user = await requireCaller(ctx, deviceId);
    await requireOwner(ctx, companyId, user._id);
    const existing = await ctx.db.query("event_hosts").withIndex("by_event", (q) => q.eq("eventId", eventId).eq("companyId", companyId)).unique();
    if (existing) await ctx.db.delete(existing._id);
    return null;
  },
});

export const claimable = query({
  args: { deviceId: v.string(), companyId: v.id("companies") },
  returns: v.array(eventSummary),
  handler: async (ctx, { deviceId, companyId }) => {
    const user = await requireCaller(ctx, deviceId);
    await requireMember(ctx, companyId, user._id);
    const company = await requireVerified(ctx, companyId);
    const now = Date.now();
    const candidates = await ctx.db.query("events")
      .withIndex("by_start", (q) => q.gte("startTime", now - CLAIM_LOOKBACK_MS).lte("startTime", now + CLAIM_LOOKAHEAD_MS))
      .order("desc").take(CLAIM_SCAN);
    const out = [];
    for (const event of candidates) {
      if (event.hiddenAt !== undefined || !hostSlugs(event).includes(company.slug)) continue;
      if (await ctx.db.query("event_hosts").withIndex("by_event", (q) => q.eq("eventId", event._id).eq("companyId", companyId)).unique()) continue;
      out.push(toEvent(event));
      if (out.length >= MAX_CLAIMABLE) break;
    }
    return out;
  },
});

const companyRef = { companyId: v.optional(v.id("companies")), slug: v.optional(v.string()) };

async function companyByRef(ctx: MutationCtx, { companyId, slug }: { companyId?: Id<"companies">; slug?: string }) {
  if ((companyId === undefined) === (slug === undefined)) return fail("invalid", "Pass exactly one of companyId or slug");
  const company = companyId ? await ctx.db.get(companyId) : await ctx.db.query("companies").withIndex("by_slug", (q) => q.eq("slug", slugify(slug!))).unique();
  return company ?? fail("not_found", "Company not found");
}

export const verify = internalMutation({
  args: { ...companyRef, by: v.string() },
  returns: v.object({ companyId: v.id("companies"), name: v.string(), verifiedAt: v.number() }),
  handler: async (ctx, { by, ...ref }) => {
    const company = await companyByRef(ctx, ref);
    const reviewer = by.trim();
    if (!reviewer) fail("invalid", "Say who approved the company");
    const verifiedAt = company.verifiedAt ?? Date.now();
    await ctx.db.patch(company._id, { verifiedAt, verifiedBy: reviewer });
    return { companyId: company._id, name: company.name, verifiedAt };
  },
});

export const unverify = internalMutation({
  args: companyRef,
  returns: v.object({ companyId: v.id("companies"), name: v.string() }),
  handler: async (ctx, ref) => {
    const company = await companyByRef(ctx, ref);
    await ctx.db.patch(company._id, { verifiedAt: undefined, verifiedBy: undefined });
    return { companyId: company._id, name: company.name };
  },
});
