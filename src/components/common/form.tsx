"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";

export function Field({
  label,
  htmlFor,
  hint,
  className,
  children,
}: {
  label: React.ReactNode;
  htmlFor?: string;
  hint?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
      {hint && <p className="text-[11px] leading-snug text-muted-foreground/80">{hint}</p>}
    </div>
  );
}

export interface Option<T extends string> {
  value: T;
  label: React.ReactNode;
}

export function SimpleSelect<T extends string>({
  value,
  onChange,
  options,
  id,
  className,
  size = "default",
  ariaLabel,
  disabled,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Option<T>[];
  id?: string;
  className?: string;
  size?: "sm" | "default";
  ariaLabel?: string;
  disabled?: boolean;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as T)} disabled={disabled}>
      <SelectTrigger id={id} size={size} className={cn("w-full", className)} aria-label={ariaLabel}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-80">
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function LabeledSlider({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  format,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  format?: (v: number) => string;
  hint?: string;
}) {
  const id = React.useId();
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs">
        <label htmlFor={id} className="font-medium text-muted-foreground">
          {label}
        </label>
        <span className="tabular text-foreground/80">{format ? format(value) : value.toFixed(2)}</span>
      </div>
      <Slider id={id} value={[value]} min={min} max={max} step={step} onValueChange={(v) => onChange(v[0])} aria-label={label} />
      {hint && <p className="text-[11px] text-muted-foreground/80">{hint}</p>}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  icon: Icon,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3 md:px-5">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-base font-semibold tracking-tight">
          {Icon && <Icon className="size-4 text-mint" />}
          {title}
        </h1>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border px-6 py-10 text-center">
      {Icon && <Icon className="size-6 text-muted-foreground" />}
      <div className="text-sm font-medium">{title}</div>
      {children && <div className="max-w-md text-xs text-muted-foreground">{children}</div>}
      {action}
    </div>
  );
}

export function Panel({ title, actions, className, children }: { title?: React.ReactNode; actions?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <section className={cn("rounded-lg border border-border bg-card", className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h2>
          {actions && <div className="flex items-center gap-1.5">{actions}</div>}
        </div>
      )}
      <div className="p-3">{children}</div>
    </section>
  );
}
