"use client";

import { useEffect } from "react";

// Next.js renders this for any error that no closer boundary handled, including a
// Server Action that throws. Without it a production build has nowhere to hand the
// error, React unmounts the tree under the root layout and the visitor stares at an
// empty page — which is also why a misconfigured deployment (no DATABASE_URL,
// database not reachable, migrations not applied) looks like "the login button does
// nothing". Showing the digest makes the failure match the entry in the app log.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] unhandled error:", error);
  }, [error]);

  return (
    <div className="card card-pad auth-card">
      <h1 className="page-title">خطای غیرمنتظره</h1>
      <p className="page-subtitle">درخواست شما انجام نشد. لطفاً یک‌بار دیگر تلاش کنید.</p>
      <div className="alert alert-error" role="alert" style={{ marginBottom: 14 }}>
        {error.message || "خطای ناشناخته"}
        {error.digest ? (
          <span style={{ display: "block", fontSize: 12, marginTop: 6 }}>کد خطا: {error.digest}</span>
        ) : null}
      </div>
      <button type="button" className="btn btn-primary" style={{ width: "100%" }} onClick={reset}>
        تلاش مجدد
      </button>
    </div>
  );
}
