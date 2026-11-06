import { format } from "date-fns";
import { es } from "date-fns/locale";
import { requireUser } from "@/lib/auth";
import {
  attendedShows,
  getLinkedSetlistUser,
  setlistFmConfigured,
  type ConcertShow,
} from "@/lib/setlistfm";
import { SetlistConnect } from "@/components/concerts/setlist-connect";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";

function formatShowDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return format(new Date(year, month - 1, day), "d MMM yyyy", { locale: es });
}

function ShowCard({ show }: { show: ConcertShow }) {
  const place = [show.cityName, show.countryName].filter(Boolean).join(", ");
  const inChile = show.countryCode === "CL";

  return (
    <Card className="overflow-hidden">
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold text-white">{show.artistName}</h2>
          {inChile && (
            <span className="rounded-full bg-spotify-green/15 px-2 py-0.5 text-[11px] font-semibold text-spotify-green">
              En Chile
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-spotify-light-gray">
          {formatShowDate(show.eventDate)}
          {place ? ` · ${place}` : ""}
        </p>
        <p className="text-sm text-white/80">{show.venueName}</p>
        {show.tour && <p className="mt-1 text-xs text-spotify-light-gray">{show.tour}</p>}
        {show.songs.length > 0 && (
          <p className="mt-3 text-sm leading-relaxed text-spotify-light-gray">
            {show.songs.join(" · ")}
          </p>
        )}
        <a
          href={show.url}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-block text-sm font-medium text-spotify-green hover:underline"
        >
          Ver setlist
        </a>
      </div>
    </Card>
  );
}

export default async function ConcertsPage() {
  const auth = await requireUser();
  if ("response" in auth) return null;

  const linked = await getLinkedSetlistUser(auth.ctx);
  const configured = setlistFmConfigured();
  const attended = linked.username && configured ? await attendedShows(linked.username) : null;
  const profileUrl = linked.username
    ? `https://www.setlist.fm/user/${encodeURIComponent(linked.username)}`
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Conciertos"
        description="Cada cuenta conecta su usuario de setlist.fm. Acá aparecen los shows que marcaste como asistidos."
      />

      <Card className="p-5">
        {!linked.columnReady ? (
          <p className="text-sm leading-relaxed text-spotify-light-gray">
            Falta preparar la base. Hay que correr <span className="text-white">supabase/setlistfm_user.sql</span> en Supabase.
          </p>
        ) : (
          <SetlistConnect username={linked.username} />
        )}
        {profileUrl && (
          <a
            href={profileUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block text-sm text-spotify-green hover:underline"
          >
            Ver perfil en setlist.fm
          </a>
        )}
      </Card>

      {!configured && linked.columnReady && (
        <Card className="p-5 text-sm leading-relaxed text-spotify-light-gray">
          El servidor todavía no tiene la key de la app. Va en{" "}
          <span className="text-white">SETLISTFM_API_KEY</span>, una sola para todos.
        </Card>
      )}

      {attended?.kind === "private" && (
        <Card className="p-5 text-sm leading-relaxed text-spotify-light-gray">
          Tu lista de asistencias está privada. En setlist.fm, privacidad, “Attendances and concert statistics” tiene que estar visible para todos.
        </Card>
      )}

      {attended?.kind === "empty" && (
        <Card className="p-5 text-sm text-spotify-light-gray">
          No hay shows públicos con ese usuario. Revisá el nombre, o marcá conciertos en setlist.fm.
        </Card>
      )}

      {attended?.kind === "unavailable" && (
        <Card className="p-5 text-sm text-spotify-light-gray">
          setlist.fm no respondió. Probá de nuevo en un rato.
        </Card>
      )}

      {attended?.kind === "ok" && (
        <div className="space-y-3">
          {attended.shows.map((show) => (
            <ShowCard key={show.id} show={show} />
          ))}
          {attended.total > attended.shows.length && profileUrl && (
            <p className="text-sm text-spotify-light-gray">
              Hay {attended.total} shows. Estos son los más recientes.
            </p>
          )}
        </div>
      )}

      <p className="text-xs text-spotify-light-gray">
        Setlists de{" "}
        <a href="https://www.setlist.fm" target="_blank" rel="noreferrer" className="underline">
          setlist.fm
        </a>
      </p>
    </div>
  );
}
