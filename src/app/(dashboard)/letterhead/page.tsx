import LetterheadEditor from "../../../components/invoice/LetterheadEditor";
import { fetchOwnCompany } from "../../../server/actions/companies";

export default async function LetterheadPage() {
  const company = await fetchOwnCompany();
  if (!company) return null;
  return <LetterheadEditor company={company} />;
}
