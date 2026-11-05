import { cn } from "@/lib/utils";

export function UserAvatar({
  url,
  name,
  className,
}: {
  url: string | null;
  name: string | null;
  className?: string;
}) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt="" className={cn("h-10 w-10 shrink-0 rounded-full object-cover", className)} />
    );
  }
  return (
    <div
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-white",
        className
      )}
    >
      {(name ?? "?").trim().charAt(0).toUpperCase() || "?"}
    </div>
  );
}
