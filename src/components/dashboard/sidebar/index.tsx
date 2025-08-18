"use client";

import * as React from "react";
import {
  IconCamera,
  IconChartBar,
  IconDashboard,
  IconDatabase,
  IconFileAi,
  IconFileDescription,
  IconFileWord,
  IconFolder,
  IconHelp,
  IconInnerShadowTop,
  IconListDetails,
  IconReport,
  IconSearch,
  IconSettings,
  IconUsers,
} from "@tabler/icons-react";

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";
import Nav from "./nav";
import { Sidebar as SidebarType } from "@/types/blocks/sidebar";
import { Link } from "@/i18n/navigation";
import Image from "next/image";
import SidebarUser from "./user";
import Footer from "./footer";
import { Library } from "./library";
import { BottomNav } from "./bottom_nav";

export default function DashboardSidebar({
  sidebar,
  ...props
}: React.ComponentProps<typeof Sidebar> & { sidebar: SidebarType }) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:!p-1.5"
            >
              <Link
                href={sidebar.brand?.url as any}
                className="flex items-center gap-2"
              >
                {sidebar.brand?.logo && (
                  <Image
                    src={sidebar.brand?.logo?.src as any}
                    alt={sidebar.brand?.title as string}
                    width={28}
                    height={28}
                    className="rounded-full"
                  />
                )}
                <span className="text-base font-semibold">
                  {sidebar.brand?.title}
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {sidebar.nav && <Nav nav={sidebar.nav} />}
        {sidebar.library && <Library library={sidebar.library} />}
        {sidebar.bottomNav && (
          <BottomNav nav={sidebar.bottomNav} className="mt-auto" />
        )}
      </SidebarContent>
      <SidebarFooter>
        <SidebarUser account={sidebar.account} />
        {sidebar?.social && <Footer social={sidebar.social} />}
      </SidebarFooter>
    </Sidebar>
  );
}
