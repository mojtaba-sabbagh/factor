import { redirect } from "next/navigation";
import Sidebar from "../../components/layout/Sidebar";
import { getAuthContext } from "../../lib/guards";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const auth = await getAuthContext();
  if (!auth) redirect("/login");
  if (auth.role !== "superadmin") redirect("/");

  return (
    <div className="app-shell">
      <Sidebar auth={auth} />
      <main className="main-area">{children}</main>
    </div>
  );
}
