import { format } from "date-fns";
import { es } from "date-fns/locale";
import { requireUser } from "@/lib/auth";
import { recentShowsForUser, setlistFmConfigured, type ConcertShow } from "@/lib/setlistfm";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
      <div className="flex gap-4 p-4 sm:p-5">
        {show.artistImage ? (
          <img
            src={show.artistImage}
            alt=""
            className="h-14 w-14 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <div className="h-14 w-14 shrink-0 rounded-lg bg-white/5" />
        )}
        <div className="min-w-0 flex-1">
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
      </div>
    </Card>
  );
}

export default async function ConcertsPage() {
  const auth = await requireUser();
  if ("response" in auth) return null;

  const configured = setlistFmConfigured();
  const { shows, limited } = configured
    ? await recentShowsForUser(auth.ctx)
    : { shows: [], limited: false };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Conciertos"
        description="El último setlist de los artistas que más escuchaste en los últimos 6 meses. Son shows que ya se tocaron."
      />

      {!configured && (
        <Card className="p-5 text-sm leading-relaxed text-spotify-light-gray">
          Falta la API key de setlist.fm. Entrá a tu cuenta, pedila en API settings y guardala como{" "}
          <span className="text-white">SETLISTFM_API_KEY</span>.
        </Card>
      )}

      {configured && shows.length === 0 && (
        <Card className="p-5 text-sm text-spotify-light-gray">
          No hay setlists de tus artistas en los últimos años.
        </Card>
      )}

      <div className="space-y-3">
        {shows.map((show) => (
          <ShowCard key={show.id} show={show} />
        ))}
      </div>

      {limited && (
        <p className="text-sm text-spotify-light-gray">
          setlist.fm limitó las consultas. El resto aparece cuando vuelvas a entrar.
        </p>
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
