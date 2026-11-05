import { ChevronDown, ExternalLink } from "lucide-react";

const STEPS: { title: string; body: React.ReactNode }[] = [
  {
    title: "Pide tus datos a Spotify",
    body: (
      <>
        Entra a{" "}
        <a
          href="https://www.spotify.com/account/privacy/"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-0.5 text-spotify-green hover:underline"
        >
          spotify.com/account/privacy <ExternalLink className="h-3 w-3" />
        </a>{" "}
        con tu cuenta. En <strong className="text-white">Descargar tus datos</strong>, marca solo{" "}
        <strong className="text-white">Historial de streaming extendido</strong> y aprieta{" "}
        <strong className="text-white">Solicitar datos</strong>.
      </>
    ),
  },
  {
    title: "Confirma el correo de Spotify",
    body: (
      <>
        Spotify te manda un correo para confirmar la solicitud. Si no lo confirmas, no empieza a preparar el
        archivo. Revisa también spam.
      </>
    ),
  },
  {
    title: "Espera el aviso",
    body: (
      <>
        Spotify dice que puede tardar hasta 30 días, pero normalmente llega en unos pocos. Te avisa por correo
        cuando está listo.
      </>
    ),
  },
  {
    title: "Descarga el zip",
    body: (
      <>
        Desde el link del correo baja un archivo llamado algo como{" "}
        <code className="rounded bg-white/10 px-1 text-white">my_spotify_data.zip</code>. El link vence a las
        dos semanas, así que no lo dejes para después.
      </>
    ),
  },
  {
    title: "Súbelo acá abajo, sin descomprimir",
    body: (
      <>
        Arrastra el zip tal cual. Es más cómodo desde el computador, pero en el celular también funciona
        eligiéndolo desde Archivos. Puede tardar varios minutos si tienes muchos años de historial.
      </>
    ),
  },
];

const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: "Me dice que el zip no tiene archivos Streaming_History_Audio",
    a: (
      <>
        Pediste otro paquete. &quot;Datos de la cuenta&quot; solo trae el último año y en otro formato. Tienes
        que pedir <strong className="text-white">Historial de streaming extendido</strong>, que trae todo
        desde que creaste la cuenta.
      </>
    ),
  },
  {
    q: "Uso Last.fm, ¿se duplican las canciones?",
    a: (
      <>
        No. Las canciones que ya llegaron por Last.fm se reconocen y no se cuentan dos veces. Puedes subir el zip
        antes o después de conectar Last.fm.
      </>
    ),
  },
  {
    q: "Se cortó a la mitad",
    a: (
      <>
        Vuelve a elegir el mismo archivo y sigue desde donde quedó. No se duplica nada, aunque lo subas varias
        veces.
      </>
    ),
  },
  {
    q: "¿Qué se importa?",
    a: (
      <>
        Solo las canciones. Los podcasts y videos se ignoran. El archivo se descomprime en tu navegador y no
        se suben datos privados como tu IP.
      </>
    ),
  },
  {
    q: "¿Tengo que hacerlo de nuevo más adelante?",
    a: (
      <>
        Si entras con Spotify, lo nuevo se sincroniza solo y basta con subirlo una vez. Si quieres completar
        algún hueco, puedes pedir un zip nuevo y subirlo: lo repetido se descarta.
      </>
    ),
  },
];

export function ImportGuide({ defaultOpen }: { defaultOpen: boolean }) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-xl border border-white/5 bg-spotify-dark-gray p-5 [&_summary::-webkit-details-marker]:hidden"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-white">Cómo cargar tu historial completo</p>
          <p className="text-xs text-spotify-light-gray">
            Spotify solo entrega tus últimas 50 canciones por la API. Para ver tus estadísticas desde el
            principio, tienes que subir tu historial.
          </p>
        </div>
        <ChevronDown className="h-5 w-5 shrink-0 text-spotify-light-gray transition-transform group-open:rotate-180" />
      </summary>

      <ol className="mt-5 space-y-4">
        {STEPS.map((step, i) => (
          <li key={step.title} className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-spotify-green text-xs font-bold text-black">
              {i + 1}
            </span>
            <div>
              <p className="text-sm font-medium text-white">{step.title}</p>
              <p className="mt-0.5 text-sm leading-relaxed text-spotify-light-gray">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-6 space-y-3 border-t border-white/5 pt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-spotify-light-gray">
          Preguntas frecuentes
        </p>
        {FAQ.map((item) => (
          <div key={item.q}>
            <p className="text-sm font-medium text-white">{item.q}</p>
            <p className="mt-0.5 text-sm leading-relaxed text-spotify-light-gray">{item.a}</p>
          </div>
        ))}
      </div>
    </details>
  );
}
