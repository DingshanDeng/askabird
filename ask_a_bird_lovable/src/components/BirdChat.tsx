import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Bird, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { getBirdAvatar } from "@/assets/birds";

export interface SiteContext {
  lat: number;
  lon: number;
  construction_type: string;
  baseline_score: number;
  impact_score: number;
  delta: number;
  top_species: { name: string; count: number }[];
}

interface BirdChatProps {
  siteContext: SiteContext;
  birdSpecies: string;
  autoOpener?: string;
  initialMessage?: string;
}

type Msg = { role: "user" | "assistant"; content: string; hidden?: boolean };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bird-chat`;

export default function BirdChat({ siteContext, birdSpecies, autoOpener, initialMessage }: BirdChatProps) {
  const [messages, setMessages] = useState<Msg[]>(
    initialMessage ? [{ role: "assistant", content: initialMessage }] : []
  );
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset chat when site context changes
  useEffect(() => {
    setMessages(initialMessage ? [{ role: "assistant", content: initialMessage }] : []);
  }, [siteContext.lat, siteContext.lon, siteContext.construction_type]);

  // Auto-opener: send a hidden seed prompt so the bird greets/reacts immediately.
  // Skipped when initialMessage is provided (greeting is already shown instantly).
  const openerSentRef = useRef<string | null>(null);
  useEffect(() => {
    if (!autoOpener || initialMessage) return;
    const key = `${siteContext.lat},${siteContext.lon},${siteContext.construction_type},${birdSpecies}`;
    if (openerSentRef.current === key) return;
    if (messages.length > 0 || loading) return;
    openerSentRef.current = key;
    send(autoOpener, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpener, siteContext.lat, siteContext.lon, siteContext.construction_type, birdSpecies]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const send = async (text: string, hidden = false) => {
    if (!text.trim() || loading) return;
    const userMsg: Msg = { role: "user", content: text, hidden };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setLoading(true);

    let assistantSoFar = "";
    const upsert = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) =>
            i === prev.length - 1 ? { ...m, content: assistantSoFar } : m,
          );
        }
        return [...prev, { role: "assistant", content: assistantSoFar }];
      });
    };

    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          bird_species: birdSpecies,
          site_context: siteContext,
          messages: next,
        }),
      });

      if (resp.status === 429) {
        toast.error("Rate limit reached. Try again in a moment.");
        setMessages(messages);
        return;
      }
      if (resp.status === 402) {
        toast.error("AI credits exhausted. Add credits in workspace settings.");
        setMessages(messages);
        return;
      }
      if (!resp.ok || !resp.body) throw new Error("Stream failed");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let done = false;
      while (!done) {
        const { done: d, value } = await reader.read();
        if (d) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") {
            done = true;
            break;
          }
          try {
            const parsed = JSON.parse(json);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) upsert(content);
          } catch {
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }
    } catch (e) {
      console.error(e);
      toast.error("Chat failed. Please try again.");
      setMessages(messages);
    } finally {
      setLoading(false);
    }
  };

  const avatar = getBirdAvatar(birdSpecies);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 px-1 pb-2 border-b border-border mb-3">
        {avatar ? (
          <img
            src={avatar}
            alt={birdSpecies}
            loading="lazy"
            className="h-10 w-10 rounded-full object-cover ring-2 ring-saguaro/30 bg-muted"
          />
        ) : (
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-saguaro/15 text-saguaro">
            <Bird className="h-5 w-5" />
          </div>
        )}
        <div>
          <div className="text-sm font-semibold">{birdSpecies}</div>
          <div className="text-xs text-muted-foreground">Local Sonoran resident</div>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto pr-3">
        {messages.filter((m) => !m.hidden).length === 0 && !loading && !autoOpener && (
          <div className="text-sm text-muted-foreground italic px-2 py-8 text-center">
            {siteContext.construction_type === "none"
              ? `Say hello to the ${birdSpecies} — ask about their habitat, neighbors, or what worries them.`
              : `Ask the ${birdSpecies} what they think about this proposed ${siteContext.construction_type.replace("_", " ")}.`}
          </div>
        )}
        <div className="space-y-3">
          {messages.filter((m) => !m.hidden).map((m, i) => {
            if (m.role === "user") {
              return (
                <div
                  key={i}
                  className="ml-auto bg-primary text-primary-foreground rounded-lg px-3 py-2 text-sm max-w-[90%]"
                >
                  {m.content}
                </div>
              );
            }
            return (
              <div key={i} className="flex items-start gap-2 max-w-[95%]">
                {avatar ? (
                  <img
                    src={avatar}
                    alt=""
                    loading="lazy"
                    className="h-7 w-7 rounded-full object-cover ring-1 ring-border/40 bg-muted shrink-0 mt-0.5"
                  />
                ) : (
                  <div className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-saguaro/15 text-saguaro mt-0.5">
                    <Bird className="h-3.5 w-3.5" />
                  </div>
                )}
                <div className="bg-muted text-foreground prose prose-sm max-w-none rounded-lg px-3 py-2 text-sm flex-1">
                  <ReactMarkdown>{m.content || "…"}</ReactMarkdown>
                </div>
              </div>
            );
          })}
          {loading && messages[messages.length - 1]?.role === "user" && (
            <div className="flex items-start gap-2">
              {avatar ? (
                <img
                  src={avatar}
                  alt=""
                  loading="lazy"
                  className="h-7 w-7 rounded-full object-cover ring-1 ring-border/40 bg-muted shrink-0 mt-0.5"
                />
              ) : (
                <div className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-saguaro/15 text-saguaro mt-0.5">
                  <Bird className="h-3.5 w-3.5" />
                </div>
              )}
              <div className="bg-muted text-muted-foreground rounded-lg px-3 py-2 text-sm inline-flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                {birdSpecies} is thinking…
              </div>
            </div>
          )}
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex gap-2 mt-3"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Ask the ${birdSpecies}…`}
          disabled={loading}
        />
        <Button type="submit" size="icon" disabled={loading || !input.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
