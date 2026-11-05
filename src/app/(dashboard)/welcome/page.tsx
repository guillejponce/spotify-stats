import { Suspense } from "react";
import { WelcomeChecklist } from "@/components/onboarding/welcome-checklist";

export const dynamic = "force-dynamic";

export default function WelcomePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Configura tu cuenta</h1>
        <p className="mt-1 text-sm text-spotify-light-gray">
          Statsify arma tus estadísticas con lo que escuchas en Spotify. Para eso necesita dos cosas: lo que
          escuchaste hasta hoy y una forma de enterarse de lo que escuches desde ahora.
        </p>
      </div>
      <Suspense>
        <WelcomeChecklist />
      </Suspense>
    </div>
  );
}
