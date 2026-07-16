import {
  Home,
  MessageCircle,
  Search,
  User,
  Users,
  UsersRound,
} from "lucide-react";

export const NAV_ITEMS = [
  {
    href: "/",
    label: "Головна",
    icon: Home,
    match: (path: string) => path === "/",
  },
  {
    href: "/friends",
    label: "Друзі",
    icon: Users,
    match: (path: string) => path.startsWith("/friends"),
  },
  {
    href: "/messages",
    label: "Повідомлення",
    icon: MessageCircle,
    match: (path: string) => path.startsWith("/messages"),
  },
  {
    href: "/communities",
    label: "Спільноти",
    icon: UsersRound,
    match: (path: string) => path.startsWith("/communities"),
  },
  {
    href: "/search",
    label: "Пошук",
    icon: Search,
    match: (path: string) => path.startsWith("/search"),
  },
  {
    href: "/profile",
    label: "Профіль",
    icon: User,
    match: (path: string) => path.startsWith("/profile"),
  },
] as const;
