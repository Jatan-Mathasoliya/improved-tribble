import * as React from "react";
import {
  Bell,
  Briefcase,
  ChevronRight,
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
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
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
import { SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
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
  match: (location: string) => boolean;
  breadcrumb?: string[];
};

const ATS_ROUTES: RouteMeta[] = [
  {
    path: "/recruiter-dashboard",
    label: "Dashboard",
    description: "Recruiter performance, actions, and interview pipeline",
    icon: Home,
    match: (location) => location === "/recruiter-dashboard",
    breadcrumb: ["Workspace", "Dashboard"],
  },
  {
    path: "/applications",
    label: "Applications",
    description: "Review and move candidates through the pipeline",
    icon: Briefcase,
    match: (location) => location === "/applications" || location.startsWith("/jobs/") && location.includes("/applications"),
    breadcrumb: ["Workspace", "Applications"],
  },
  {
    path: "/candidates",
    label: "Talent Search",
    description: "Search your talent pool and rediscover candidates",
    icon: Search,
    match: (location) => location.startsWith("/candidates"),
    breadcrumb: ["Workspace", "Talent Search"],
  },
  {
    path: "/my-jobs",
    label: "My Jobs",
    description: "Open roles, sourcing, and job operations",
    icon: Briefcase,
    match: (location) => location === "/my-jobs" || /^\/jobs\/\d+/.test(location),
    breadcrumb: ["Workspace", "My Jobs"],
  },
  {
    path: "/clients",
    label: "Clients",
    description: "Manage client relationships and shared hiring workflows",
    icon: Users,
    match: (location) => location.startsWith("/clients"),
    breadcrumb: ["Workspace", "Clients"],
  },
  {
    path: "/admin/forms",
    label: "Forms",
    description: "Application forms and intake flows",
    icon: FileText,
    match: (location) => location.startsWith("/admin/forms"),
    breadcrumb: ["Workspace", "Forms"],
  },
  {
    path: "/admin/email-templates",
    label: "Email",
    description: "Templates and outreach assets",
    icon: Sparkles,
    match: (location) => location.startsWith("/admin/email-templates"),
    breadcrumb: ["Workspace", "Email"],
  },
  {
    path: "/profile/settings",
    label: "Profile Settings",
    description: "Personal recruiter profile and preferences",
    icon: Settings,
    match: (location) => location.startsWith("/profile/settings"),
    breadcrumb: ["Account", "Profile Settings"],
  },
  {
    path: "/org/settings",
    label: "Org Settings",
    description: "Organization setup and permissions",
    icon: Settings,
    match: (location) => location.startsWith("/org/settings"),
    breadcrumb: ["Organization", "Settings"],
  },
  {
    path: "/org/team",
    label: "Team Members",
    description: "Seats, roles, and collaborator access",
    icon: Users,
    match: (location) => location.startsWith("/org/team"),
    breadcrumb: ["Organization", "Team Members"],
  },
  {
    path: "/org/billing",
    label: "Billing",
    description: "Subscription and payment settings",
    icon: CreditCard,
    match: (location) => location.startsWith("/org/billing"),
    breadcrumb: ["Organization", "Billing"],
  },
  {
    path: "/org/analytics",
    label: "Organization Analytics",
    description: "Org-level performance analytics",
    icon: Shield,
    match: (location) => location.startsWith("/org/analytics"),
    breadcrumb: ["Organization", "Analytics"],
  },
  {
    path: "/admin",
    label: "Admin Dashboard",
    description: "Platform-level controls and oversight",
    icon: Shield,
    match: (location) => location === "/admin",
    breadcrumb: ["Admin", "Dashboard"],
  },
  {
    path: "/pricing",
    label: "Pricing",
    description: "Plans, entitlements, and upgrade options",
    icon: CreditCard,
    match: (location) => location === "/pricing",
    breadcrumb: ["Workspace", "Pricing"],
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
      <header className="sticky top-0 z-20 border-b border-[#E6E9F2] bg-[rgba(248,249,252,0.82)] backdrop-blur-xl">
        <div className="relative">
          <div className="absolute inset-x-0 top-0 h-full bg-[radial-gradient(circle_at_top_left,_rgba(196,192,255,0.26),_transparent_35%),radial-gradient(circle_at_top_right,_rgba(196,236,255,0.18),_transparent_32%)]" />
          <div className="relative flex h-[76px] items-center justify-between gap-4 px-4 md:px-6">
            <div className="flex min-w-0 items-center gap-3 md:gap-4">
              <SidebarTrigger className="hidden h-10 w-10 rounded-2xl border border-[#E6E9F2] bg-white text-[#5F6B85] shadow-[0_8px_24px_rgba(15,23,42,0.04)] hover:bg-[#F5F7FB] md:flex" />
              <div className="min-w-0">
                <Breadcrumb className="hidden md:block">
                  <BreadcrumbList className="text-[12px] font-medium text-[#8891A5]">
                    {(currentRoute.breadcrumb ?? ["Workspace", currentRoute.label]).map((crumb, index, arr) => (
                      <React.Fragment key={`${crumb}-${index}`}>
                        <BreadcrumbItem>
                          {index === arr.length - 1 ? (
                            <BreadcrumbPage className="font-semibold text-[#1D2433]">{crumb}</BreadcrumbPage>
                          ) : (
                            <BreadcrumbLink asChild>
                              <button type="button" onClick={() => navigate("/recruiter-dashboard")}>
                                {crumb}
                              </button>
                            </BreadcrumbLink>
                          )}
                        </BreadcrumbItem>
                        {index < arr.length - 1 ? (
                          <BreadcrumbSeparator>
                            <ChevronRight className="h-3.5 w-3.5" />
                          </BreadcrumbSeparator>
                        ) : null}
                      </React.Fragment>
                    ))}
                  </BreadcrumbList>
                </Breadcrumb>
                <div className="truncate text-[20px] font-extrabold tracking-[-0.03em] text-[#111827]">
                  {currentRoute.label}
                </div>
                <div className="hidden truncate text-[13px] text-[#6C7486] md:block">
                  {currentRoute.description}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 md:gap-3">
              <button
                type="button"
                onClick={() => setCommandOpen(true)}
                className="hidden min-w-[260px] items-center gap-3 rounded-[18px] border border-[#E6E9F2] bg-white/92 px-4 py-3 text-left shadow-[0_10px_24px_rgba(15,23,42,0.05)] transition-colors hover:bg-[#FCFCFE] lg:flex"
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

              <button
                type="button"
                className="relative flex h-10 w-10 items-center justify-center rounded-2xl border border-[#E6E9F2] bg-white text-[#5F6B85] shadow-[0_8px_24px_rgba(15,23,42,0.04)] hover:bg-[#F5F7FB]"
                aria-label="Notifications"
              >
                <Bell className="h-4 w-4" />
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[#5B4FF7]" />
              </button>

              {primaryAction ? (
                <Button
                  onClick={() => navigate(primaryAction.path)}
                  className="hidden rounded-[18px] bg-[linear-gradient(135deg,#4D41DF_0%,#675DF9_100%)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_16px_30px_rgba(77,65,223,0.26)] hover:opacity-95 xl:inline-flex"
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
