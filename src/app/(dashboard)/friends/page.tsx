import { FriendsHub } from "@/components/friends/friends-hub";

export const dynamic = "force-dynamic";

export default function FriendsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Amigos</h1>
        <p className="text-sm text-spotify-light-gray">
          Tus amigos ven tus totales, tus tops y lo que estás escuchando. Tus ratings siguen siendo privados.
        </p>
      </div>
      <FriendsHub />
    </div>
  );
}
