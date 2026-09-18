import { ConfirmAction } from "@/components/common/confirmAction";
import { Pagination } from "@/components/common/pagination";
import { PageLoading, ResourceEmpty, ResourceError } from "@/components/common/resourceState";
import { ExternalOrderStatusBadge } from "@/components/common/statusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, type ExternalQuery } from "@/lib/api";
import { ITEMS_PER_PAGE, pageCount } from "@/lib/global";
import { XCircleIcon } from "@phosphor-icons/react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";

const orderStatuses: { value: string; label: string }[] = [
    { value: "all", label: "All statuses" },
    { value: "received", label: "Received" },
    { value: "acknowledged", label: "Acknowledged" },
    { value: "processing", label: "Processing" },
    { value: "leased_to_slave", label: "Leased to Slave" },
    { value: "acknowledged_by_slave", label: "Ack by Slave" },
    { value: "completed", label: "Completed" },
    { value: "failed", label: "Failed" },
];

export function ControlSlaveOrders() {
    const [search, setSearch] = useState("");
    const [committed, setCommitted] = useState("");
    const [status, setStatus] = useState("");
    const [page, setPage] = useState(1);

    const query = useMemo<ExternalQuery>(() => ({
        search: committed || undefined,
        status: status || undefined,
        limit: ITEMS_PER_PAGE,
        offset: (page - 1) * ITEMS_PER_PAGE,
    }), [committed, status, page]);

    const { data, error, mutate } = useSWR(
        api.slaveOrders.listKey(query),
        () => api.slaveOrders.list(query),
        { refreshInterval: 10_000 },
    );

    const totalPages = pageCount({ page, rows: 0, total: data?.count ?? 0 });

    const handleSearch = useCallback((value: string) => {
        setSearch(value);
        const id = setTimeout(() => { setCommitted(value); setPage(1); }, 400);
        return () => clearTimeout(id);
    }, []);

    const handleStatus = useCallback((value: string | null) => {
        setStatus(value === "all" || value === null ? "" : value);
        setPage(1);
    }, []);

    const refresh = useCallback(() => void mutate(), [mutate]);

    const orders = data?.orders;

    return (
        <div className="flex flex-col gap-4">
            {/* Filters */}
            <div className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
                <Input
                    aria-label="Search dispatch ID"
                    placeholder="Search dispatch ID"
                    className="font-normal"
                    value={search}
                    onChange={(e) => handleSearch(e.target.value)}
                />
                <Select
                    value={status || "all"}
                    onValueChange={handleStatus}
                >
                    <SelectTrigger className="w-full font-normal" aria-label="Filter by status">
                        <SelectValue className="font-normal">
                            {orderStatuses.find((o) => o.value === status)?.label ?? "All statuses"}
                        </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectGroup>
                            {orderStatuses.map((o) => (
                                <SelectItem key={o.value} value={o.value} className="font-normal">
                                    {o.label}
                                </SelectItem>
                            ))}
                        </SelectGroup>
                    </SelectContent>
                </Select>
            </div>

            {/* Table */}
            {error ? (
                <ResourceError error={error} onRetry={refresh} />
            ) : !orders ? (
                <PageLoading />
            ) : !orders.length ? (
                <ResourceEmpty
                    title="No slave orders"
                    description="No orders have been routed to slave agents yet. Orders dispatched to slave-owned machines will appear here."
                />
            ) : (
                <>
                    <div className="overflow-x-auto rounded-2xl border border-border bg-card relative">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="font-normal">Dispatch ID</TableHead>
                                    <TableHead className="font-normal">Profile Key</TableHead>
                                    <TableHead className="font-normal">Target Slave</TableHead>
                                    <TableHead className="font-normal">Driver</TableHead>
                                    <TableHead className="font-normal">Status</TableHead>
                                    <TableHead className="font-normal">Received At</TableHead>
                                    <TableHead className="text-right font-normal">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {orders.map((order) => (
                                    <TableRow key={order.id} className="hover:bg-muted/50 transition-colors">
                                        <TableCell className="font-mono text-xs font-normal">
                                            {order.dispatchId}
                                        </TableCell>
                                        <TableCell className="font-normal">
                                            {order.profileKey}
                                        </TableCell>
                                        <TableCell className="font-mono text-xs font-normal text-muted-foreground">
                                            {order.targetSlaveId ? (order.targetSlaveId.split('-')[1] || order.targetSlaveId) : "—"}
                                        </TableCell>
                                        <TableCell className="font-normal text-muted-foreground">
                                            {order.driverId}
                                        </TableCell>
                                        <TableCell className="font-normal">
                                            <ExternalOrderStatusBadge status={order.status} />
                                        </TableCell>
                                        <TableCell className="text-muted-foreground text-xs font-mono font-normal">
                                            {new Date(order.receivedAt).toLocaleString()}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {(order.status === "received" || order.status === "acknowledged") ? (
                                                <ConfirmAction
                                                    trigger={
                                                        <Button
                                                            variant="ghost"
                                                            size="icon-xs"
                                                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                                        >
                                                            <XCircleIcon />
                                                        </Button>
                                                    }
                                                    title="Reject Order"
                                                    description={`Are you sure you want to reject order ${order.dispatchId}? This will mark it as failed and notify MediCloud.`}
                                                    actionLabel="Reject"
                                                    onConfirm={async () => {
                                                        await api.externalOrders.reject(order.id);
                                                        toast.success("Order rejected successfully");
                                                        refresh();
                                                    }}
                                                />
                                            ) : null}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>

                    {totalPages > 1 && (
                        <div className="flex justify-center pt-2">
                            <Pagination
                                page={page}
                                totalPages={totalPages}
                                onPageChange={setPage}
                            />
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
