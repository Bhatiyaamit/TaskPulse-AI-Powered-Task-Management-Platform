import { useState, useRef, useEffect, useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { MessageCircle, X, Send, Loader2, Bot, User } from "lucide-react";
import { ensureCsrf } from "@/api/client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function AiTaskChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [localInput, setLocalInput] = useState("");

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/ai/chat",
        credentials: "same-origin",
        fetch: async (input, init) => {
          const token = await ensureCsrf();
          return globalThis.fetch(input, {
            ...init,
            headers: {
              ...init?.headers,
              "X-CSRF-Token": token,
            },
          });
        },
      }),
    []
  );

  const { messages, sendMessage, status, error } = useChat({ transport });

  const endOfMessagesRef = useRef<HTMLDivElement>(null);
  const isActive = status === "streaming" || status === "submitted";

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (isOpen && endOfMessagesRef.current) {
      endOfMessagesRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen, status]);

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!localInput.trim() || isActive) return;
    sendMessage({ text: localInput });
    setLocalInput("");
  };

  // Extract display text from a message (works with both parts-based and content-based)
  const getMessageText = (m: any): string => {
    // New parts-based format
    if (m.parts && Array.isArray(m.parts)) {
      return m.parts
        .filter((p: any) => p.type === "text")
        .map((p: any) => p.text)
        .join("");
    }
    // Fallback to legacy content
    if (typeof m.content === "string") return m.content;
    return "";
  };

  // Extract tool invocations from a message
  const getToolParts = (m: any): any[] => {
    if (m.parts && Array.isArray(m.parts)) {
      return m.parts.filter((p: any) => p.type === "tool-invocation");
    }
    // Legacy fallback
    if (m.toolInvocations && Array.isArray(m.toolInvocations)) {
      return m.toolInvocations.map((t: any) => ({
        type: "tool-invocation",
        toolInvocation: t,
      }));
    }
    return [];
  };

  return (
    <>
      {/* Floating Action Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 p-4 bg-indigo-600 text-white rounded-full shadow-xl hover:bg-indigo-700 transition-transform transform hover:scale-105 z-50 flex items-center justify-center"
          title="Ask AI about your tasks"
        >
          <MessageCircle size={28} />
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 w-[400px] h-[600px] max-h-[80vh] bg-white border border-gray-200 rounded-2xl shadow-2xl flex flex-col z-50 overflow-hidden font-sans">
          {/* Header */}
          <div className="bg-indigo-600 text-white p-4 flex justify-between items-center shadow-md z-10">
            <div className="flex items-center gap-2">
              <Bot size={24} />
              <h3 className="font-semibold text-lg">AI Task Chat</h3>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-white hover:text-indigo-200 transition-colors p-1"
            >
              <X size={20} />
            </button>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 bg-gray-50 flex flex-col gap-4">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 space-y-4">
                <Bot size={48} className="opacity-20" />
                <p>
                  I'm your AI Task Assistant.<br />
                  Ask me what's due, check priorities,<br />
                  or find tasks by topic!
                </p>
                <div className="flex gap-2 flex-wrap justify-center mt-4">
                  <span className="text-xs bg-gray-100 px-2 py-1 rounded-full text-gray-500 cursor-default">"What is due tomorrow?"</span>
                  <span className="text-xs bg-gray-100 px-2 py-1 rounded-full text-gray-500 cursor-default">"Do I have urgent tasks?"</span>
                </div>
              </div>
            ) : (
              messages.map((m) => {
                const text = getMessageText(m);
                const toolParts = getToolParts(m);
                const hasContent = text.length > 0 || toolParts.length > 0;

                // Skip empty messages
                if (!hasContent && m.role !== "user") return null;

                return (
                  <div
                    key={m.id}
                    className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl p-3 shadow-sm flex flex-col gap-1 ${
                        m.role === "user"
                          ? "bg-indigo-600 text-white rounded-br-none"
                          : "bg-white border border-gray-200 text-gray-800 rounded-bl-none"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1 opacity-70">
                        {m.role === "user" ? <User size={14} /> : <Bot size={14} />}
                        <span className="text-xs font-medium">
                          {m.role === "user" ? "You" : "Task AI"}
                        </span>
                      </div>

                      {/* Text content */}
                      {text && (
                        m.role === "user" ? (
                          <div className="text-sm whitespace-pre-wrap leading-relaxed">
                            {text}
                          </div>
                        ) : (
                          <div className="text-sm prose prose-sm max-w-none prose-p:leading-relaxed prose-pre:p-0 prose-a:text-indigo-600">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {text}
                            </ReactMarkdown>
                          </div>
                        )
                      )}

                      {/* Tool invocations */}
                      {toolParts.map((part: any, i: number) => {
                        const inv = part.toolInvocation || part;
                        const toolName = inv.toolName || "tool";
                        const isDone = inv.state === "result" || "result" in inv;
                        return (
                          <div
                            key={inv.toolCallId || i}
                            className="mt-1 text-xs bg-gray-100 text-gray-600 p-2 rounded-lg border border-gray-200 flex items-center gap-2"
                          >
                            {!isDone ? (
                              <>
                                <Loader2 size={12} className="animate-spin text-indigo-500" />
                                <span>Calling {toolName}...</span>
                              </>
                            ) : (
                              <>
                                <span className="text-green-600 font-bold">✓</span>
                                <span>Checked {toolName}</span>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
            
            {/* Loading Indicator */}
            {isActive && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 text-gray-800 rounded-2xl rounded-bl-none p-4 shadow-sm flex gap-2 items-center">
                  <Loader2 size={16} className="animate-spin text-indigo-500" />
                  <span className="text-sm text-gray-500">Thinking...</span>
                </div>
              </div>
            )}
            
            {/* Error Indicator */}
            {error && (
              <div className="flex justify-center p-2 bg-red-50 text-red-600 rounded-lg text-sm border border-red-200">
                Error: {error.message || "Failed to send message"}
              </div>
            )}

            <div ref={endOfMessagesRef} />
          </div>

          {/* Input Area */}
          <div className="p-3 bg-white border-t border-gray-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
            <form onSubmit={handleSend} className="relative flex items-end">
              <textarea
                value={localInput}
                onChange={(e) => setLocalInput(e.target.value)}
                placeholder="Ask about your tasks..."
                className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-4 pr-12 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none max-h-32"
                rows={1}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={!localInput.trim()}
                className="absolute right-2 bottom-2 p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 transition-colors flex items-center justify-center z-10 cursor-pointer"
              >
                <Send size={16} />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
