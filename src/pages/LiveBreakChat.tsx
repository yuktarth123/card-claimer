import { useParams } from "react-router-dom";
import { useBuyer } from "@/hooks/useBuyer";
import { NameGate } from "@/components/NameGate";
import { LiveChat } from "@/components/LiveChat";
import { toast } from "sonner";

const LiveBreakChat = () => {
  const { breakId } = useParams<{ breakId: string }>();
  const { name, phone, setIdentity } = useBuyer();

  if (!breakId) return null;

  return (
    <div className="h-screen p-2">
      <NameGate
        open={!name || !phone}
        initialName={name}
        onSubmit={(n, p) => {
          setIdentity(n, p);
          toast.success(`Welcome, ${n}! 👋`);
        }}
      />
      <LiveChat breakId={breakId} displayName={name} hidePopoutButton />
    </div>
  );
};

export default LiveBreakChat;
