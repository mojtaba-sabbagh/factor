"use client";

import { useFormState, useFormStatus } from "react-dom";
import { inviteUserAction } from "../../server/actions/admin";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "در حال افزودن..." : "افزودن کاربر"}
    </button>
  );
}

export default function InviteUserForm({ companyId }: { companyId: string }) {
  const [state, formAction] = useFormState(inviteUserAction, undefined);

  return (
    <div>
      {state?.error ? (
        <div className="alert alert-error" role="alert" style={{ marginBottom: 14 }}>
          {state.error}
        </div>
      ) : state?.ok ? (
        <div className="alert" style={{ marginBottom: 14, background: "#ecfdf5", color: "#059669" }}>
          کاربر با موفقیت اضافه شد.
        </div>
      ) : null}
      <form action={formAction} className="form-grid">
        <input type="hidden" name="companyId" value={companyId} />
        <div className="field">
          <label>ایمیل</label>
          <input name="email" type="email" required />
        </div>
        <div className="field">
          <label>رمز عبور</label>
          <input name="password" type="password" required minLength={8} />
        </div>
        <div className="field">
          <label>نقش</label>
          <select name="role" defaultValue="user">
            <option value="user">کاربر شرکت</option>
            <option value="superadmin">مدیر سامانه</option>
          </select>
        </div>
        <div className="field" style={{ alignSelf: "end" }}>
          <SubmitButton />
        </div>
      </form>
    </div>
  );
}
