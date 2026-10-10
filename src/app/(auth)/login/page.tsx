"use client";

import { useState } from "react";
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
  const [showPassword, setShowPassword] = useState(false);

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
          {/* Both credentials are Latin text, so they are laid out
              left-to-right inside the RTL page: the address and the password
              read in the order they are typed instead of being reordered. */}
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="username"
            dir="ltr"
            spellCheck={false}
            autoCapitalize="none"
          />
        </div>
        <div className="field">
          <label htmlFor="password">رمز عبور</label>
          <div className="input-inline">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              dir="ltr"
              spellCheck={false}
              autoCapitalize="none"
            />
            {/* type="button" is required here: the default is "submit", which
                would try to sign in when the visitor only wanted to peek. */}
            <button
              type="button"
              className="input-toggle"
              onClick={() => setShowPassword((shown) => !shown)}
              aria-pressed={showPassword}
              aria-label={showPassword ? "پنهان کردن رمز عبور" : "نمایش رمز عبور"}
              title={showPassword ? "پنهان کردن رمز عبور" : "نمایش رمز عبور"}
            >
              {showPassword ? "پنهان" : "نمایش"}
            </button>
          </div>
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
