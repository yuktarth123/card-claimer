import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, MessageCircle } from "lucide-react";
import { toast } from "sonner";

type ChatMessage = Database["public"]["Tables"]["live_chat_messages"]["Row"];

interface Props {
  breakId: string;
  displayName: string;
}

export function LiveChat({ breakId, displayName }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;

    supabase
      .from("live_chat_messages")
      .select("*")
      .eq("break_id", breakId)
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (error) console.error("Error fetching chat:", error);
        if (mounted && data) setMessages([...data].reverse());
      });

    const channel = supabase
      .channel(`live-chat-${breakId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "live_chat_messages", filter: `break_id=eq.${breakId}` },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as ChatMessage]);
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [breakId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || !displayName || sending) return;
    setSending(true);
    const { error } = await supabase
      .from("live_chat_messages")
      .insert({ break_id: breakId, display_name: displayName, message: trimmed });
    setSending(false);
    if (error) {
      toast.error("Message didn't send");
    } else {
      setText("");
    }
  };

  return (
    <div className="flex flex-col h-full rounded-2xl border border-border gradient-card-bg overflow-hidden">
      <div className="px-3 py-2 border-b border-border flex items-center gap-1.5 shrink-0">
        <MessageCircle className="w-4 h-4 text-primary" />
        <span className="font-bold text-sm">Live Chat</span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5 min-h-0">
        {messages.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">No messages yet. Say hi!</p>
        ) : (
          messages.map((m) => (
            <p key={m.id} className="text-sm leading-snug break-words">
              <span className="font-semibold text-primary">{m.display_name}: </span>
              <span>{m.message}</span>
            </p>
          ))
        )}
      </div>

      <form onSubmit={handleSend} className="p-2 border-t border-border flex items-center gap-1.5 shrink-0">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={displayName ? "Type a message…" : "Enter your name to chat"}
          disabled={!displayName}
          maxLength={300}
          className="h-9"
        />
        <Button type="submit" size="icon" className="h-9 w-9 shrink-0" disabled={!displayName || !text.trim() || sending}>
          <Send className="w-4 h-4" />
        </Button>
      </form>
    </div>
  );
}
