import { notFound } from "next/navigation";
import { db } from "../../../../../lib/db";
import { requireSuperadmin } from "../../../../../lib/guards";
import InviteUserForm from "../../../../../components/admin/InviteUserForm";

export default async function AdminCompanyPage({ params }: { params: { id: string } }) {
  await requireSuperadmin();

  const company = await db.company.findUnique({
    where: { id: params.id },
    include: { profiles: { select: { userId: true, email: true, role: true } } },
  });
  if (!company) notFound();

  return (
    <div>
      <h1 className="page-title">{company.name}</h1>
      <p className="page-subtitle">وضعیت: {company.active ? "فعال" : "غیرفعال"}</p>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 15, margin: "0 0 12px" }}>کاربران این شرکت</h2>
        <table className="table">
          <thead>
            <tr>
              <th>ایمیل</th>
              <th>نقش</th>
            </tr>
          </thead>
          <tbody>
            {company.profiles.map((p) => (
              <tr key={p.userId}>
                <td>{p.email}</td>
                <td>{p.role === "superadmin" ? "مدیر سامانه" : "کاربر شرکت"}</td>
              </tr>
            ))}
            {company.profiles.length === 0 && (
              <tr>
                <td colSpan={2} style={{ textAlign: "center", color: "#999", padding: 16 }}>
                  هنوز کاربری برای این شرکت ثبت نشده است.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card card-pad">
        <h2 style={{ fontSize: 15, margin: "0 0 12px" }}>افزودن کاربر جدید</h2>
        <InviteUserForm companyId={company.id} />
      </div>
    </div>
  );
}
