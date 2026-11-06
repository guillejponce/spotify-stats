import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Building2, CalendarDays, MapPin, Mic2, Music2, Ticket, Users } from "lucide-react";
import { ConcertRankList } from "@/components/concerts/concert-rank-list";
import { StatCard } from "@/components/stats/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ConcertStats } from "@/lib/concert-stats";

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function formatShowDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return format(new Date(year, month - 1, day), "d MMM yyyy", { locale: es });
}

function countText(count: number, singular: string, plural: string): string {
  return `${count.toLocaleString("es-CL")} ${count === 1 ? singular : plural}`;
}

function Bars({
  rows,
}: {
  rows: Array<{ label: string; count: number }>;
}) {
  const max = Math.max(...rows.map((row) => row.count), 1);
  return (
    <div className="flex h-44 items-end gap-2">
      {rows.map((row) => (
        <div key={row.label} className="flex min-w-0 flex-1 flex-col items-center gap-2">
          <span className="text-[11px] tabular-nums text-spotify-light-gray">{row.count}</span>
          <div className="flex h-28 w-full items-end">
            <div
              className="w-full rounded-t-md bg-spotify-green/70"
              style={{ height: `${Math.max(8, (row.count / max) * 100)}%` }}
            />
          </div>
          <span className="text-[11px] text-spotify-light-gray">{row.label}</span>
        </div>
      ))}
    </div>
  );
}

export function ConcertDashboard({ stats, partial }: { stats: ConcertStats; partial: boolean }) {
  const peakYear = stats.years.reduce(
    (best, row) => (row.count > best.count ? row : best),
    stats.years[0] ?? { year: 0, count: 0 },
  );

  return (
    <div className="space-y-5 sm:space-y-8">
      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
        <StatCard
          title="Conciertos"
          value={stats.concerts.toLocaleString("es-CL")}
          subtitle={
            stats.missingSetlists > 0
              ? `${stats.missingSetlists} todavía sin canciones`
              : `${stats.showsWithEncore.toLocaleString("es-CL")} con encore`
          }
          icon={Ticket}
        />
        <StatCard
          title="Artistas"
          value={stats.artistCount.toLocaleString("es-CL")}
          subtitle={stats.topArtist ? `Top: ${stats.topArtist.name}` : undefined}
          icon={Users}
        />
        <StatCard
          title="Canciones en vivo"
          value={stats.songCount.toLocaleString("es-CL")}
          subtitle={
            stats.coverCount > 0
              ? `${stats.coverCount.toLocaleString("es-CL")} covers`
              : "Sin temas de cinta"
          }
          icon={Music2}
        />
        <StatCard
          title="Venues"
          value={stats.venueCount.toLocaleString("es-CL")}
          subtitle={`${stats.cityCount.toLocaleString("es-CL")} ciudades · ${stats.countryCount.toLocaleString("es-CL")} países`}
          icon={Building2}
        />
        <StatCard
          title="Canción más escuchada"
          value={stats.topSong?.name || "—"}
          subtitle={stats.topSong ? `${stats.topSong.detail ?? ""} · ${countText(stats.topSong.count, "show", "shows")}` : "Cuando haya setlists con temas"}
          icon={Mic2}
          wrapValue
        />
        <StatCard
          title="Artista más visto"
          value={stats.topArtist?.name || "—"}
          subtitle={stats.topArtist ? countText(stats.topArtist.count, "show", "shows") : undefined}
          icon={Users}
          wrapValue
        />
        <StatCard
          title="Ciudad"
          value={stats.topCity?.name || "—"}
          subtitle={stats.topCity ? countText(stats.topCity.count, "show", "shows") : undefined}
          icon={MapPin}
          wrapValue
        />
        <StatCard
          title="Año con más shows"
          value={peakYear.count > 0 ? String(peakYear.year) : "—"}
          subtitle={peakYear.count > 0 ? countText(peakYear.count, "show", "shows") : undefined}
          icon={CalendarDays}
        />
      </div>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        <Card className="border-white/[0.06]">
          <CardHeader className="px-4 pt-5 sm:p-6">
            <CardTitle className="text-base sm:text-lg">Por año</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-5 sm:px-6">
            {stats.years.length === 0 ? (
              <p className="text-sm text-spotify-light-gray">Sin fechas.</p>
            ) : (
              <Bars rows={stats.years.map((row) => ({ label: String(row.year), count: row.count }))} />
            )}
          </CardContent>
        </Card>
        <Card className="border-white/[0.06]">
          <CardHeader className="px-4 pt-5 sm:p-6">
            <CardTitle className="text-base sm:text-lg">Día de la semana</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-5 sm:px-6">
            <Bars rows={WEEKDAYS.map((label, index) => ({ label, count: stats.weekdays[index] ?? 0 }))} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(18rem,24rem)] xl:items-start">
        <ConcertRankList title="Canciones que más escuchaste en vivo" items={stats.songs} />
        <Tabs defaultValue="artists" className="min-w-0">
          <div className="-mx-1 overflow-x-auto pb-1">
            <TabsList className="inline-flex w-max flex-nowrap gap-1">
              <TabsTrigger value="artists">Artistas</TabsTrigger>
              <TabsTrigger value="venues">Venues</TabsTrigger>
              <TabsTrigger value="cities">Ciudades</TabsTrigger>
              {stats.tours.length > 0 && <TabsTrigger value="tours">Tours</TabsTrigger>}
              {stats.covers.length > 0 && <TabsTrigger value="covers">Covers</TabsTrigger>}
            </TabsList>
          </div>
          <TabsContent value="artists" className="mt-3">
            <ConcertRankList title="Artistas" items={stats.artists} hideTitle />
          </TabsContent>
          <TabsContent value="venues" className="mt-3">
            <ConcertRankList title="Venues" items={stats.venues} hideTitle />
          </TabsContent>
          <TabsContent value="cities" className="mt-3">
            <ConcertRankList title="Ciudades" items={stats.cities} hideTitle />
          </TabsContent>
          {stats.tours.length > 0 && (
            <TabsContent value="tours" className="mt-3">
              <ConcertRankList title="Tours" items={stats.tours} hideTitle />
            </TabsContent>
          )}
          {stats.covers.length > 0 && (
            <TabsContent value="covers" className="mt-3">
              <ConcertRankList title="Covers" items={stats.covers} hideTitle />
            </TabsContent>
          )}
        </Tabs>
      </div>

      <Card className="border-white/[0.06]">
        <CardHeader className="px-4 pt-5 sm:p-6">
          <CardTitle className="text-base sm:text-lg">Todos los shows</CardTitle>
        </CardHeader>
        <CardContent className="max-h-[32rem] space-y-1 overflow-y-auto px-2 pb-4 sm:px-3">
          {stats.shows.map((show) => {
            const place = [show.cityName, show.countryName].filter(Boolean).join(", ");
            return (
              <a
                key={show.id}
                href={show.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-baseline justify-between gap-3 rounded-xl px-2.5 py-2.5 hover:bg-white/[0.06]"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">
                    {show.artistName}
                    {show.countryCode === "CL" ? " · Chile" : ""}
                  </p>
                  <p className="truncate text-xs text-spotify-light-gray">
                    {formatShowDate(show.eventDate)}
                    {place ? ` · ${place}` : ""}
                    {` · ${show.venueName}`}
                  </p>
                </div>
                <p className="shrink-0 text-xs text-spotify-light-gray">
                  {show.songCount > 0 ? `${show.songCount} temas` : "Sin setlist"}
                  {show.hasEncore ? " · encore" : ""}
                </p>
              </a>
            );
          })}
        </CardContent>
      </Card>

      {partial && (
        <p className="text-sm text-spotify-light-gray">
          setlist.fm cortó la consulta. Estas cifras usan los shows que alcanzaron a llegar.
        </p>
      )}
    </div>
  );
}
