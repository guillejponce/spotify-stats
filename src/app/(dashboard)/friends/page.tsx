import { FriendsHub } from "@/components/friends/friends-hub";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";

export default function FriendsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Amigos"
        description="Tus amigos ven tus totales, tus tops y lo que estás escuchando. Tus ratings siguen siendo privados."
      />
      <FriendsHub />
    </div>
  );
}
