import CompanySettingsForm from "../../../components/invoice/CompanySettingsForm";
import { fetchOwnCompany } from "../../../server/actions/companies";

export default async function SettingsPage() {
  const company = await fetchOwnCompany();
  if (!company) return null;
  return <CompanySettingsForm initialCompany={company} />;
}
