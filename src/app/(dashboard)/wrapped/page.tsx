import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { WrappedView } from "@/components/wrapped/wrapped-view";

function WrappedFallback() {
  return (
    <div className="flex items-center gap-2 text-sm text-spotify-light-gray">
      <Loader2 className="h-4 w-4 animate-spin text-spotify-green" />
      Armando tu Wrapped del año…
    </div>
  );
}

export default function WrappedPage() {
  return (
    <Suspense fallback={<WrappedFallback />}>
      <WrappedView />
    </Suspense>
  );
}
