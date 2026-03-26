import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Plus, Search, Mail, Calendar, ChevronUp } from "lucide-react";
import { useState } from "react";

interface FABAction {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  variant?: "default" | "outline";
}

export default function FloatingActionButton() {
  const { user } = useAuth();
  const [location, setLocation] = useLocation();
  const [isExpanded, setIsExpanded] = useState(false);

  if (!user) return null;

  // Determine primary and secondary actions based on role and current page
  const getActions = (): { primary: FABAction; secondary?: FABAction[] } => {
    const isRecruiterOrAdmin = user.role === 'recruiter' || user.role === 'super_admin';
    const isCandidate = user.role === 'candidate';

    // Application management page (recruiters)
    if (location.includes('/jobs/') && location.includes('/applications')) {
      return {
        primary: {
          label: "Schedule Interview",
          icon: <Calendar className="h-5 w-5" />,
          onClick: () => {
            // This will trigger when bulk selection exists
            // For now, just show a helpful message
            alert("Select candidates to schedule bulk interviews");
          },
        },
        secondary: [
          {
            label: "Send Email",
            icon: <Mail className="h-5 w-5" />,
            onClick: () => alert("Select candidates to send bulk emails"),
          },
          {
            label: "Post New Job",
            icon: <Plus className="h-5 w-5" />,
            onClick: () => setLocation("/jobs/post"),
          },
        ],
      };
    }

    // Default actions for recruiters
    if (isRecruiterOrAdmin) {
      return {
        primary: {
          label: "Post Job",
          icon: <Plus className="h-5 w-5" />,
          onClick: () => setLocation("/jobs/post"),
        },
      };
    }

    // Default actions for candidates
    if (isCandidate) {
      return {
        primary: {
          label: "Browse Jobs",
          icon: <Search className="h-5 w-5" />,
          onClick: () => setLocation("/jobs"),
        },
      };
    }

    // Fallback - no FAB
    return {
      primary: {
        label: "",
        icon: null,
        onClick: () => {},
      },
    };
  };

  const { primary, secondary } = getActions();

  // Don't show FAB if no primary action
  if (!primary.label) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {/* Secondary Actions (shown when expanded) */}
      {secondary && isExpanded && (
        <div className="flex flex-col gap-2 animate-slide-up">
          {secondary.map((action, index) => (
            <Button
              key={index}
              onClick={() => {
                action.onClick();
                setIsExpanded(false);
              }}
              variant="outline"
              size="lg"
              className="bg-white/10 backdrop-blur-md border-white/20 text-white hover:bg-white/20 shadow-lg"
            >
              {action.icon}
              <span className="ml-2">{action.label}</span>
            </Button>
          ))}
        </div>
      )}

      {/* Primary Action Button */}
      <div className="flex items-center gap-3">
        {/* Expand/Collapse button (only if secondary actions exist) */}
        {secondary && secondary.length > 0 && (
          <Button
            onClick={() => setIsExpanded(!isExpanded)}
            size="icon"
            aria-label={isExpanded ? "Collapse quick actions" : "Expand quick actions"}
            className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white shadow-lg h-12 w-12 rounded-full"
          >
            <ChevronUp
              className={`h-5 w-5 transition-transform duration-300 ${
                isExpanded ? "rotate-180" : ""
              }`}
            />
          </Button>
        )}

        {/* Primary FAB */}
        <Button
          onClick={primary.onClick}
          size="lg"
          className="bg-gradient-to-r from-[#7B38FB] to-[#FF5BA8] hover:from-[#6B28EB] hover:to-[#EF4B98] text-white shadow-2xl h-14 px-6 rounded-full animate-pulse-slow"
        >
          {primary.icon}
          <span className="ml-2 font-semibold">{primary.label}</span>
        </Button>
      </div>

      {/* Pulse animation style */}
      <style>{`
        @keyframes pulse-slow {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(123, 56, 251, 0.7);
          }
          50% {
            box-shadow: 0 0 0 15px rgba(123, 56, 251, 0);
          }
        }
        .animate-pulse-slow {
          animation: pulse-slow 3s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        @keyframes slide-up {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
