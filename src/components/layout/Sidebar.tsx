"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "../../server/actions/auth";
import type { AuthContext } from "../../lib/guards";

const COMPANY_NAV = [
  { href: "/", label: "فاکتورها و پیش‌فاکتورها", icon: "📄" },
  { href: "/new/invoice", label: "صدور فاکتور جدید", icon: "🧾" },
  { href: "/new/proforma", label: "صدور پیش‌فاکتور جدید", icon: "📝" },
  { href: "/letterhead", label: "سربرگ شرکت (A4 / A5)", icon: "🏷️" },
  { href: "/settings", label: "اطلاعات شرکت", icon: "⚙️" },
];

const ADMIN_NAV = [{ href: "/admin", label: "شرکت‌ها و حساب‌ها", icon: "🏢" }];

export default function Sidebar({ auth }: { auth: AuthContext }) {
  const pathname = usePathname();
  const isSuperadmin = auth.role === "superadmin";
  const navItems = isSuperadmin ? ADMIN_NAV : COMPANY_NAV;
  const brandText = isSuperadmin ? "پنل مدیر سامانه" : auth.companyName || "حساب شرکت";
  const brandLogo = !isSuperadmin && auth.companyLogo && auth.companyLogo !== "default" ? auth.companyLogo : "/assets/logo.svg";

  return (
    <aside className="sidebar no-print">
      <div className="sidebar-brand">
        <img src={brandLogo} alt={isSuperadmin ? "لوگوی سامانه" : `لوگوی ${brandText}`} />
        <div className="sidebar-brand-text">{brandText}</div>
      </div>
      <nav className="nav-list">
        {navItems.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href} className={`nav-item${active ? " active" : ""}`}>
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="sidebar-footer">
        <Link href="/account" className={`nav-item${pathname === "/account" ? " active" : ""}`}>
          <span>👤</span>
          <span>حساب کاربری</span>
        </Link>
        <form action={logoutAction}>
          <button type="submit" className="nav-item nav-item-button">
            <span>🚪</span>
            <span>خروج از حساب</span>
          </button>
        </form>
        <div className="sidebar-user">{auth.email}</div>
      </div>
    </aside>
  );
}
