import { SWRConfig } from "swr"
import { swrConfig } from "./lib/swr";
import { ThemeProvider } from "./contexts/theme-context";
import { TooltipProvider } from "@/components/ui/tooltip"
import { RouterProvider } from "react-router-dom"
import { router } from "./router";
import { HealthProvider } from "./contexts/health-context";
import { Toaster } from "@/components/ui/sonner"; 

export default function App() {
    return (
        <ThemeProvider>
            {(theme) => (
                <SWRConfig value={swrConfig}>
                    <TooltipProvider>
                        <HealthProvider>
                            <RouterProvider
                                useTransitions={true}
                                router={router}
                            />
                            {/* Global Sonner Toaster mounted here */}
                            <Toaster
						theme={theme}
						position="bottom-right"
						// toastOptions={{
						// 	className: "!items-start !gap-3 !rounded-4xl !p-5",
						// 	classNames: {
						// 		icon: "[&>svg]:!size-7 [&>svg]:mt-2",
						// 		title: "!text-lg",
						// 		description: "!text-sm !text-muted-foreground",
						// 		actionButton: "!p-4 !h-6 !rounded-full capitalize",
						// 	},
						// }}
					/>
                        </HealthProvider>
                    </TooltipProvider>
                </SWRConfig>
            )}
        </ThemeProvider>
    );
}