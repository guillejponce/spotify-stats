import { requireUser } from "@/lib/auth";
import { getLinkedSetlistUser, loadAttendedSetlists, setlistFmConfigured } from "@/lib/setlistfm";
import { ConcertsLive } from "@/components/concerts/concerts-live";
import { SetlistConnect } from "@/components/concerts/setlist-connect";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function ConcertsPage() {
  const auth = await requireUser();
  if ("response" in auth) return null;

  const linked = await getLinkedSetlistUser(auth.ctx);
  const configured = setlistFmConfigured();
  const attended = linked.username && configured ? await loadAttendedSetlists(linked.username) : null;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Conciertos"
        description="Stats de los shows que marcaste en setlist.fm. Las canciones salen del setlist: lo de cinta no cuenta como tocado en vivo."
      />

      <Card className="p-5">
        {!linked.columnReady ? (
          <p className="text-sm leading-relaxed text-spotify-light-gray">
            Falta preparar la base. Hay que correr <span className="text-white">supabase/setlistfm_user.sql</span> en Supabase.
          </p>
        ) : (
          <SetlistConnect username={linked.username} />
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
        <ConcertsLive setlists={attended.setlists} partial={attended.partial} />
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
