import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { ChartsView } from "@/components/charts/charts-view";

function ChartsFallback() {
  return (
    <div className="flex items-center gap-2 text-sm text-spotify-light-gray">
      <Loader2 className="h-4 w-4 animate-spin text-spotify-green" />
      Abriendo el cancionero…
    </div>
  );
}

export default function ChartsPage() {
  return (
    <Suspense fallback={<ChartsFallback />}>
      <ChartsView />
    </Suspense>
  );
}
