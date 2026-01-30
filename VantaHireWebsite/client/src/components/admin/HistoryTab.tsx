import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { History, AlertCircle } from "lucide-react";
import { format } from "date-fns";

interface AuditLogEntry {
  id: number;
  organizationId: number;
  subscriptionId: number | null;
  action: string;
  previousValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  performedBy: number | null;
  performedAt: string;
  reason: string | null;
}

interface HistoryTabProps {
  orgId: number;
}

async function fetchAuditLog(orgId: number): Promise<{ logs: AuditLogEntry[] }> {
  const res = await fetch(`/api/admin/organizations/${orgId}/audit-log?limit=100`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to fetch audit log");
  return res.json();
}

function getActionLabel(action: string): string {
  const labels: Record<string, string> = {
    created: "Created",
    upgraded: "Upgraded",
    downgraded: "Downgraded",
    seats_added: "Seats Added",
    seats_removed: "Seats Removed",
    cancelled: "Cancelled",
    reactivated: "Reactivated",
    admin_override: "Admin Override",
  };
  return labels[action] || action;
}

function getActionBadgeVariant(action: string): "default" | "secondary" | "destructive" | "outline" {
  switch (action) {
    case "upgraded":
    case "seats_added":
    case "reactivated":
      return "default";
    case "downgraded":
    case "seats_removed":
    case "cancelled":
      return "destructive";
    case "admin_override":
      return "secondary";
    default:
      return "outline";
  }
}

function formatChanges(previousValue: Record<string, unknown> | null, newValue: Record<string, unknown> | null): string[] {
  const changes: string[] = [];

  if (!newValue) return changes;

  // Handle plan changes
  if (newValue.planId && (!previousValue || previousValue.planId !== newValue.planId)) {
    changes.push(`Plan changed to ID: ${newValue.planId}`);
  }

  // Handle seat changes
  if (newValue.seats !== undefined) {
    if (previousValue?.seats !== undefined) {
      const diff = (newValue.seats as number) - (previousValue.seats as number);
      changes.push(`Seats: ${previousValue.seats} → ${newValue.seats} (${diff > 0 ? '+' : ''}${diff})`);
    } else {
      changes.push(`Seats set to ${newValue.seats}`);
    }
  }

  // Handle status changes
  if (newValue.status && (!previousValue || previousValue.status !== newValue.status)) {
    changes.push(`Status: ${previousValue?.status || 'none'} → ${newValue.status}`);
  }

  // Handle bonus credits
  if (newValue.bonusCredits !== undefined) {
    if (previousValue?.bonusCredits !== undefined) {
      const diff = (newValue.bonusCredits as number) - (previousValue.bonusCredits as number);
      changes.push(`Bonus credits: ${diff > 0 ? '+' : ''}${diff}`);
    } else if (newValue.bonusAmount) {
      changes.push(`Bonus credits granted: +${newValue.bonusAmount}`);
    } else {
      changes.push(`Bonus credits: ${newValue.bonusCredits}`);
    }
  }

  // Handle custom credit limit
  if (newValue.customCreditLimit !== undefined) {
    const prev = previousValue?.customCreditLimit;
    if (newValue.customCreditLimit === null) {
      changes.push(`Custom credit limit removed`);
    } else if (prev !== undefined) {
      changes.push(`Custom limit: ${prev || 'default'} → ${newValue.customCreditLimit}`);
    } else {
      changes.push(`Custom limit set: ${newValue.customCreditLimit}`);
    }
  }

  // Handle feature overrides
  if (newValue.featureOverrides) {
    const overrides = newValue.featureOverrides as Record<string, boolean>;
    const featureChanges = Object.entries(overrides).map(([key, value]) => {
      return `${key}: ${value ? 'enabled' : 'disabled'}`;
    });
    if (featureChanges.length > 0) {
      changes.push(`Features: ${featureChanges.join(', ')}`);
    }
  }

  // Handle period extension
  if (newValue.currentPeriodEnd) {
    changes.push(`Period extended`);
  }

  // Handle billing cycle
  if (newValue.billingCycle) {
    changes.push(`Billing cycle: ${newValue.billingCycle}`);
  }

  // Handle cancel at period end
  if (newValue.cancelAtPeriodEnd !== undefined) {
    changes.push(newValue.cancelAtPeriodEnd ? 'Set to cancel at period end' : 'Cancellation removed');
  }

  return changes.length > 0 ? changes : ['Configuration updated'];
}

export default function HistoryTab({ orgId }: HistoryTabProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "org-audit-log", orgId],
    queryFn: () => fetchAuditLog(orgId),
    enabled: !!orgId,
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-muted-foreground">
            <AlertCircle className="h-12 w-12 mx-auto mb-4" />
            <p>Failed to load audit history.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const logs = data?.logs || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5" />
          Audit History
        </CardTitle>
        <CardDescription>
          All administrative changes for this organization, including subscriptions, credits, and features.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {logs.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            No history recorded yet
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px]">Date</TableHead>
                <TableHead className="w-[120px]">Action</TableHead>
                <TableHead>Changes</TableHead>
                <TableHead className="w-[200px]">Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((entry) => {
                const changes = formatChanges(entry.previousValue, entry.newValue);

                return (
                  <TableRow key={entry.id}>
                    <TableCell className="text-sm whitespace-nowrap">
                      {format(new Date(entry.performedAt), "MMM d, yyyy")}
                      <br />
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(entry.performedAt), "HH:mm")}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getActionBadgeVariant(entry.action)}>
                        {getActionLabel(entry.action)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <ul className="text-sm space-y-1">
                        {changes.map((change, idx) => (
                          <li key={idx} className="text-muted-foreground">
                            {change}
                          </li>
                        ))}
                      </ul>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {entry.reason || "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
