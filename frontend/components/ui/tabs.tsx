"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

/**
 * `pill` is the shadcn default. `underline` reads as a document's section rule
 * rather than a control, which suits full-page views where the tabs are the
 * primary navigation instead of a widget inside a card.
 *
 * <p>`underline` is the switch inside a rail: chat or outline. A word, and a
 * 2px rule on a boundary the layout already has. Set in ink, not in the accent:
 * choosing a reading mode is not something Reverie noticed.
 *
 * <p>`segmented` is the V2 <b>reading mode</b> switch on a meeting — Summary or
 * Transcript. `18-meeting-brief.png` and `19-meeting-transcript.png` draw it as
 * one rounded container holding both modes, with the active one filled a shade
 * lighter. It reads as a two-position control rather than as two links, which
 * is what it is: there is no third place to go and no hierarchy between them.
 *
 * <p>Not the shadcn `pill`, which fills with `bg-background` and casts a
 * shadow. This is 4% white in a hairline, and the active segment is 7% — the
 * whole contrast budget of the thing is about one step.
 */
type TabsVariant = "pill" | "underline" | "segmented";

const TabsVariantContext = React.createContext<TabsVariant>("pill");

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & { variant?: TabsVariant }
>(({ className, variant = "pill", ...props }, ref) => (
  <TabsVariantContext.Provider value={variant}>
    <TabsPrimitive.List
      ref={ref}
      className={cn(
        variant === "underline"
          ? "inline-flex items-center gap-6 border-b border-line text-ink-3"
          : variant === "segmented"
            ? "inline-flex items-center gap-0.5 rounded-lg bg-white/[0.04] p-1 shadow-[inset_0_0_0_1px_rgb(var(--edge))]"
            : "inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground",
        className
      )}
      {...props}
    />
  </TabsVariantContext.Provider>
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => {
  const variant = React.useContext(TabsVariantContext);
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
        variant === "underline"
          ? // -1px pulls the active rule over the list's own border so they read
            // as one line rather than two stacked.
            "relative -mb-px border-b-2 border-transparent px-0 pb-2.5 pt-1 text-callout hover:text-ink-2 data-[state=active]:border-ink data-[state=active]:font-headline data-[state=active]:text-ink"
          : variant === "segmented"
            ? "gap-1.5 rounded-md px-2.5 py-1 text-callout text-ink-3 hover:text-ink-2 data-[state=active]:bg-white/[0.07] data-[state=active]:font-headline data-[state=active]:text-ink"
            : "rounded-md px-3 py-1 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow",
        className
      )}
      {...props}
    />
  );
});
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn("mt-4 focus-visible:outline-none", className)}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
