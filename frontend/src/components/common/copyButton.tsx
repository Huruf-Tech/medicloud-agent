import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { CopyIcon, CheckIcon } from "@phosphor-icons/react";

export function CopyButton({ value }: { value: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // fallback: do nothing
        }
    }, [value]);

    return (
        <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0"
            onClick={handleCopy}
        >
            {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
        </Button>
    );
}
