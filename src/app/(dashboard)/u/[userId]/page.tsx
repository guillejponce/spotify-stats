import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth";
import { ProfileView } from "@/components/friends/profile-view";

export const dynamic = "force-dynamic";

export default async function UserProfilePage({ params }: { params: { userId: string } }) {
  if ((await getSessionUserId()) === params.userId) redirect("/profile");
  return <ProfileView userId={params.userId} />;
}
