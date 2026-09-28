import {
  Ban, Check, Circle, CircleDot, Construction, Cpu,
  Droplets, Layers, Lightbulb, Trash2, Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Category, Priority, Status } from "../api/types";
import { labelize } from "../lib/format";

const CATEGORY_ICONS: Record<Category, LucideIcon> = {
  water: Droplets,
  electricity: Zap,
  sanitation: Trash2,
  roads: Construction,
  streetlights: Lightbulb,
  other: Layers,
};

const STATUS_ICONS: Record<Status, LucideIcon> = {
  open: Circle,
  in_progress: CircleDot,
  resolved: Check,
  rejected: Ban,
};

export function CategoryChip({ category }: { category: Category }) {
  const Icon = CATEGORY_ICONS[category] ?? Layers;
  return (
    <span className="chip" data-cat={category}>
      <Icon size={14} aria-hidden="true" />
      {labelize(category)}
    </span>
  );
}

export function PrioritySignal({ priority }: { priority: Priority }) {
  const level = priority === "high" ? 3 : priority === "normal" ? 2 : 1;
  return (
    <span className="signal" data-level={level}>
      <span className="signal__bars" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      {labelize(priority)} priority
    </span>
  );
}

export function StatusBadge({ status }: { status: Status }) {
  const Icon = STATUS_ICONS[status] ?? Circle;
  return (
    <span className="status" data-status={status}>
      <Icon size={13} aria-hidden="true" />
      {labelize(status)}
    </span>
  );
}

export function ProviderChip({ provider }: { provider: string | null }) {
  if (!provider) return null;
  const isFallback = provider.includes("fallback");
  return (
    <span className="chip" data-variant={isFallback ? "warn" : undefined}>
      <Cpu size={14} aria-hidden="true" />
      {provider}
    </span>
  );
}