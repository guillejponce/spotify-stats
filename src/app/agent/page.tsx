import { AgentChat } from "@/components/agent/agent-chat";
import { AgentPlayer } from "@/components/agent/agent-player";

export default function AgentPage() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 lg:flex-row">
      <div className="order-2 min-h-0 min-w-0 flex-1 lg:order-1">
        <AgentChat variant="page" />
      </div>
      <div className="order-1 max-h-[42vh] shrink-0 lg:order-2 lg:h-full lg:max-h-none lg:w-[22rem]">
        <AgentPlayer />
      </div>
    </div>
  );
}
