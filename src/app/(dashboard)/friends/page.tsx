import { FriendActivityFeed } from "@/components/friends/friend-activity-feed";
import { FriendsHub } from "@/components/friends/friends-hub";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";

export default function FriendsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Amigos"
        description="Lo que andan escuchando y calificando tus amigos. Tus ratings siguen siendo privados."
      />
      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)]">
        <div className="order-2 min-w-0 xl:order-1">
          <FriendActivityFeed />
        </div>
        <div className="order-1 min-w-0 xl:order-2">
          <FriendsHub />
        </div>
      </div>
    </div>
  );
}
