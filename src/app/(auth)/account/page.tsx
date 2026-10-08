"use client";

import { Suspense } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useSearchParams } from "next/navigation";
import {
  changePasswordAction,
  requestRecoveryAction,
  resetPasswordWithTokenAction,
} from "../../../server/actions/auth";

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}

function RecoveryRequestForm() {
  const [state, formAction] = useFormState(requestRecoveryAction, undefined);
  return (
    <div className="card card-pad auth-card">
      <h1 className="page-title">بازیابی رمز عبور</h1>
      <p className="page-subtitle">ایمیل خود را وارد کنید تا پیوند بازیابی رمز عبور برای شما ارسال شود.</p>
      {state?.error !== undefined && state.error ? (
        <div className="alert alert-error" role="alert">{state.error}</div>
      ) : state?.error === "" ? (
        <div className="alert" style={{ background: "#ecfdf5", color: "#047857" }}>
          در صورتی که این ایمیل ثبت شده باشد، پیوند بازیابی برای آن ارسال شد.
        </div>
      ) : null}
      <form action={formAction}>
        <div className="field">
          <label htmlFor="email">ایمیل</label>
          <input id="email" name="email" type="email" required />
        </div>
        <SubmitButton label="ارسال پیوند بازیابی" pendingLabel="در حال ارسال..." />
      </form>
    </div>
  );
}

function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction] = useFormState(resetPasswordWithTokenAction, undefined);
  return (
    <div className="card card-pad auth-card">
      <h1 className="page-title">تعیین رمز عبور جدید</h1>
      {state?.error ? <div className="alert alert-error" role="alert">{state.error}</div> : null}
      <form action={formAction}>
        <input type="hidden" name="token" value={token} />
        <div className="field">
          <label htmlFor="password">رمز عبور جدید</label>
          <input id="password" name="password" type="password" required minLength={8} />
        </div>
        <SubmitButton label="ثبت رمز عبور" pendingLabel="در حال ثبت..." />
      </form>
    </div>
  );
}

function ChangePasswordForm() {
  const [state, formAction] = useFormState(changePasswordAction, undefined);
  return (
    <div className="card card-pad auth-card">
      <h1 className="page-title">حساب کاربری</h1>
      <p className="page-subtitle">رمز عبور خود را تغییر دهید.</p>
      {state?.error ? <div className="alert alert-error" role="alert">{state.error}</div> : null}
      <form action={formAction}>
        <div className="field">
          <label htmlFor="password">رمز عبور جدید</label>
          <input id="password" name="password" type="password" required minLength={8} />
        </div>
        <SubmitButton label="ثبت رمز عبور" pendingLabel="در حال ثبت..." />
      </form>
    </div>
  );
}

// One page covers three cases, matching the old Supabase recovery-link flow:
//  - ?recovery_token=... (arrived via the emailed link, no session needed) → set a new password
//  - ?mode=recover (the "forgot password?" link from /login) → request a recovery link
//  - otherwise (reached from the sidebar while signed in) → change password
// middleware.ts allows this path through without a session so the first two cases work
// for signed-out visitors.
function AccountPageContent() {
  const params = useSearchParams();
  const token = params.get("recovery_token");
  if (token) return <ResetPasswordForm token={token} />;
  if (params.get("mode") === "recover") return <RecoveryRequestForm />;
  return <ChangePasswordForm />;
}

// useSearchParams() forces the page to bail out of static prerendering, which
// Next.js only allows inside a Suspense boundary — without one `next build`
// fails with "useSearchParams() should be wrapped in a suspense boundary at
// page /account".
export default function AccountPage() {
  return (
    <Suspense fallback={null}>
      <AccountPageContent />
    </Suspense>
  );
}
