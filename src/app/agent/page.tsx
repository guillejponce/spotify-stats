import { AgentChat } from "@/components/agent/agent-chat";
import { AgentPlayer } from "@/components/agent/agent-player";

export default function AgentPage() {
  return (
    <div className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-2 lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-1 lg:gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="flex min-h-0 min-w-0 flex-col">
        <AgentChat variant="page" />
      </div>
      <div className="relative z-10 min-h-0 overflow-visible lg:h-full lg:overflow-hidden">
        <AgentPlayer />
      </div>
    </div>
  );
}
