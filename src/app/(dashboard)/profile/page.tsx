import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth";
import { ProfileView } from "@/components/friends/profile-view";

export const dynamic = "force-dynamic";

export default async function MyProfilePage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");
  return (
    <div className="space-y-4">
      <p className="text-sm text-spotify-light-gray">Así ven tu perfil tus amigos.</p>
      <ProfileView userId={userId} />
    </div>
  );
}
