import * as React from "react";
import {
  Briefcase,
  Command as CommandIcon,
  CreditCard,
  FileText,
  Home,
  LogOut,
  Search,
  Settings,
  Shield,
  Sparkles,
  UserCircle2,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DialogTitle } from "@/components/ui/dialog";
import type { Organization, Membership } from "@/hooks/use-organization";
import type { User as SelectUser } from "@shared/schema";

type AtsTopBarProps = {
  location: string;
  navigate: (path: string) => void;
  onLogout: () => void;
  user: SelectUser | null;
  organizationData: { organization: Organization; membership: Membership } | null | undefined;
  isRecruiter: boolean;
  isAdmin: boolean;
  isOrgOwnerOrAdmin: boolean;
  displayName: string;
};

type RouteMeta = {
  path: string;
  label: string;
  description: string;
  icon: LucideIcon;
  section: string;
  match: (location: string) => boolean;
};

const ATS_ROUTES: RouteMeta[] = [
  {
    path: "/recruiter-dashboard",
    label: "Dashboard",
    description: "Recruiter performance, actions, and interview pipeline",
    icon: Home,
    section: "Workspace",
    match: (location) => location === "/recruiter-dashboard",
  },
  {
    path: "/applications",
    label: "Applications",
    description: "Review and move candidates through the pipeline",
    icon: Briefcase,
    section: "Workspace",
    match: (location) => location === "/applications" || location.startsWith("/jobs/") && location.includes("/applications"),
  },
  {
    path: "/candidates",
    label: "Talent Search",
    description: "Search your talent pool and rediscover candidates",
    icon: Search,
    section: "Workspace",
    match: (location) => location.startsWith("/candidates"),
  },
  {
    path: "/my-jobs",
    label: "My Jobs",
    description: "Open roles, sourcing, and job operations",
    icon: Briefcase,
    section: "Workspace",
    match: (location) => location === "/my-jobs" || /^\/jobs\/\d+/.test(location),
  },
  {
    path: "/clients",
    label: "Clients",
    description: "Manage client relationships and shared hiring workflows",
    icon: Users,
    section: "Workspace",
    match: (location) => location.startsWith("/clients"),
  },
  {
    path: "/admin/forms",
    label: "Forms",
    description: "Application forms and intake flows",
    icon: FileText,
    section: "Workspace",
    match: (location) => location.startsWith("/admin/forms"),
  },
  {
    path: "/admin/email-templates",
    label: "Email",
    description: "Templates and outreach assets",
    icon: Sparkles,
    section: "Workspace",
    match: (location) => location.startsWith("/admin/email-templates"),
  },
  {
    path: "/profile/settings",
    label: "Profile Settings",
    description: "Personal recruiter profile and preferences",
    icon: Settings,
    section: "Account",
    match: (location) => location.startsWith("/profile/settings"),
  },
  {
    path: "/org/settings",
    label: "Org Settings",
    description: "Organization setup and permissions",
    icon: Settings,
    section: "Organization",
    match: (location) => location.startsWith("/org/settings"),
  },
  {
    path: "/org/team",
    label: "Team Members",
    description: "Seats, roles, and collaborator access",
    icon: Users,
    section: "Organization",
    match: (location) => location.startsWith("/org/team"),
  },
  {
    path: "/org/billing",
    label: "Billing",
    description: "Subscription and payment settings",
    icon: CreditCard,
    section: "Organization",
    match: (location) => location.startsWith("/org/billing"),
  },
  {
    path: "/org/analytics",
    label: "Organization Analytics",
    description: "Org-level performance analytics",
    icon: Shield,
    section: "Organization",
    match: (location) => location.startsWith("/org/analytics"),
  },
  {
    path: "/admin",
    label: "Admin Dashboard",
    description: "Platform-level controls and oversight",
    icon: Shield,
    section: "Admin",
    match: (location) => location === "/admin",
  },
  {
    path: "/pricing",
    label: "Pricing",
    description: "Plans, entitlements, and upgrade options",
    icon: CreditCard,
    section: "Workspace",
    match: (location) => location === "/pricing",
  },
];

function initialsForUser(user: SelectUser | null) {
  return `${user?.firstName?.[0] ?? ""}${user?.lastName?.[0] ?? user?.username?.[0] ?? "U"}`.toUpperCase();
}

export function AtsTopBar({
  location,
  navigate,
  onLogout,
  user,
  organizationData,
  isRecruiter,
  isAdmin,
  isOrgOwnerOrAdmin,
  displayName,
}: AtsTopBarProps) {
  const [commandOpen, setCommandOpen] = React.useState(false);
  const currentRoute =
    ATS_ROUTES.find((route) => route.match(location)) ??
    ATS_ROUTES.find((route) => route.path === "/recruiter-dashboard")!;

  const quickRoutes = React.useMemo(
    () =>
      ATS_ROUTES.filter((route) => {
        if (route.path.startsWith("/org/") && !isOrgOwnerOrAdmin) return false;
        if (route.path === "/admin" && !isAdmin) return false;
        return true;
      }),
    [isAdmin, isOrgOwnerOrAdmin],
  );

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((open) => !open);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const primaryAction = isRecruiter || isAdmin
    ? {
        label: "Post New Job",
        path: "/jobs/post",
      }
    : null;

  return (
    <>
      <header className="sticky top-0 z-20 overflow-x-hidden border-b border-[#E6E9F2] bg-[rgba(248,249,252,0.82)] backdrop-blur-xl">
        <div className="relative">
          <div className="absolute inset-x-0 top-0 h-full bg-[radial-gradient(circle_at_top_left,_rgba(196,192,255,0.26),_transparent_35%),radial-gradient(circle_at_top_right,_rgba(196,236,255,0.18),_transparent_32%)]" />
          <div className="relative flex h-[76px] min-w-0 items-center justify-between gap-4 px-4 md:px-6">
            <div className="flex min-w-0 items-center gap-3 md:gap-4">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8B93A6]">
                  {currentRoute.section}
                </div>
                <div className="truncate text-[20px] font-extrabold tracking-[-0.03em] text-[#111827]">
                  {currentRoute.label}
                </div>
                <div className="hidden truncate text-[13px] text-[#6C7486] md:block">
                  {currentRoute.description}
                </div>
              </div>
            </div>

            <div className="flex min-w-0 items-center gap-2 md:gap-3">
              <button
                type="button"
                onClick={() => setCommandOpen(true)}
                className="hidden w-[220px] items-center gap-3 rounded-[18px] border border-[#E6E9F2] bg-white/92 px-4 py-3 text-left shadow-[0_10px_24px_rgba(15,23,42,0.05)] transition-colors hover:bg-[#FCFCFE] xl:flex"
              >
                <Search className="h-4 w-4 text-[#81889A]" />
                <span className="truncate text-sm text-[#81889A]">Jump to pages, workflows, and settings…</span>
                <span className="ml-auto rounded-md border border-[#E8EBF2] bg-[#F8F9FC] px-1.5 py-0.5 text-[11px] font-semibold text-[#9097A8]">
                  ⌘K
                </span>
              </button>

              <button
                type="button"
                onClick={() => setCommandOpen(true)}
                className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[#E6E9F2] bg-white text-[#5F6B85] shadow-[0_8px_24px_rgba(15,23,42,0.04)] hover:bg-[#F5F7FB] lg:hidden"
                aria-label="Open quick jump"
              >
                <CommandIcon className="h-4 w-4" />
              </button>

              {primaryAction ? (
                <Button
                  onClick={() => navigate(primaryAction.path)}
                  className="hidden rounded-[18px] bg-[linear-gradient(135deg,#4D41DF_0%,#675DF9_100%)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_16px_30px_rgba(77,65,223,0.26)] hover:opacity-95 lg:inline-flex"
                >
                  {primaryAction.label}
                </Button>
              ) : null}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-3 rounded-[18px] border border-[#E6E9F2] bg-white/92 px-2.5 py-2 shadow-[0_10px_24px_rgba(15,23,42,0.05)] hover:bg-[#FCFCFE]"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#DCD8FF_0%,#BFC7FF_100%)] text-sm font-semibold text-[#4338CA]">
                      {initialsForUser(user)}
                    </div>
                    <div className="hidden min-w-0 text-left lg:block">
                      <div className="truncate text-sm font-semibold text-[#111827]">{displayName}</div>
                      <div className="truncate text-xs text-[#7B8497]">
                        {organizationData?.organization?.name ?? (isRecruiter ? "Recruiter Workspace" : "ATS Workspace")}
                      </div>
                    </div>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64 rounded-2xl border-[#E6E9F2] p-2">
                  <DropdownMenuLabel className="px-3 py-2">
                    <div className="text-sm font-semibold text-[#111827]">{displayName}</div>
                    <div className="text-xs text-[#7B8497]">{user?.username ?? ""}</div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => navigate("/profile/settings")}
                    className="cursor-pointer rounded-xl px-3 py-2.5 text-sm font-medium text-[#4A5568] focus:bg-[#F3F4F8] focus:text-[#4338CA]"
                  >
                    <UserCircle2 className="mr-2 h-4 w-4" />
                    Profile Settings
                  </DropdownMenuItem>
                  {isOrgOwnerOrAdmin ? (
                    <DropdownMenuItem
                      onClick={() => navigate("/org/settings")}
                      className="cursor-pointer rounded-xl px-3 py-2.5 text-sm font-medium text-[#4A5568] focus:bg-[#F3F4F8] focus:text-[#4338CA]"
                    >
                      <Settings className="mr-2 h-4 w-4" />
                      Organization Settings
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={onLogout}
                    className="cursor-pointer rounded-xl px-3 py-2.5 text-sm font-medium text-[#D84C49] focus:bg-[#FFF1F1] focus:text-[#D84C49]"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>

      <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
        <DialogTitle className="sr-only">Quick jump</DialogTitle>
        <CommandInput placeholder="Search pages, settings, and ATS workflows…" />
        <CommandList className="max-h-[420px]">
          <CommandEmpty>No matching routes.</CommandEmpty>
          <CommandGroup heading="Navigate">
            {quickRoutes.map((route) => {
              const Icon = route.icon;
              return (
                <CommandItem
                  key={route.path}
                  value={`${route.label} ${route.description}`}
                  onSelect={() => {
                    navigate(route.path);
                    setCommandOpen(false);
                  }}
                  className="rounded-xl px-3 py-3"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F3F4F8] text-[#5B4FF7]">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-[#111827]">{route.label}</span>
                    <span className="text-xs text-[#7B8497]">{route.description}</span>
                  </div>
                  <CommandShortcut>Go</CommandShortcut>
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
