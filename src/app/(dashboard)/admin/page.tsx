import { redirect } from "next/navigation";
import { getProfile, getSessionUserId } from "@/lib/auth";
import { AdminUsers } from "@/components/admin/admin-users";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const userId = await getSessionUserId();
  const profile = userId ? await getProfile(userId) : null;
  if (profile?.role !== "admin" || profile.status !== "active") redirect("/");

  return (
    <div className="space-y-8">
      <PageHeader
        title="Usuarios"
        description="Invita por email de Spotify, aprueba cuentas pendientes o bloquea el acceso."
      />
      <AdminUsers />
    </div>
  );
}
