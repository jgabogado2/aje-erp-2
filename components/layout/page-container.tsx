"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

// Breadcrumb icon
const ChevronRight = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface PageContainerProps {
  /** Page title displayed prominently */
  title: string;
  /** Optional description below the title */
  description?: string;
  /** Action buttons/elements aligned to the right of the title */
  actions?: React.ReactNode;
  /** Breadcrumb navigation items */
  breadcrumbs?: BreadcrumbItem[];
  /** Main page content */
  children: React.ReactNode;
  /** Additional classes for the container */
  className?: string;
  /** Additional classes for the content area */
  contentClassName?: string;
  /** Whether to use max-width constraints */
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "full";
  /** Whether to add padding to content area */
  noPadding?: boolean;
}

const maxWidthClasses = {
  sm: "max-w-screen-sm",
  md: "max-w-screen-md",
  lg: "max-w-screen-lg",
  xl: "max-w-screen-xl",
  "2xl": "max-w-screen-2xl",
  full: "max-w-full",
};

function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-3">
      <ol className="flex items-center gap-1 text-sm text-muted-foreground">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={index} className="flex items-center gap-1">
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  className={cn(isLast && "font-medium text-foreground")}
                  aria-current={isLast ? "page" : undefined}
                >
                  {item.label}
                </span>
              )}
              {!isLast && (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
}: Pick<PageContainerProps, "title" | "description" | "actions" | "breadcrumbs">) {
  return (
    <div className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="px-6 py-6 lg:px-8">
        {/* Breadcrumbs */}
        {breadcrumbs && breadcrumbs.length > 0 && <Breadcrumbs items={breadcrumbs} />}

        {/* Title row */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Title and description */}
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground lg:text-3xl">
              {title}
            </h1>
            {description && (
              <p className="mt-1.5 text-sm text-muted-foreground lg:text-base">
                {description}
              </p>
            )}
          </div>

          {/* Actions */}
          {actions && (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          )}
        </div>
      </div>
    </div>
  );
}

export function PageContainer({
  title,
  description,
  actions,
  breadcrumbs,
  children,
  className,
  contentClassName,
  maxWidth = "2xl",
  noPadding = false,
}: PageContainerProps) {
  return (
    <div className={cn("flex h-full flex-col", className)}>
      {/* Sticky header */}
      <PageHeader
        title={title}
        description={description}
        actions={actions}
        breadcrumbs={breadcrumbs}
      />

      {/* Scrollable content */}
      <ScrollArea className="flex-1">
        <main
          className={cn(
            "mx-auto w-full",
            maxWidthClasses[maxWidth],
            !noPadding && "px-6 py-6 lg:px-8 lg:py-8",
            contentClassName
          )}
        >
          {children}
        </main>
      </ScrollArea>
    </div>
  );
}

// Compound components for flexible composition
PageContainer.Header = PageHeader;
PageContainer.Breadcrumbs = Breadcrumbs;

// Section component for organizing page content
export function PageSection({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-4", className)}>
      {(title || description || actions) && (
        <div className="flex items-start justify-between gap-4">
          <div>
            {title && (
              <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
            )}
            {description && (
              <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

// Card wrapper for content sections
export function PageCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-6 shadow-sm",
        className
      )}
    >
      {children}
    </div>
  );
}

// Empty state component
export function PageEmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {icon && (
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

