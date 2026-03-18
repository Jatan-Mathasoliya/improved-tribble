import { useLocation } from "wouter";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { useOrganization } from "@/hooks/use-organization";
import { isApiError, type ApiError } from "@/lib/queryClient";

function isAiCreditExhaustionError(error: unknown): error is ApiError {
  return isApiError(error) && (
    error.code === "AI_CREDITS_EXHAUSTED" ||
    error.payload?.error === "Insufficient AI credits"
  );
}

export function useAiCreditExhaustionToast() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { data: organization } = useOrganization();
  const isOwner = organization?.membership?.role === "owner";

  const showAiCreditExhaustionToast = (error: unknown): boolean => {
    if (!isAiCreditExhaustionError(error)) {
      return false;
    }

    const payload = error.payload;
    const action = payload?.action === "upgrade_to_growth" ? "upgrade_to_growth" : "buy_more_credits";
    const title = action === "upgrade_to_growth" ? "Upgrade required" : "AI credits exhausted";

    let description = error.message;
    let ctaLabel = "View Plans";
    let href = payload?.pricingUrl || "/pricing";

    if (action === "buy_more_credits") {
      if (isOwner) {
        ctaLabel = "Buy More Credits";
        href = `${payload?.billingUrl || "/org/billing"}?buy_credits=1`;
      } else {
        ctaLabel = "View Billing";
        href = payload?.billingUrl || "/org/billing";
        description = `${description} Contact your organization owner if you need more credits added.`;
      }
    } else if (isOwner) {
      ctaLabel = "Upgrade to Growth";
      href = `${payload?.billingUrl || "/org/billing"}?upgrade=growth`;
    } else {
      description = `${description} Contact your organization owner to upgrade the workspace.`;
    }

    toast({
      title,
      description,
      variant: "destructive",
      action: (
        <ToastAction altText={ctaLabel} onClick={() => setLocation(href)}>
          {ctaLabel}
        </ToastAction>
      ),
    });

    return true;
  };

  return {
    showAiCreditExhaustionToast,
  };
}
