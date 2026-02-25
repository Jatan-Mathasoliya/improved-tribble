import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { FileText, Users, GitBranch, BarChart3, Search } from "lucide-react";

export interface JobSubNavProps {
  jobId: number;
  jobTitle?: string;
  className?: string;
}

type NavItem = {
  id: string;
  label: string;
  path: string;
  icon: React.ReactNode;
};

export function JobSubNav({ jobId, jobTitle, className }: JobSubNavProps) {
  const [location, setLocation] = useLocation();

  const navItems: NavItem[] = [
    {
      id: "details",
      label: "Details",
      path: `/jobs/${jobId}/edit`,
      icon: <FileText className="h-4 w-4" />,
    },
    {
      id: "applications",
      label: "Applications",
      path: `/jobs/${jobId}/applications`,
      icon: <Users className="h-4 w-4" />,
    },
    {
      id: "sourcing",
      label: "Sourcing",
      path: `/jobs/${jobId}/sourcing`,
      icon: <Search className="h-4 w-4" />,
    },
    {
      id: "pipeline",
      label: "Pipeline",
      path: `/jobs/${jobId}/pipeline`,
      icon: <GitBranch className="h-4 w-4" />,
    },
    {
      id: "analytics",
      label: "Analytics",
      path: `/jobs/${jobId}/analytics`,
      icon: <BarChart3 className="h-4 w-4" />,
    },
  ];

  // Determine active tab based on current location
  const getActiveId = () => {
    if (location.includes("/applications")) return "applications";
    if (location.includes("/sourcing")) return "sourcing";
    if (location.includes("/pipeline")) return "pipeline";
    if (location.includes("/analytics")) return "analytics";
    if (location.includes("/edit")) return "details";
    return "applications"; // default
  };

  const activeId = getActiveId();

  return (
    <div className={cn("border-b border-border bg-white rounded-t-lg", className)}>
      {jobTitle && (
        <div className="px-4 pt-3 pb-1">
          <h2 className="text-lg font-semibold text-foreground truncate">{jobTitle}</h2>
        </div>
      )}
      <nav className="flex gap-1 px-2 -mb-px overflow-x-auto" aria-label="Job navigation">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setLocation(item.path)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
              activeId === item.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            )}
            aria-current={activeId === item.id ? "page" : undefined}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
