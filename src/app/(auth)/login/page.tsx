"use client";

import { useFormState, useFormStatus } from "react-dom";
import { loginAction } from "../../../server/actions/auth";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending} style={{ width: "100%" }}>
      {pending ? "در حال ورود..." : "ورود"}
    </button>
  );
}

export default function LoginPage() {
  const [state, formAction] = useFormState(loginAction, undefined);

  return (
    <div className="card card-pad auth-card">
      <h1 className="page-title">ورود به فکتور</h1>
      <p className="page-subtitle">برای دسترسی به حساب شرکت خود وارد شوید.</p>
      {state?.error ? (
        <div className="alert alert-error" style={{ marginBottom: 14 }} role="alert">
          {state.error}
        </div>
      ) : null}
      <form action={formAction}>
        <div className="field">
          <label htmlFor="email">ایمیل</label>
          <input id="email" name="email" type="email" required autoComplete="username" />
        </div>
        <div className="field">
          <label htmlFor="password">رمز عبور</label>
          <input id="password" name="password" type="password" required autoComplete="current-password" />
        </div>
        <SubmitButton />
      </form>
      <div style={{ marginTop: 14, textAlign: "center" }}>
        <a href="/account?mode=recover" style={{ fontSize: 13, color: "var(--primary)" }}>
          رمز عبور خود را فراموش کرده‌اید؟
        </a>
      </div>
    </div>
  );
}
