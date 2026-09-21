import { Context, Hono } from "@hono/hono";
import { serveStatic } from "@hono/hono/deno";
import { env } from "../lib/env.ts";
import { MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE } from "../lib/constants.ts";
import type { SlaveRegistry } from "../flow/master/slaveRegistry.ts";
import { fetchMachineHealth } from "../lib/endpoints.ts";
import { listExternalOrders, listExternalResults, listSlaveOrders, listSlaveResults } from "../db/queries/external.ts";
import { db } from "../db/index.ts";
import { syncOrderInbox } from "../db/schema.ts";
import { eq } from "drizzle-orm";
import type { SyncClient } from "../flow/sync/client.ts";


/** Reads the search/status/limit/offset query shared by both external lists. */
function listQuery(c: Context) {
    const limit = Number(c.req.query("limit"));
    const offset = Number(c.req.query("offset"));

    return {
        search: c.req.query("search")?.trim() || undefined,
        status: c.req.query("status")?.trim() || undefined,
        limit: Number.isFinite(limit)
            ? Math.min(Math.max(limit, 1), MAX_PAGE_SIZE)
            : DEFAULT_PAGE_SIZE,
        offset: Number.isFinite(offset) ? Math.max(offset, 0) : 0,
    };
}

/**
 * Runs a read and reports failures as JSON.
 */
async function readJson(c: Context, read: () => Promise<unknown>) {
    try {
        return c.json(await read());
    } catch (error) {
        console.error("[dashboard] query failed:", error);
        return c.json({
            error: "Query failed",
            detail: error instanceof Error ? error.message : String(error),
        }, 500);
    }
}

export function registerDashboardRoutes(app: Hono, slaveRegistry: SlaveRegistry | undefined, cloudClient: SyncClient | undefined): void {

    // System info - intercepts the SDK's /health to inject agent mode and version.
    app.get("/info", async (c) => {
        // Forward the request to the SDK's internal health handler
        const { running_machines, registered_drivers } = await fetchMachineHealth();

        // Merge the agent's properties with the SDK's properties
        return c.json({
            running_machines,
            registered_drivers,
            mode: env.AGENT_MODE,
            version: "1.0.0"
        });
    });

    // List all registered slaves (master mode only).
    // Returns every slave — active, inactive, and pre-registered — so the
    // control page always shows the full picture.
    app.get("/slaves", async (c) => {
        if (!slaveRegistry) {
            return c.json({ slaves: [], totalMachines: 0 });
        }

        const [slaves, totalMachines] = await Promise.all([
            slaveRegistry.listAll(),
            slaveRegistry.countMachines(),
        ]);

        return c.json({ slaves, totalMachines });
    });

    // Register a new slave from the master UI.
    // Returns one-time credentials (slaveId + slaveSecret) that the operator
    // must copy — the secret cannot be retrieved again.
    app.post("/slaves/register", async (c) => {
        if (!slaveRegistry) {
            return c.json({ error: "Slave registration is only available in master mode" }, 400);
        }

        const { slaveId, slaveSecret } = await slaveRegistry.register();
        return c.json({ slaveId, slaveSecret });
    });

    // Get a single slave by ID.
    app.get("/slaves/:slaveId", async (c) => {
        if (!slaveRegistry) return c.json({ error: "Not in master mode" }, 400);
        const slave = await slaveRegistry.getBySlaveId(c.req.param("slaveId"));
        if (!slave) return c.json({ error: "Slave not found" }, 404);
        return c.json({ slave });
    });

    // Mark a slave as inactive
    app.post("/slaves/:slaveId/inactive", async (c) => {
        if (!slaveRegistry) return c.json({ success: false }, 400);
        const slaveId = c.req.param("slaveId");
        const found = await slaveRegistry.markInactive(slaveId);

        if (!found) {
            return c.json({ error: "Slave not found" }, 404);
        }

        return c.json({ success: true });
    });

    // Permanently delete a slave from the registry.
    app.post("/slaves/:slaveId/delete", async (c) => {
        if (!slaveRegistry) return c.json({ success: false }, 400);
        const slaveId = c.req.param("slaveId");
        const found = await slaveRegistry.delete(slaveId);

        if (!found) {
            return c.json({ error: "Slave not found" }, 404);
        }

        return c.json({ success: true });
    });

    // External orders - paged view of the agent's syncOrderInbox table.
    app.get("/external-orders", (c) =>
        readJson(c, async () => {
            const { rows, count } = await listExternalOrders(listQuery(c));
            return { orders: rows, count };
        })
    );

    // External results - paged view of the agent's medicloudResultDispatch table.
    app.get("/external-results", (c) =>
        readJson(c, async () => {
            const { rows, count } = await listExternalResults(listQuery(c));
            return { results: rows, count };
        })
    );

    // Slave-scoped orders - orders that were routed to a downstream slave.
    app.get("/slave-orders", (c) =>
        readJson(c, async () => {
            const { rows, count } = await listSlaveOrders(listQuery(c));
            return { orders: rows, count };
        })
    );

    // Slave-scoped results - results originating from slave-processed orders.
    app.get("/slave-results", (c) =>
        readJson(c, async () => {
            const { rows, count } = await listSlaveResults(listQuery(c));
            return { results: rows, count };
        })
    );

    // Reject a pending external order from the master dashboard.
    // Only orders in "received" or "acknowledged" status can be rejected.
    app.post("/external-orders/:id/reject", async (c) => {
        const id = Number(c.req.param("id"));
        if (!Number.isFinite(id)) {
            return c.json({ error: "Invalid order ID" }, 400);
        }

        const [row] = await db.select().from(syncOrderInbox).where(eq(syncOrderInbox.id, id)).limit(1);
        if (!row) {
            return c.json({ error: "Order not found" }, 404);
        }

        if (row.status !== "received" && row.status !== "acknowledged") {
            return c.json({ error: "Only pending orders (received/acknowledged) can be rejected" }, 400);
        }

        const now = new Date().toISOString();
        await db.update(syncOrderInbox).set({
            status: "failed",
            errorText: "Rejected by operator",
            updatedAt: now,
        }).where(eq(syncOrderInbox.id, id));

        // Report rejection upstream (fire-and-forget).
        if (cloudClient) {
            cloudClient.reportStatus([{
                dispatchId: row.dispatchId,
                status: "failed",
                message: "Rejected by operator from master dashboard",
            }]).catch((error) =>
                console.error("[dashboard] Failed to report rejection upstream:", error)
            );
        }

        return c.json({ success: true });
    });

    // Serve pre-built frontend assets under /dashboard/*
    app.use(
        "/dashboard/*",
        serveStatic({
            root: "./frontend/build",
            rewriteRequestPath: (path) => path.replace(/^\/dashboard/, ""),
        }),
    );

    // SPA fallback - any /dashboard route that doesn't match a static file
    // returns index.html so the frontend router handles it.
    app.get("/dashboard", (c, next) =>
        serveStatic({ path: "./frontend/build/index.html" })(c, next)
    );
    app.get("/dashboard/*", (c, next) =>
        serveStatic({ path: "./frontend/build/index.html" })(c, next)
    );
}
