import * as React from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Organization, Membership } from "@/hooks/use-organization";
import { cn } from "@/lib/utils";
import type { User as SelectUser } from "@shared/schema";
import type { LucideIcon } from "lucide-react";
import {
  ChevronRight,
  BarChart3,
  Briefcase,
  Building2,
  ChevronDown,
  CreditCard,
  FileText,
  Home,
  LogOut,
  Plus,
  Search,
  Settings,
  Shield,
  Sparkles,
  Users,
} from "lucide-react";
import vantahireLogo from "@/assets/vantahire-logo.png";

type NavItem = {
  label: string;
  path?: string;
  icon: LucideIcon;
  visible: boolean;
  active: boolean;
  onClick?: () => void;
  className?: string;
};

interface AtsSidebarProps {
  location: string;
  navigate: (path: string) => void;
  onLogout: () => void;
  user: SelectUser | null;
  organizationData: { organization: Organization; membership: Membership } | null | undefined;
  isRecruiter: boolean;
  isAdmin: boolean;
  isOrgOwner: boolean;
  isOrgOwnerOrAdmin: boolean;
  displayName: string;
}

const matchesPath = (location: string, path: string) =>
  location === path || location.startsWith(`${path}/`);

export default function AtsSidebar({
  location,
  navigate,
  onLogout,
  user,
  organizationData,
  isRecruiter,
  isAdmin,
  isOrgOwner,
  isOrgOwnerOrAdmin,
  displayName,
}: AtsSidebarProps) {
  const { state, isMobile } = useSidebar();
  const isCollapsed = !isMobile && state === "collapsed";
  const [orgManagementOpen, setOrgManagementOpen] = React.useState(false);
  const [collapsedOrgOpen, setCollapsedOrgOpen] = React.useState(false);

  React.useEffect(() => {
    if (isCollapsed) {
      setOrgManagementOpen(false);
    }
  }, [isCollapsed]);

  React.useEffect(() => {
    setOrgManagementOpen(false);
    setCollapsedOrgOpen(false);
  }, [location]);

  const mainItems: NavItem[] = [
    {
      label: "Dashboard",
      path: "/recruiter-dashboard",
      icon: Home,
      visible: isRecruiter || isAdmin,
      active: location === "/recruiter-dashboard",
    },
    {
      label: "Applications",
      path: "/applications",
      icon: Briefcase,
      visible: isRecruiter || isAdmin,
      active: matchesPath(location, "/applications"),
    },
    {
      label: "Talent Search",
      path: "/candidates",
      icon: Search,
      visible: isRecruiter || isAdmin,
      active: matchesPath(location, "/candidates"),
    },
    {
      label: "My Jobs",
      path: "/my-jobs",
      icon: Briefcase,
      visible: isRecruiter || isAdmin,
      active:
        matchesPath(location, "/my-jobs") ||
        /^\/jobs\/\d+\/(applications|edit|pipeline|analytics|sourcing|bulk-import)/.test(location),
    },
    {
      label: "Forms",
      path: "/admin/forms",
      icon: FileText,
      visible: isRecruiter || isAdmin,
      active: matchesPath(location, "/admin/forms"),
    },
    {
      label: "Clients",
      path: "/clients",
      icon: Users,
      visible: isRecruiter || isAdmin,
      active: matchesPath(location, "/clients"),
    },
    {
      label: "Email",
      path: "/admin/email-templates",
      icon: Sparkles,
      visible: isRecruiter || isAdmin,
      active: matchesPath(location, "/admin/email-templates"),
    },
    {
      label: "Pricing",
      path: "/pricing",
      icon: CreditCard,
      visible: isRecruiter || isAdmin,
      active: location === "/pricing",
    },
    {
      label: "Admin Dashboard",
      path: "/admin",
      icon: Shield,
      visible: isAdmin,
      active: location === "/admin",
    },
    {
      label: "Job Analytics",
      path: "/analytics",
      icon: BarChart3,
      visible: isAdmin,
      active: matchesPath(location, "/analytics"),
    },
  ];

  const accountItems: NavItem[] = [
    {
      label: "Profile Settings",
      path: "/profile/settings",
      icon: Settings,
      visible: isRecruiter || isAdmin,
      active: matchesPath(location, "/profile/settings"),
    },
    {
      label: "Org Settings",
      path: "/org/settings",
      icon: Building2,
      visible: !!organizationData && isOrgOwnerOrAdmin,
      active: matchesPath(location, "/org/settings"),
    },
    {
      label: "Team Members",
      path: "/org/team",
      icon: Users,
      visible: !!organizationData && isOrgOwnerOrAdmin,
      active: matchesPath(location, "/org/team"),
    },
    {
      label: "Billing",
      path: "/org/billing",
      icon: CreditCard,
      visible: !!organizationData && isOrgOwner,
      active: matchesPath(location, "/org/billing"),
    },
    {
      label: "Organization Analytics",
      path: "/org/analytics",
      icon: BarChart3,
      visible: !!organizationData && isOrgOwnerOrAdmin,
      active: matchesPath(location, "/org/analytics"),
    },
    {
      label: "Logout",
      icon: LogOut,
      visible: true,
      active: false,
      onClick: onLogout,
      className: "text-destructive hover:text-destructive",
    },
  ];

  const visibleMainItems = mainItems.filter((item) => item.visible);
  const visibleAccountItems = accountItems.filter((item) => item.visible);
  const profileSettingsItem = visibleAccountItems.find((item) => item.label === "Profile Settings");
  const orgManagementItems = visibleAccountItems.filter(
    (item) => item.label !== "Logout" && item.label !== "Profile Settings"
  );
  const initials = `${user?.firstName?.[0] ?? ""}${user?.lastName?.[0] ?? user?.username?.[0] ?? "U"}`.toUpperCase();
  const accountSubtitle = user?.username ?? "";
  const canPostJobs = isRecruiter || isAdmin;

  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-[#E1E5F0] bg-[linear-gradient(180deg,#F9FAFD_0%,#F2F4F8_100%)] shadow-[0_18px_50px_rgba(17,24,39,0.06)]"
    >
      <SidebarHeader className="gap-3 border-b border-[#E8ECF4] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,249,252,0.92)_100%)] px-3 py-4 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:py-3">
        <div className="flex items-start justify-between gap-2 group-data-[collapsible=icon]:w-full group-data-[collapsible=icon]:justify-center">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="flex min-w-0 flex-1 items-start gap-3 rounded-2xl text-left transition-opacity hover:opacity-90 group-data-[collapsible=icon]:hidden"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#FFFFFF_0%,#EBEEFF_100%)] shadow-[0_12px_28px_rgba(77,65,223,0.12)]">
              <img src={vantahireLogo} alt="VantaHire" className="h-8 w-auto shrink-0" />
            </div>
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <div className="flex items-center gap-2">
                <div className="truncate text-[18px] font-semibold leading-none text-[#1E2332]">VantaHire</div>
                <div className="rounded-full bg-[#EEF0FF] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#5B52F5]">ATS</div>
              </div>
              {organizationData?.organization?.name && (
                <div className="mt-1 truncate text-xs font-medium text-[#8D94A7]">
                  {organizationData.organization.name}
                </div>
              )}
            </div>
          </button>
          <SidebarTrigger
            className="mt-1 shrink-0 rounded-xl border border-transparent text-[#8D94A7] transition-colors hover:border-[#E6E9F4] hover:bg-[#FFFFFF] hover:text-[#6C63FF] group-data-[collapsible=icon]:mt-0 group-data-[collapsible=icon]:h-10 group-data-[collapsible=icon]:w-10"
          />
        </div>
        {canPostJobs ? (
          <button
            type="button"
            onClick={() => navigate("/jobs/post")}
            className="group flex h-12 items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#4D41DF_0%,#675DF9_100%)] px-4 text-sm font-semibold text-white shadow-[0_18px_36px_rgba(77,65,223,0.24)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_40px_rgba(77,65,223,0.28)] group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:h-11 group-data-[collapsible=icon]:w-11 group-data-[collapsible=icon]:rounded-2xl group-data-[collapsible=icon]:px-0"
          >
            <Plus className="h-4 w-4 shrink-0" />
            <span className="group-data-[collapsible=icon]:hidden">Post New Job</span>
          </button>
        ) : null}
      </SidebarHeader>

      <SidebarContent
        className={cn(
          "overflow-x-hidden bg-transparent px-0 py-3 group-data-[collapsible=icon]:overflow-hidden group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:py-2",
          orgManagementOpen ? "overflow-y-auto" : "overflow-hidden"
        )}
      >
        <SidebarGroup className="gap-2 p-0">
          <SidebarGroupLabel className="px-6 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#A4A9B8] group-data-[collapsible=icon]:hidden">
            Workspace
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5 group-data-[collapsible=icon]:gap-2">
              {visibleMainItems.map((item) => {
                const Icon = item.icon;

                return (
                  <SidebarMenuItem key={item.label}>
                    <SidebarMenuButton
                      tooltip={item.label}
                      isActive={item.active}
                      onClick={() => item.path && navigate(item.path)}
                      className={cn(
                        "mx-2 h-10 rounded-2xl pl-6 pr-3 text-[13px] font-medium text-[#6E7891] transition-all duration-200 hover:bg-[#FFFFFF] hover:text-[#5B54E8] hover:shadow-[0_8px_24px_rgba(15,23,42,0.05)]",
                        "data-[active=true]:bg-[linear-gradient(135deg,#4D41DF_0%,#675DF9_100%)] data-[active=true]:text-white data-[active=true]:shadow-[0_16px_34px_rgba(77,65,223,0.22)]",
                        "group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:h-11 group-data-[collapsible=icon]:w-11 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:rounded-xl group-data-[collapsible=icon]:px-0",
                        "group-data-[collapsible=icon]:hover:bg-white group-data-[collapsible=icon]:data-[active=true]:bg-[linear-gradient(135deg,#4D41DF_0%,#675DF9_100%)]",
                        "group-data-[collapsible=icon]:hover:text-[#4F46E5] group-data-[collapsible=icon]:data-[active=true]:text-white",
                        "[&>span]:transition-opacity [&>span]:duration-150 group-data-[collapsible=icon]:[&>span]:opacity-0"
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0 group-data-[collapsible=icon]:m-0" />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator className="mx-0 my-3 bg-[#E6EAF3]" />

        {orgManagementItems.length > 0 && (
          isCollapsed ? (
            <SidebarGroup className="p-0">
              <SidebarGroupContent>
                <DropdownMenu open={collapsedOrgOpen} onOpenChange={setCollapsedOrgOpen}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl text-[#6E7891] transition-colors duration-200 hover:text-[#4F46E5]"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent side="right" align="center">
                      Org Management
                    </TooltipContent>
                  </Tooltip>
                  <DropdownMenuContent
                    align="end"
                    side="right"
                    sideOffset={12}
                    className="w-60 rounded-xl border-[#E6E8F0] p-2"
                  >
                    <DropdownMenuLabel className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#A4A9B8]">
                      Org Management
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {orgManagementItems.map((item) => {
                      const Icon = item.icon;

                      return (
                        <DropdownMenuItem
                          key={item.label}
                          onClick={item.onClick ?? (() => item.path && navigate(item.path))}
                          className="cursor-pointer rounded-lg px-2 py-2 text-[13px] font-medium text-[#6E7891] focus:bg-[#F1F2FB] focus:text-[#5B54E8]"
                        >
                          <Icon className="mr-2 h-4 w-4" />
                          <span>{item.label}</span>
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ) : (
            <SidebarGroup className="gap-1 p-0">
              <button
                type="button"
                onClick={() => setOrgManagementOpen((open) => !open)}
                className="mx-2 flex h-10 w-[calc(100%-1rem)] items-center justify-between rounded-2xl pl-6 pr-3 text-left transition-colors duration-200 hover:bg-white hover:shadow-[0_8px_24px_rgba(15,23,42,0.05)]"
              >
                <span className="text-[13px] font-medium text-[#6E7891]">Org Management</span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-[#A4A9B8] transition-transform duration-200",
                    orgManagementOpen && "rotate-180 text-[#6C63FF]"
                  )}
                />
              </button>

              {orgManagementOpen && (
                <SidebarGroupContent>
                  <SidebarMenu className="gap-1 pb-1">
                    {orgManagementItems.map((item) => {
                      const Icon = item.icon;

                      return (
                        <SidebarMenuItem key={item.label}>
                          <SidebarMenuButton
                            tooltip={item.label}
                            isActive={item.active}
                            onClick={item.onClick ?? (() => item.path && navigate(item.path))}
                            className="mx-2 h-10 rounded-2xl pl-6 pr-3 text-[13px] font-medium text-[#6E7891] transition-all duration-200 hover:bg-white hover:text-[#5B54E8] hover:shadow-[0_8px_24px_rgba(15,23,42,0.05)] data-[active=true]:bg-[#EEF0FF] data-[active=true]:text-[#5B54E8]"
                          >
                            <Icon className="h-4 w-4 shrink-0" />
                            <span>{item.label}</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              )}
            </SidebarGroup>
          )
        )}
      </SidebarContent>

      <SidebarFooter className="mt-auto gap-2 bg-[linear-gradient(180deg,rgba(248,249,252,0)_0%,rgba(255,255,255,0.96)_18%)] px-0 py-3 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-0">
        <div className="w-full">
          <div className="mb-2 h-px w-full bg-[#E6EAF3]" />
          <div className="overflow-hidden transition-all duration-200">
            <button
              type="button"
              onClick={() => profileSettingsItem?.path && navigate(profileSettingsItem.path)}
              className={cn(
                "mx-2 flex h-12 w-[calc(100%-1rem)] items-center gap-3 rounded-2xl border border-transparent bg-white/75 pl-4 pr-2 text-left shadow-[0_10px_24px_rgba(15,23,42,0.04)] transition-colors duration-200 hover:border-[#E6EAF3] hover:bg-white",
                isCollapsed && "mx-auto h-11 w-11 justify-center rounded-2xl px-0 hover:bg-[#F6F7FD]"
              )}
              title={profileSettingsItem?.label ?? "Profile Settings"}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#E5E4FF] text-sm font-semibold text-[#6C63FF]">
                {initials}
              </div>
              <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                <div className="truncate text-sm font-semibold text-[#20263A]">{displayName}</div>
                <div className="truncate text-xs text-[#8D94A7]">{accountSubtitle}</div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-[#A4A9B8] group-data-[collapsible=icon]:hidden" />
            </button>
          </div>
        </div>

        {visibleAccountItems
          .filter((item) => item.label === "Logout")
          .map((item) => {
            const Icon = item.icon;

            return (
              <SidebarMenu key={item.label} className="w-full">
                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip={item.label}
                    isActive={false}
                    onClick={item.onClick}
                  className={cn(
                      "mx-2 h-10 rounded-2xl pl-6 pr-3 text-sm font-medium text-[#E35D5B] transition-all duration-200 hover:bg-[#FFF1F1] hover:text-[#D84C49]",
                      "group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:h-11 group-data-[collapsible=icon]:w-11 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:rounded-2xl group-data-[collapsible=icon]:px-0",
                      "group-data-[collapsible=icon]:hover:bg-transparent",
                      "[&>span]:transition-opacity [&>span]:duration-150 group-data-[collapsible=icon]:[&>span]:opacity-0"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            );
          })}
      </SidebarFooter>

      <SidebarRail className="after:bg-[#CFD6EA]" />
    </Sidebar>
  );
}
