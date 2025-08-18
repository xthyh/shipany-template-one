"use client";

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Nav as NavType } from "@/types/blocks/base";
import { Link } from "@/i18n/navigation";
import Icon from "@/components/icon";
import { usePathname } from "next/navigation";

export default function Nav({ nav }: { nav: NavType }) {
  const pathname = usePathname();

  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2 mt-4">
        <SidebarMenu>
          {nav?.items?.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                tooltip={item.title}
                className={`${
                  item.is_active || pathname.endsWith(item.url as string)
                    ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground min-w-8 duration-200 ease-linear"
                    : ""
                }`}
              >
                {item.url ? (
                  <Link
                    href={item.url as any}
                    target={item.target}
                    className="w-full flex items-center gap-2 cursor-pointer"
                  >
                    {item.icon && <Icon name={item.icon} />}
                    <span>{item.title}</span>
                  </Link>
                ) : (
                  <>
                    {item.icon && <Icon name={item.icon} />}
                    <span>{item.title}</span>
                  </>
                )}
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
