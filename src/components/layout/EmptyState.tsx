export default function EmptyState({
  children,
  role,
}: {
  children: React.ReactNode;
  role?: "alert";
}) {
  return (
    <div className="empty-state" role={role}>
      {children}
    </div>
  );
}
