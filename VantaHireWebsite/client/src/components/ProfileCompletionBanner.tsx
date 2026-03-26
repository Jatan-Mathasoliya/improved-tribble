import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useProfileStatus } from "@/hooks/use-profile-status";
import { ProfileCompletionModal } from "@/components/ProfileCompletionModal";
import { X, User, ChevronRight } from "lucide-react";

export function ProfileCompletionBanner() {
  const [, setLocation] = useLocation();
  const [showModal, setShowModal] = useState(false);
  const {
    profileStatus,
    shouldShowBanner,
    completionPercent,
    missingRequired,
    snooze,
    isSnoozing,
    getFieldLabel,
  } = useProfileStatus();

  if (!shouldShowBanner || !profileStatus) {
    return null;
  }

  const handleCompleteProfile = () => {
    // Navigate to appropriate profile page based on role
    if (profileStatus.role === "candidate") {
      setLocation("/my-dashboard");
    } else {
      setLocation("/profile/settings");
    }
  };

  const handleDismissForNow = () => {
    snooze(1); // Snooze for 1 day
  };

  return (
    <>
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-4 rounded-lg mb-6 shadow-sm">
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div className="shrink-0 p-2 bg-white/10 rounded-full">
            <User className="h-5 w-5" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-semibold text-base">Complete your profile</h3>
                <p className="text-sm text-blue-100 mt-0.5">
                  {missingRequired.length > 0 ? (
                    <>
                      Add your {missingRequired.slice(0, 2).map(getFieldLabel).join(" and ")}
                      {missingRequired.length > 2 && ` and ${missingRequired.length - 2} more`} to get started.
                    </>
                  ) : (
                    "Just a few optional fields left to make your profile stand out."
                  )}
                </p>
              </div>

              {/* Dismiss button */}
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 text-white/70 hover:text-white hover:bg-white/10 h-8 w-8"
                onClick={handleDismissForNow}
                disabled={isSnoozing}
                title="Remind me tomorrow"
                aria-label="Remind me tomorrow"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Progress bar */}
            <div className="mt-3 flex items-center gap-3">
              <Progress
                value={completionPercent}
                className="h-2 flex-1 bg-white/20 [&>div]:bg-white"
              />
              <span className="text-sm font-medium shrink-0">{completionPercent}%</span>
            </div>

            {/* Actions */}
            <div className="mt-3 flex items-center gap-2">
              <Button
                size="sm"
                className="bg-white text-blue-600 hover:bg-blue-50"
                onClick={handleCompleteProfile}
              >
                Complete Profile
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-white/90 hover:text-white hover:bg-white/10"
                onClick={() => setShowModal(true)}
              >
                See what's missing
              </Button>
            </div>
          </div>
        </div>
      </div>

      <ProfileCompletionModal open={showModal} onOpenChange={setShowModal} />
    </>
  );
}
