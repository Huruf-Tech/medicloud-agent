import React, { useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { WarningCircleIcon, CopyIcon, CheckIcon } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"

interface FormErrorListProps {
    title?: string
    errorMessage?: string | null | Record<string, unknown> | unknown
}

/**
 * Bulleted Form Error Component with Priority Detail Handling & JSON List View
 */
export function FormErrorList({ 
    title = "Action Failed", 
    errorMessage 
}: FormErrorListProps) {
    const [copied, setCopied] = useState(false)

    const parsedErrors = React.useMemo(() => {
        if (!errorMessage) return []

        // Extract prioritized 'detail' if present in object payload
        let targetText: unknown = errorMessage
        if (typeof errorMessage === "object" && errorMessage !== null) {
            const errObj = errorMessage as Record<string, unknown>
            if (errObj.detail) {
                targetText = errObj.detail
            } else if (errObj.error) {
                targetText = errObj.error
            } else {
                return Object.entries(errObj).map(([field, err]) => {
                    const msg = Array.isArray(err) ? err.join(", ") : String(err)
                    return `${field}: ${msg}`
                })
            }
        }

        return String(targetText)
            .split(/✖|×|\n/)
            .map((err) => err.trim())
            .filter((err) => err.length > 0)
    }, [errorMessage])

    const jsonPayload = React.useMemo(() => {
        if (typeof errorMessage === "object" && errorMessage !== null) {
            return errorMessage
        }
        return { error: errorMessage }
    }, [errorMessage])

    const jsonString = JSON.stringify(jsonPayload, null, 2)

    const copyJson = () => {
        navigator.clipboard.writeText(jsonString)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    if (parsedErrors.length === 0) return null

    return (
        <Alert variant="destructive" className="mt-3 rounded-2xl border border-destructive/30 bg-destructive/5 flex flex-col gap-2.5">
            <div className="flex items-start justify-between w-full">
                <div className="flex items-center gap-2">
                    <WarningCircleIcon className="h-4 w-4 shrink-0 text-destructive" />
                    <AlertTitle className="font-medium text-xs text-destructive tracking-wide m-0">{title}</AlertTitle>
                </div>
                <Button
                    variant="outline"
                    size="xs"
                    className="h-6 px-2 text-[10px] gap-1 bg-background/50 cursor-pointer"
                    onClick={copyJson}
                >
                    {copied ? <CheckIcon className="h-3 w-3 text-primary" /> : <CopyIcon className="h-3 w-3" />}
                    <span>{copied ? "Copied" : "Copy JSON"}</span>
                </Button>
            </div>

            <AlertDescription className="text-xs font-normal w-full">
                <ul className="list-disc pl-4 space-y-1 mb-2">
                    {parsedErrors.map((errItem, idx) => (
                        <li key={idx} className="font-normal text-[11px] leading-relaxed text-foreground/90">
                            {errItem}
                        </li>
                    ))}
                </ul>

                {/* JSON Payload List Box */}
                <div className="mt-2 space-y-1">
                    <p className="text-[10px] font-normal text-muted-foreground uppercase tracking-wider">
                        Error JSON Payload List:
                    </p>
                    <pre className="rounded-xl bg-muted/60 p-2.5 font-mono text-[11px] text-foreground border border-border/50">
                        <ScrollArea className="max-h-28">
                            {JSON.stringify(parsedErrors, null, 2)}
                        </ScrollArea>
                    </pre>
                </div>
            </AlertDescription>
        </Alert>
    )
}

interface ToastNotificationProps {
    title?: string
    message: string | null | Record<string, unknown> | unknown
    onClose: () => void
}

/**
 * Centered Dialog Modal Toast Notification with Priority Detail Handling & JSON List View
 */
export function ErrorDialog({ 
    title = "Action Failed", 
    message, 
    onClose 
}: ToastNotificationProps) {
    const [copied, setCopied] = useState(false)

    const parsedList = React.useMemo(() => {
        if (!message) return []

        let targetText: unknown = message
        if (typeof message === "object" && message !== null) {
            const errObj = message as Record<string, unknown>
            if (errObj.detail) {
                targetText = errObj.detail
            } else if (errObj.error) {
                targetText = errObj.error
            } else {
                return Object.entries(errObj).map(([field, err]) => {
                    const text = Array.isArray(err) ? err.join(", ") : String(err)
                    return `${field}: ${text}`
                })
            }
        }

        return String(targetText)
            .split(/✖|×|\n/)
            .map((err) => err.trim())
            .filter((err) => err.length > 0)
    }, [message])

    const jsonPayload = React.useMemo(() => {
        if (typeof message === "object" && message !== null) {
            return message
        }
        return { error: message }
    }, [message])

    const jsonString = JSON.stringify(jsonPayload, null, 2)

    const copyJson = () => {
        navigator.clipboard.writeText(jsonString)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    if (!message) return null

    return (
        <Dialog open={Boolean(message)} onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="max-w-md rounded-3xl p-6">
                <DialogHeader className="space-y-1.5">
                    <div className="flex items-center gap-2">
                        <WarningCircleIcon className="h-5 w-5 text-destructive shrink-0" />
                        <DialogTitle className="text-base font-medium">{title}</DialogTitle>
                    </div>
                    <DialogDescription className="text-xs">
                        An unexpected error occurred during execution. Diagnostic details are provided below.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-3">
                    {/* {parsedList.length > 1 ? (
                        <ul className="list-disc pl-4 space-y-1 text-xs text-muted-foreground font-normal">
                            {parsedList.map((item, i) => (
                                <li key={i}>{item}</li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-muted-foreground text-xs leading-relaxed font-normal">
                            {parsedList[0] || String(message)}
                        </p>
                    )} */}

                    {/* Complete JSON Payload List View */}
                    <div className="space-y-1 relative ">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-normal text-muted-foreground uppercase tracking-wider">
                                Error JSON Payload List:
                            </span>
                            <Button
                                variant="outline"
                                size="xs"
                                className="h-6 px-2 text-[10px] gap-1 bg-background cursor-pointer"
                                onClick={copyJson}
                            >
                                {copied ? <CheckIcon className="h-3 w-3 text-primary" /> : <CopyIcon className="h-3 w-3" />}
                                <span>{copied ? "Copied" : "Copy JSON"}</span>
                            </Button>
                        </div>
                        <ScrollArea className="h-40 w-full rounded-2xl bg-muted/60 p-3 border border-border font-mono text-[11px] text-foreground">
                            <pre className="whitespace-pre-wrap break-all">
                                {JSON.stringify(parsedList, null, 2)}
                            </pre>
                        </ScrollArea>
                    </div>
                </div>

                <DialogFooter className="pt-2">
                    <Button variant="outline" size="sm" className="w-full" onClick={onClose}>
                        Dismiss
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}