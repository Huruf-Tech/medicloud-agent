import React from "react";
import type {
    MachineOrder,
    MachineProfile,
    OrderStatus,
    TOrderQuery,
} from "@/types/api";
import { Container } from "@/components/common/container";
import { PageSection } from "@/components/common/pageSection";
import {
    PageLoading,
    RefreshButton,
    ResourceEmpty,
    ResourceError,
} from "@/components/common/resourceState";
import { Pagination } from "@/components/common/pagination";
import { Link, useSearchParams } from "react-router-dom";
import useSWR from "swr";
import { api } from "@/lib/api";
import { useAsyncAction } from "@/hooks/use-async-action";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Field,
    FieldError,
    FieldGroup,
    FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Controller, type SubmitHandler, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
    orderFormSchema,
    type OrderFormValues,
    orderPayload,
} from "@/lib/schema";
import { Button } from "@/components/ui/button";
import {
    ArrowCounterClockwiseIcon,
    ArrowRightIcon,
    CpuIcon,
    EyeIcon,
    MagnifyingGlassIcon,
    PencilSimpleIcon,
    PlusIcon,
    TrashIcon,
    XIcon,
} from "@phosphor-icons/react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { OrderStatusBadge } from "@/components/common/statusBadge";
import { ConfirmAction } from "@/components/common/confirmAction";
import { useDebounceCallback } from "@/hooks/use-debounce-callback";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

const ITEMS_PER_PAGE = 10;

/**
 * Orders management page featuring URL-persisted search/filtering, pagination, and actions.
 */
export function OrdersPage() {
    const [params, setParams] = useSearchParams();
    const status = (params.get("status") || "") as OrderStatus | "";
    const sampleId = params.get("sampleId") || "";
    const machineIdParam = params.get("machineId") || "";
    const machineId = machineIdParam ? Number(machineIdParam) : undefined;
    const currentPage = Math.max(Number(params.get("page")) || 1, 1);
    const [search, setSearch] = React.useState(sampleId);

    React.useEffect(() => setSearch(sampleId), [sampleId]);

    const orderQuery: TOrderQuery = React.useMemo(() => ({
        status: status || undefined,
        sampleId: sampleId || undefined,
        machineId,
        limit: ITEMS_PER_PAGE,
        offset: (currentPage - 1) * ITEMS_PER_PAGE,
    }), [status, sampleId, machineId, currentPage]);

    // Fetch orders via SWR
    const {
        data: ordersData,
        isValidating: orderIsValidating,
        error: ordersQueryError,
        mutate: orderMutate,
    } = useSWR(
        api.orders.listKey(orderQuery),
        () => api.orders.list(orderQuery),
        { refreshInterval: 6000 },
    );

    const { data: profilesError, mutate: profilesMutate } =
        useSWR(
            api.profiles.listKey({ enabled: true }),
            () => api.profiles.list({ enabled: true }),
        );

    // Resolve the filtered analyzer's display name for the filter chip
    const { data: allProfilesData } = useSWR(
        api.profiles.listKey(),
        () => api.profiles.list(),
    );
    const filteredMachineName = React.useMemo(() => {
        if (!machineId) return undefined;
        const match = allProfilesData?.profiles.find((p) => Number(p.id) === machineId);
        return match?.name || match?.driverId || `Analyzer #${machineId}`;
    }, [allProfilesData, machineId]);

    const orderAction = useAsyncAction("Order action failed.");
    
    // Safe total pages estimation from list response length or pagination metadata if available
    const totalPages = React.useMemo(() => {
        const count = ordersData?.total ?? ordersData?.orders?.length ?? 0;
        return Math.max(Math.ceil(count / ITEMS_PER_PAGE), 1);
    }, [ordersData]);

    const updateFilter = React.useCallback((key: string, value: string | null) => {
        const next = new URLSearchParams(params);
        if (value) next.set(key, value);
        else next.delete(key);
        next.delete("page");
        setParams(next, { replace: true });
    }, [params, setParams]);

    const debouncedUpdateFilter = useDebounceCallback(updateFilter, 400);

    const setCurrentPage = React.useCallback((page: number) => {
        const next = new URLSearchParams(params);
        if (page <= 1) next.delete("page");
        else next.set("page", String(page));
        setParams(next, { replace: true });
    }, [params, setParams]);

    const handleRefresh = React.useCallback(() => {
        setSearch("");
        setParams({}, { replace: true });
        void orderMutate();
    }, [setParams, orderMutate]);

    const combinedError = ordersQueryError ?? profilesError;

    if (!ordersData && !combinedError) return <PageLoading />;
    if (combinedError && !ordersData) {
        return (
            <Container>
                <ResourceError error={combinedError} onRetry={handleRefresh} />
            </Container>
        );
    }

    async function runOrderMutation(action: () => Promise<unknown>) {
        await orderAction.execute(async () => {
            await action();
            await Promise.all([orderMutate(), profilesMutate()]);
        }).catch(() => undefined);
    }

    return (
        <Container>
            <PageSection
                eyebrow="Worklist"
                title="Orders in motion"
                description="Search and filter state is stored in the URL, so operational views can be bookmarked and shared."
                actions={
                    <>
                        <RefreshButton
                            isLoading={orderIsValidating}
                            onRefresh={handleRefresh}
                        />
                        <OrderDialog
                            profiles={allProfilesData?.profiles.filter((p) =>
                                p.enabled
                            ) ?? []}
                            onSaved={async () => {
                                await orderMutate();
                            }}
                        />
                    </>
                }
            />

            {/* Filter controls */}
            <div className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
                <Input
                    placeholder="Search sample ID"
                    className="font-normal"
                    value={search}
                    onChange={(e) => {
                        setSearch(e.target.value);
                        debouncedUpdateFilter("sampleId", e.target.value);
                    }}
                />
                <Select
                    value={status || "all"}
                    onValueChange={(v) =>
                        updateFilter("status", v === "all" || v === undefined ? "" : v)}
                >
                    <SelectTrigger className="w-full font-normal cursor-pointer">
                        <SelectValue className="font-normal">
                            {status
                                ? status.charAt(0).toUpperCase() +
                                    status.slice(1)
                                : "All statuses"}
                        </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectGroup>
                            <SelectItem value="all" className="font-normal cursor-pointer">
                                All statuses
                            </SelectItem>
                            <SelectItem value="pending" className="font-normal cursor-pointer">
                                Pending
                            </SelectItem>
                            <SelectItem value="testing" className="font-normal cursor-pointer">
                                Testing
                            </SelectItem>
                            <SelectItem
                                value="completed"
                                className="font-normal cursor-pointer"
                            >
                                Completed
                            </SelectItem>
                            <SelectItem value="failed" className="font-normal cursor-pointer">
                                Failed
                            </SelectItem>
                        </SelectGroup>
                    </SelectContent>
                </Select>
            </div>

            {/* Active filter chip */}
            {machineId ? (
                <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="font-normal gap-1.5 pr-1 py-1.5">
                        <CpuIcon className="h-3.5 w-3.5" />
                        Filtered by {filteredMachineName ?? `Analyzer #${machineId}`}
                        <button
                            type="button"
                            aria-label="Clear analyzer filter"
                            className="rounded-full hover:bg-background/60 p-0.5 ml-1 cursor-pointer"
                            onClick={() => updateFilter("machineId", null)}
                        >
                            <XIcon className="h-3 w-3" />
                        </button>
                    </Badge>
                </div>
            ) : null}

            {ordersData?.orders?.length
                ? (
                    <div className="flex flex-col gap-4">
                        <div className="overflow-x-auto rounded-2xl border border-border bg-card relative">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="font-normal">
                                            Sample ID
                                        </TableHead>
                                        <TableHead className="font-normal">
                                            Patient
                                        </TableHead>
                                        <TableHead className="font-normal">
                                            Analyzer
                                        </TableHead>
                                        <TableHead className="font-normal">
                                            Tests
                                        </TableHead>
                                        <TableHead className="font-normal">
                                            Status
                                        </TableHead>
                                        <TableHead className="font-normal">
                                            Expiry
                                        </TableHead>
                                        <TableHead className="text-right font-normal sticky right-0 bg-card z-10">
                                            Actions
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {ordersData.orders.map((order) => (
                                        <TableRow
                                            key={order.id}
                                            className="hover:bg-muted/50 transition-colors"
                                        >
                                            <TableCell className="font-normal">
                                                <Link
                                                    to={`/dashboard/orders/${order.id}`}
                                                    className="hover:underline hover:text-primary transition-colors inline-flex items-center gap-1 font-normal text-foreground"
                                                >
                                                    {order.sampleId || `#${order.id}`}
                                                    <ArrowRightIcon className="h-3.5 w-3.5 opacity-40" />
                                                </Link>
                                            </TableCell>
                                            <TableCell className="font-normal">
                                                {order.patientName ||
                                                    order.patientId || "—"}
                                            </TableCell>
                                            <TableCell className="tabular-nums font-mono text-xs font-normal">
                                                <Link
                                                    to={`/dashboard/profiles/${order.machineId}`}
                                                    className="hover:underline hover:text-primary text-muted-foreground transition-colors font-normal"
                                                >
                                                    #{order.machineId}
                                                </Link>
                                            </TableCell>
                                            <TableCell className="max-w-56 truncate font-normal">
                                                {Array.isArray(order.tests)
                                                    ? order.tests.join(", ")
                                                    : "—"}
                                            </TableCell>
                                            <TableCell className="font-normal">
                                                <OrderStatusBadge
                                                    status={order.status}
                                                />
                                            </TableCell>
                                            <TableCell className="text-muted-foreground text-xs font-mono font-normal">
                                                {order.expiresAt
                                                    ? new Date(order.expiresAt)
                                                        .toLocaleString()
                                                    : "—"}
                                            </TableCell>
                                            <TableCell className="sticky right-0 bg-card z-10">
                                                <div className="flex items-center justify-end gap-1">
                                                    {order.status !==
                                                            "completed" && (
                                                        <OrderDialog
                                                            profiles={allProfilesData
                                                                ?.profiles ??
                                                                []}
                                                            order={order}
                                                            onSaved={async () => {
                                                                await orderMutate();
                                                            }}
                                                        />
                                                    )}
                                                    {(order.status ===
                                                            "failed" ||
                                                        order.status ===
                                                            "pending") && (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon-xs"
                                                            className="cursor-pointer"
                                                            aria-label={`Resend ${order.sampleId}`}
                                                            onClick={() =>
                                                                void runOrderMutation(
                                                                    () =>
                                                                        api.orders
                                                                            .resend(
                                                                                order
                                                                                    .id,
                                                                            )
                                                                )}
                                                        >
                                                            <ArrowCounterClockwiseIcon />
                                                        </Button>
                                                    )}
                                                    {order.status !==
                                                            "completed" && (
                                                        <ConfirmAction
                                                            trigger={
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon-xs"
                                                                    className="cursor-pointer"
                                                                    aria-label={`Delete ${order.sampleId}`}
                                                                >
                                                                    <TrashIcon />
                                                                </Button>
                                                            }
                                                            title="Delete this order?"
                                                            description="Active orders are removed from the analyzer staging map before deletion."
                                                            actionLabel="Delete order"
                                                            onConfirm={() =>
                                                                runOrderMutation(
                                                                    () =>
                                                                        api.orders
                                                                            .remove(
                                                                                order
                                                                                    .id,
                                                                            )
                                                                )}
                                                        />
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>

                        {totalPages > 1 && (
                            <div className="pt-2 flex justify-center">
                                <Pagination
                                    page={currentPage}
                                    totalPages={totalPages}
                                    onPageChange={setCurrentPage}
                                />
                            </div>
                        )}
                    </div>
                )
                : (
                    <ResourceEmpty
                        title="No matching orders"
                        description={machineId
                            ? "This analyzer has no orders matching the current filters."
                            : "Adjust the filters or create a new order for a running analyzer."}
                        action={
                            <OrderDialog
                                profiles={allProfilesData?.profiles.filter((p) =>
                                    p.enabled
                                ) ?? []}
                                onSaved={async () => {
                                    await orderMutate();
                                }}
                            />
                        }
                    />
                )}
        </Container>
    );
}

function getOrderFormDefaults(
    defaultExpiry: string,
    profiles: MachineProfile[],
    order?: MachineOrder,
): OrderFormValues {
    return {
        machineId: String(order?.machineId ?? profiles[0]?.id ?? ""),
        sampleId: order?.sampleId ?? "",
        tests: Array.isArray(order?.tests) ? order.tests.join(", ") : "",
        patientId: order?.patientId ?? "",
        patientName: order?.patientName ?? "",
        sampleType: order?.sampleType ?? "",
        rackPosition: order?.rackPosition ?? "",
        expiresAt: order?.expiresAt
            ? new Date(order.expiresAt).toISOString().slice(0, 16)
            : defaultExpiry.slice(0, 16),
    };
}

/**
 * Modal dialog for creating or updating analytical orders with integrated test selection.
 */
function OrderDialog(
    { profiles, order, onSaved }: {
        profiles: MachineProfile[];
        order?: MachineOrder;
        onSaved: () => Promise<unknown>;
    },
) {
    const [open, setOpen] = React.useState(false);
    const saveOrder = useAsyncAction("Order could not be saved.");
    const [defaultExpiry] = React.useState(() =>
        new Date(Date.now() + 86_400_000).toISOString()
    );

    const form = useForm<OrderFormValues>({
        resolver: zodResolver(orderFormSchema),
        defaultValues: getOrderFormDefaults(defaultExpiry, profiles, order),
    });

    const machineId = form.watch("machineId");
    const selectedProfile = React.useMemo(
        () => profiles.find((p) => String(p.id) === machineId),
        [profiles, machineId],
    );

    async function changeOpen(nextOpen: boolean) {
        setOpen(nextOpen);
        if (nextOpen) {
            saveOrder.reset();
            form.clearErrors();
        }
        if (
            nextOpen && !order?.id && !form.getValues("machineId") &&
            profiles[0]
        ) {
            form.setValue("machineId", String(profiles[0].id));
        }
        if (nextOpen && order?.id) {
            const { order: latestOrder } = await saveOrder.execute(() =>
                api.orders.get(order.id)
            );
            form.reset(
                getOrderFormDefaults(defaultExpiry, profiles, latestOrder),
            );
        }
    }

    const onSubmit: SubmitHandler<OrderFormValues> = async (data) => {
        await saveOrder.execute(async () => {
            const input = orderPayload(data, Boolean(order?.id));
            if (order?.id) await api.orders.update(order.id, input);
            else await api.orders.create(input);
            await onSaved();
            setOpen(false);
        });
    };

    const dialogTrigger = order
        ? (
            <Button variant="ghost" size="icon-xs" className="cursor-pointer" aria-label={`Edit ${order.sampleId}`}>
                <PencilSimpleIcon />
            </Button>
        )
        : (
            <Button size="sm" className="font-normal cursor-pointer">
                <PlusIcon data-icon="inline-start" />New order
            </Button>
        );

    return (
        <Dialog open={open} onOpenChange={(next) => void changeOpen(next)}>
            <DialogTrigger render={dialogTrigger} />
            <DialogContent
                className="sm:max-w-xl max-h-[85vh] flex flex-col p-0 overflow-hidden"
            >
                <form
                    onSubmit={form.handleSubmit(onSubmit)}
                    noValidate
                    className="flex flex-col h-full overflow-hidden"
                >
                    <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/45 shrink-0">
                        <DialogTitle className="font-normal">
                            {order?.id ? "Edit order" : "Create order"}
                        </DialogTitle>
                        <DialogDescription className="font-normal">
                            Active orders are staged in the target analyzer
                            after validation.
                        </DialogDescription>
                    </DialogHeader>

                    {/* Scrollable form body with hidden scrollbars */}
                    <div className="flex-1 overflow-y-auto px-6 py-5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                        {!order?.id && profiles.length === 0
                            ? (
                                <ResourceEmpty
                                    title="No running analyzer"
                                    description="Start an analyzer profile before creating a test order."
                                />
                            )
                            : (
                                <FieldGroup>
                                    {!order?.id && (
                                        <Controller
                                            control={form.control}
                                            name="machineId"
                                            render={({ field, fieldState }) => (
                                                <Field
                                                    data-invalid={fieldState
                                                        .invalid}
                                                >
                                                    <FieldLabel className="font-normal">
                                                        Analyzer profile{" "}
                                                        <span className="text-destructive ml-0.5">
                                                            *
                                                        </span>
                                                    </FieldLabel>
                                                    <Select
                                                        value={field.value}
                                                        onValueChange={(v) => {
                                                            field.onChange(
                                                                v || "",
                                                            );
                                                            form.setValue(
                                                                "tests",
                                                                "",
                                                            );
                                                        }}
                                                    >
                                                        <SelectTrigger
                                                            className="w-full font-normal cursor-pointer"
                                                            aria-invalid={fieldState
                                                                .invalid}
                                                        >
                                                            <SelectValue className="font-normal">
                                                                {profiles.find((
                                                                    p,
                                                                ) => String(
                                                                    p.id,
                                                                ) ===
                                                                    field.value
                                                                )?.name ||
                                                                    "Choose an analyzer"}
                                                            </SelectValue>
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectGroup>
                                                                {profiles.map((
                                                                    p,
                                                                ) => (
                                                                    <SelectItem
                                                                        key={p
                                                                            .id}
                                                                        value={String(
                                                                            p.id,
                                                                        )}
                                                                        className="font-normal cursor-pointer"
                                                                    >
                                                                        {p.name ||
                                                                            p.driverId}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectGroup>
                                                        </SelectContent>
                                                    </Select>
                                                    <FieldError className="font-normal">
                                                        {fieldState.error
                                                            ?.message}
                                                    </FieldError>
                                                </Field>
                                            )}
                                        />
                                    )}

                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <Field
                                            data-invalid={Boolean(
                                                form.formState.errors.sampleId,
                                            )}
                                        >
                                            <FieldLabel className="font-normal">
                                                Sample ID{" "}
                                                <span className="text-destructive ml-0.5">
                                                    *
                                                </span>
                                            </FieldLabel>
                                            <Input
                                                placeholder="e.g. SMP-001"
                                                className="font-normal"
                                                {...form.register("sampleId")}
                                            />
                                            <FieldError className="font-normal">
                                                {form.formState.errors.sampleId
                                                    ?.message}
                                            </FieldError>
                                        </Field>

                                        <Field
                                            data-invalid={Boolean(
                                                form.formState.errors.patientId,
                                            )}
                                        >
                                            <FieldLabel className="font-normal">
                                                Patient ID{" "}
                                                <span className="text-xs text-muted-foreground ml-1">
                                                    (optional)
                                                </span>
                                            </FieldLabel>
                                            <Input
                                                placeholder="e.g. PAT-9821"
                                                className="font-normal"
                                                {...form.register("patientId")}
                                            />
                                            <FieldError className="font-normal">
                                                {form.formState.errors.patientId
                                                    ?.message}
                                            </FieldError>
                                        </Field>

                                        <Field
                                            data-invalid={Boolean(
                                                form.formState.errors
                                                    .patientName,
                                            )}
                                        >
                                            <FieldLabel className="font-normal">
                                                Patient name{" "}
                                                <span className="text-xs text-muted-foreground ml-1">
                                                    (optional)
                                                </span>
                                            </FieldLabel>
                                            <Input
                                                placeholder="e.g. John Doe"
                                                className="font-normal"
                                                {...form.register(
                                                    "patientName",
                                                )}
                                            />
                                            <FieldError className="font-normal">
                                                {form.formState.errors
                                                    .patientName?.message}
                                            </FieldError>
                                        </Field>

                                        <Field
                                            data-invalid={Boolean(
                                                form.formState.errors
                                                    .sampleType,
                                            )}
                                        >
                                            <FieldLabel className="font-normal">
                                                Sample type{" "}
                                                <span className="text-xs text-muted-foreground ml-1">
                                                    (optional)
                                                </span>
                                            </FieldLabel>
                                            <Input
                                                placeholder="e.g. Serum, Plasma"
                                                className="font-normal"
                                                {...form.register("sampleType")}
                                            />
                                            <FieldError className="font-normal">
                                                {form.formState.errors
                                                    .sampleType?.message}
                                            </FieldError>
                                        </Field>

                                        <Field
                                            data-invalid={Boolean(
                                                form.formState.errors
                                                    .rackPosition,
                                            )}
                                        >
                                            <FieldLabel className="font-normal">
                                                Rack position{" "}
                                                <span className="text-xs text-muted-foreground ml-1">
                                                    (optional)
                                                </span>
                                            </FieldLabel>
                                            <Input
                                                placeholder="e.g. A1, B4"
                                                className="font-normal"
                                                {...form.register(
                                                    "rackPosition",
                                                )}
                                            />
                                            <FieldError className="font-normal">
                                                {form.formState.errors
                                                    .rackPosition?.message}
                                            </FieldError>
                                        </Field>

                                        <Field
                                            data-invalid={Boolean(
                                                form.formState.errors.expiresAt,
                                            )}
                                        >
                                            <FieldLabel className="font-normal">
                                                Expires at{" "}
                                                <span className="text-destructive ml-0.5">
                                                    *
                                                </span>
                                            </FieldLabel>
                                            <Input
                                                type="datetime-local"
                                                className="font-normal"
                                                {...form.register("expiresAt")}
                                            />
                                            <FieldError className="font-normal">
                                                {form.formState.errors.expiresAt
                                                    ?.message}
                                            </FieldError>
                                        </Field>
                                    </div>

                                    <Controller
                                        control={form.control}
                                        name="tests"
                                        render={({ field, fieldState }) => (
                                            <Field
                                                data-invalid={fieldState
                                                    .invalid}
                                            >
                                                <FieldLabel className="font-normal">
                                                    Assay Tests{" "}
                                                    <span className="text-destructive ml-0.5">
                                                        *
                                                    </span>
                                                </FieldLabel>
                                                <TestPicker
                                                    driverId={selectedProfile
                                                        ?.driverId}
                                                    machineName={selectedProfile
                                                        ?.name ||
                                                        selectedProfile
                                                            ?.driverId}
                                                    value={field.value}
                                                    onChange={field.onChange}
                                                    invalid={fieldState.invalid}
                                                />
                                                <FieldError className="font-normal">
                                                    {fieldState.error?.message}
                                                </FieldError>
                                            </Field>
                                        )}
                                    />
                                </FieldGroup>
                            )}
                    </div>

                    <DialogFooter className="px-6 py-4 border-t border-border/45 shrink-0 bg-muted/20">
                        <Button
                            type="button"
                            variant="outline"
                            className="font-normal cursor-pointer"
                            onClick={() => setOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            className="font-normal cursor-pointer"
                            disabled={saveOrder.pending ||
                                (!order && (!profiles.length || !machineId))}
                        >
                            {saveOrder.pending
                                ? <Spinner data-icon="inline-start" />
                                : null}
                            {order ? "Save changes" : "Create order"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

/**
 * Catalog-driven Test Picker modal allowing interactive multi-selection of assay codes.
 */
function TestPicker(
    { driverId, machineName, value, onChange, invalid }: {
        driverId?: string;
        machineName?: string;
        value: string;
        onChange: (v: string) => void;
        invalid?: boolean;
    },
) {
    const [open, setOpen] = React.useState(false);
    const [searchQuery, setSearchQuery] = React.useState("");

    const {
        data: catalogDetailsData,
        error: catalogErrors,
        isLoading: catalogLoading,
    } = useSWR(
        driverId ? api.catalogs.detailKey(driverId) : null,
        ([, dId]) => api.catalogs.get({ driver: dId }),
    );

    const selected = React.useMemo(
        () => value.split(",").map((t) => t.trim()).filter(Boolean),
        [value],
    );

    const catalogFields = React.useMemo(() => {
        return Array.from(
            new Set((catalogDetailsData?.tests ?? []).flatMap((test) =>
                Object.keys(test)
            )),
        );
    }, [catalogDetailsData?.tests]);

    const fieldLabel = (f: string) =>
        f.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").replace(
            /\b\w/g,
            (l) => l.toUpperCase(),
        );
    const fieldValue = (val: unknown) => {
        if (Array.isArray(val)) {
            return val.length
                ? val.map(String).join(", ")
                : "—";
        }
        if (val && typeof val === "object") return JSON.stringify(val);
        return val === null || val === undefined || val === ""
            ? "N/A"
            : String(val);
    };

    const filteredTests = React.useMemo(() => {
        const tests = catalogDetailsData?.tests ?? [];
        if (!searchQuery.trim()) return tests;
        const needle = searchQuery.trim().toLowerCase();
        return tests.filter((test) =>
            Object.values(test).some((v) =>
                String(v ?? "").toLowerCase().includes(needle)
            )
        );
    }, [catalogDetailsData?.tests, searchQuery]);

    const getTestCode = (test: Record<string, unknown>) =>
        String(
            test.code || test.testCode || test.hostCode || test.appCode ||
                test.shortName || test.id || Object.values(test)[0] || "",
        ).trim();

    const toggleTestCode = (test: Record<string, unknown>) => {
        const code = getTestCode(test);
        if (!code) return;
        const next = selected.includes(code)
            ? selected.filter((t) => t !== code)
            : [...selected, code];
        onChange(next.join(", "));
    };

    if (!driverId) {
        return (
            <Input
                aria-invalid={invalid}
                placeholder="Select an analyzer profile first"
                disabled
                className="font-normal"
            />
        );
    }

    return (
        <div className="flex flex-col gap-2">
            <Button
                type="button"
                variant="outline"
                aria-invalid={invalid}
                className="w-full justify-between font-normal h-auto min-h-10 py-2 cursor-pointer"
                onClick={() => setOpen(true)}
            >
                <span className="truncate text-left font-normal text-muted-foreground flex flex-wrap gap-1 items-center">
                    {selected.length > 0
                        ? (
                            selected.map((code) => (
                                <Badge
                                    key={code}
                                    variant="secondary"
                                    className="font-normal text-xs px-1.5 py-0.5"
                                >
                                    {code}
                                </Badge>
                            ))
                        )
                        : (
                            "Browse and select tests from catalog"
                        )}
                </span>
                <EyeIcon className="h-4 w-4 opacity-50 shrink-0 ml-2" />
            </Button>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent
                    className="sm:max-w-4xl max-h-[85vh] flex flex-col p-0 overflow-hidden"
                >
                    <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/45 shrink-0">
                        <DialogTitle className="font-normal">
                            {catalogDetailsData?.machine || machineName ||
                                "Test catalog"}
                        </DialogTitle>
                        <DialogDescription className="font-normal">
                            Test codes exposed by{" "}
                            {driverId}. Click rows to select/deselect tests.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex items-center gap-2 px-6 py-3 border-b border-border/45 shrink-0 bg-muted/20">
                        <MagnifyingGlassIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <Input
                            placeholder="Search catalog tests (e.g. GLU, ALT)..."
                            className="font-normal bg-background"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    <div className="flex-1 overflow-y-auto px-6 py-4 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                        {catalogLoading
                            ? <PageLoading rows={4} />
                            : catalogErrors
                            ? <ResourceError error={catalogErrors} />
                            : filteredTests.length
                            ? (
                                <div className="overflow-hidden rounded-2xl border border-border bg-card">
                                    <div className="max-h-[50vh] overflow-auto">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead className="w-12 font-normal text-center">
                                                        Select
                                                    </TableHead>
                                                    {catalogFields.map((f) => (
                                                        <TableHead
                                                            key={f}
                                                            className="font-normal"
                                                        >
                                                            {fieldLabel(f)}
                                                        </TableHead>
                                                    ))}
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {filteredTests.map(
                                                    (test, index) => {
                                                        const code =
                                                            getTestCode(test);
                                                        const isSelected =
                                                            selected.includes(
                                                                code,
                                                            );
                                                        return (
                                                            <TableRow
                                                                key={code +
                                                                    index}
                                                                onClick={() =>
                                                                    toggleTestCode(
                                                                        test,
                                                                    )}
                                                                className="cursor-pointer hover:bg-muted/50 transition-colors"
                                                            >
                                                                <TableCell
                                                                    className="text-center"
                                                                    onClick={(
                                                                        e,
                                                                    ) => e
                                                                        .stopPropagation()}
                                                                >
                                                                    <Checkbox
                                                                        checked={isSelected}
                                                                        onCheckedChange={() =>
                                                                            toggleTestCode(
                                                                                test,
                                                                            )}
                                                                    />
                                                                </TableCell>
                                                                {catalogFields
                                                                    .map((
                                                                        f,
                                                                    ) => (
                                                                        <TableCell
                                                                            key={f}
                                                                            className="max-w-72 whitespace-normal font-normal"
                                                                        >
                                                                            {fieldValue(
                                                                                test[
                                                                                    f
                                                                                ],
                                                                            )}
                                                                        </TableCell>
                                                                    ))}
                                                            </TableRow>
                                                        );
                                                    },
                                                )}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </div>
                            )
                            : (
                                <ResourceEmpty
                                    title="No tests found"
                                    description="No test codes match your search criteria."
                                />
                            )}
                    </div>

                    <DialogFooter className="px-6 py-4 border-t border-border/45 shrink-0 bg-muted/20">
                        <Button
                            type="button"
                            className="font-normal cursor-pointer"
                            onClick={() => setOpen(false)}
                        >
                            Done ({selected.length} selected)
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}