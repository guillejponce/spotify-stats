import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { requireUser } from "@/lib/auth";
import { describeSetlist } from "@/lib/concert-stats";
import { loadSetlist } from "@/lib/setlistfm";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";

function formatShowDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return format(new Date(year, month - 1, day), "d MMM yyyy", { locale: es });
}

export default async function SetlistPage({ params }: { params: { setlistId: string } }) {
  const auth = await requireUser();
  if ("response" in auth) return null;

  const loaded = await loadSetlist(params.setlistId);
  if (loaded === "missing-key" || loaded === "unavailable") {
    return (
      <div className="space-y-6">
        <PageHeader title="Setlist" description="No se pudo cargar este show." />
        <Link href="/concerts" className="text-sm font-medium text-spotify-green hover:underline">
          Volver a conciertos
        </Link>
      </div>
    );
  }
  if (!loaded) notFound();

  const setlist = describeSetlist(loaded);
  if (!setlist) notFound();

  const place = [setlist.venueName, setlist.cityName, setlist.countryName].filter(Boolean).join(", ");
  let number = 0;

  return (
    <div className="space-y-6">
      <Link href="/concerts" className="text-sm font-medium text-spotify-green hover:underline">
        Volver a conciertos
      </Link>
      <PageHeader
        title={setlist.artistName}
        description={`${formatShowDate(setlist.eventDate)}${place ? ` · ${place}` : ""}${setlist.tour ? ` · ${setlist.tour}` : ""}`}
      />

      {setlist.info && (
        <p className="text-sm leading-relaxed text-spotify-light-gray">{setlist.info}</p>
      )}

      {setlist.blocks.length === 0 ? (
        <Card className="p-5 text-sm text-spotify-light-gray">Este show todavía no tiene canciones cargadas.</Card>
      ) : (
        <div className="space-y-4">
          {setlist.blocks.map((block, blockIndex) => (
            <Card key={`${block.title}-${blockIndex}`} className="border-white/[0.06] p-4 sm:p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-spotify-light-gray">{block.title}</h2>
              <ol className="mt-3 space-y-2">
                {block.songs.map((song) => {
                  number += 1;
                  const notes = [
                    song.tape ? "Cinta" : "",
                    song.cover ? `cover de ${song.cover}` : "",
                    song.guest ? `con ${song.guest}` : "",
                    song.info ?? "",
                  ].filter(Boolean);
                  return (
                    <li key={`${block.title}-${number}`} className="flex gap-3 text-sm">
                      <span className="w-6 shrink-0 text-right tabular-nums text-spotify-light-gray/70">{number}</span>
                      <div className="min-w-0">
                        <p className={song.tape ? "text-spotify-light-gray" : "text-white"}>{song.name}</p>
                        {notes.length > 0 && (
                          <p className="text-xs text-spotify-light-gray">{notes.join(" · ")}</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </Card>
          ))}
        </div>
      )}

      <p className="text-xs text-spotify-light-gray">
        Setlist de{" "}
        <a href={setlist.sourceUrl} target="_blank" rel="noreferrer" className="underline">
          setlist.fm
        </a>
      </p>
    </div>
  );
}
