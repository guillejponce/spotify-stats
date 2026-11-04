import { redirect } from "next/navigation";
import { getProfile, getSessionUserId } from "@/lib/auth";
import { AdminUsers } from "@/components/admin/admin-users";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const userId = await getSessionUserId();
  const profile = userId ? await getProfile(userId) : null;
  if (profile?.role !== "admin" || profile.status !== "active") redirect("/");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Usuarios</h1>
        <p className="text-sm text-spotify-light-gray">
          Invita por email de Spotify, aprueba cuentas pendientes o bloquea el acceso.
        </p>
      </div>
      <AdminUsers />
    </div>
  );
}
