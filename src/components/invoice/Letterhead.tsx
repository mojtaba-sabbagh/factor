import { getCustomLetterhead, resolveLogo } from "../../utils/companyAssets";
import type { Company } from "../../types/company";

export default function Letterhead({
  company,
  size = "a4",
  date = "",
  number = "",
  showArtwork = true,
}: {
  company: Company;
  size?: string;
  date?: string;
  number?: string;
  showArtwork?: boolean;
}) {
  const custom = getCustomLetterhead(company, size);
  if (custom) {
    // This letterhead image already has "تاریخ:" / "شماره:" printed on it (with a
    // blank line to fill in) — so only the value goes here, positioned over that
    // blank line, not a second labeled block. The exact position depends on where
    // your specific letterhead prints those fields, so lh-ref-value-date/-number
    // below are meant to be nudged per letterhead, not treated as universal.
    return (
      <div className="lh lh-image">
        <img className={`lh-custom${showArtwork ? "" : " lh-ghost"}`} src={custom.src} alt="" />
        <div className="lh-ref-value lh-ref-value-date">{date}</div>
        <div className="lh-ref-value lh-ref-value-number">{number}</div>
      </div>
    );
  }

  const address = company.letterheadAddress || company.address;

  return (
    <div className={`lh${showArtwork ? "" : " lh-ghost"}`}>
      <div className="lh-header">
        <div className="lh-topbar" />
        <div className="lh-stripes lh-stripes-top" />
        <img className="lh-bismillah" src="/assets/bismillah.png" alt="بسمه تعالی" />

        <div className="lh-brand">
          {resolveLogo(company) ? (
            <img className="lh-logo" src={resolveLogo(company)!} alt={company.name} />
          ) : null}
          <div className="lh-ids">
            {company.companyType ? <div className="lh-type">{company.companyType}</div> : null}
            {company.registrationNumber ? <div>شماره ثبت: {company.registrationNumber}</div> : null}
            {company.nationalId ? <div>شناسه ملی: {company.nationalId}</div> : null}
          </div>
        </div>

        <div className="lh-refs lh-refs-corner">
          <div className="lh-ref">
            <span className="lh-ref-label">تاریخ:</span>
            <b className="lh-ref-value">{date}</b>
          </div>
          <div className="lh-ref">
            <span className="lh-ref-label">شماره:</span>
            <b className="lh-ref-value">{number}</b>
          </div>
          <div className="lh-ref">
            <span className="lh-ref-label">پیوست:</span>
            <b className="lh-ref-value" />
          </div>
        </div>

        <div className="lh-rule" />
      </div>

      <div className="lh-footer">
        <div className="lh-rule lh-rule-footer" />
        <div className="lh-contact">
          <div>
            <b>آدرس:</b> {address}
          </div>
          <div className="lh-contact-row">
            {company.postalCode ? (
              <span>
                <b>کدپستی:</b> {company.postalCode}
              </span>
            ) : null}
            {company.phone ? (
              <span>
                <b>تلفن:</b> {company.phone}
              </span>
            ) : null}
            {company.email ? (
              <span>
                <b>ایمیل:</b> <bdi dir="ltr">{company.email}</bdi>
              </span>
            ) : null}
          </div>
        </div>
        <div className="lh-stripes lh-stripes-bottom" />
        <div className="lh-bottombar" />
      </div>
    </div>
  );
}
