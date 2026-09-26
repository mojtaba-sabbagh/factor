import { redirect } from "next/navigation";
import Sidebar from "../../components/layout/Sidebar";
import { getAuthContext } from "../../lib/guards";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const auth = await getAuthContext();
  if (!auth) redirect("/login");
  if (auth.role === "superadmin") redirect("/admin");
  if (!auth.companyId) redirect("/login");

  return (
    <div className="app-shell">
      <Sidebar auth={auth} />
      <main className="main-area">{children}</main>
    </div>
  );
}
