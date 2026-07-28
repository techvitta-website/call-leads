import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, BellRing, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { supabase } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Notification {
  id: string;
  /** Human-readable message shown in the list */
  message: string;
  /** ISO timestamp when the notification arrived */
  receivedAt: string;
  /** Whether the user has marked it read */
  read: boolean;
  /** Raw lead id that triggered this notification */
  leadId?: string;
}

interface NotificationBellProps {
  /** Supabase user id of the currently logged-in user */
  userId: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_NOTIFICATIONS = 20;

// Unique channel name per userId so multiple mounts don't collide
const channelName = (userId: string) => `notification-bell-leads-${userId}`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60_000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NotificationBell({ userId }: NotificationBellProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Derived counts
  const unreadCount = notifications.filter((n) => !n.read).length;

  // ------------------------------------------------------------------
  // Add a new notification, respecting the MAX_NOTIFICATIONS cap
  // ------------------------------------------------------------------
  const addNotification = useCallback((n: Omit<Notification, "id" | "read">) => {
    setNotifications((prev) => {
      const next: Notification = {
        ...n,
        id: `${Date.now()}-${Math.random()}`,
        read: false,
      };
      // Prepend newest, drop oldest beyond cap
      const updated = [next, ...prev];
      return updated.slice(0, MAX_NOTIFICATIONS);
    });
  }, []);

  // ------------------------------------------------------------------
  // Supabase realtime subscription
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!userId) return;

    // Clean up any existing channel before creating a new one
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase
      .channel(channelName(userId))
      // New lead assigned to this user
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "leads",
          filter: `assigned_to=eq.${userId}`,
        },
        (payload) => {
          const lead = payload.new as Record<string, any>;
          addNotification({
            message: `New lead assigned: ${lead.company_name ?? "Unknown Company"}`,
            receivedAt: new Date().toISOString(),
            leadId: lead.id,
          });
        },
      )
      // Lead re-assigned to this user (UPDATE where assigned_to changed to userId)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "leads",
          filter: `assigned_to=eq.${userId}`,
        },
        (payload) => {
          const newLead = payload.new as Record<string, any>;
          const oldLead = payload.old as Record<string, any>;

          // Only fire when the assignment itself changed to this user
          if (oldLead?.assigned_to !== userId) {
            addNotification({
              message: `New lead assigned: ${newLead.company_name ?? "Unknown Company"}`,
              receivedAt: new Date().toISOString(),
              leadId: newLead.id,
            });
          }
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIPTION_ERROR") {
          console.error(
            "[NotificationBell] Realtime subscription error for user:",
            userId,
          );
        }
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [userId, addNotification]);

  // ------------------------------------------------------------------
  // Actions
  // ------------------------------------------------------------------

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  // When the panel opens, don't auto-mark as read — user clicks the button
  // When panel closes, keep existing read state

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        >
          {unreadCount > 0 ? (
            <BellRing className="h-5 w-5 text-foreground" />
          ) : (
            <Bell className="h-5 w-5 text-muted-foreground" />
          )}

          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-80 p-0 shadow-lg"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm font-semibold">Notifications</span>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto px-2 py-1 text-xs text-blue-600 hover:text-blue-700"
              onClick={markAllRead}
            >
              <Check className="mr-1 h-3 w-3" />
              Mark all as read
            </Button>
          )}
        </div>

        {/* Notification list */}
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
              <Bell className="h-8 w-8 opacity-30" />
              <p className="text-sm">No new notifications</p>
            </div>
          ) : (
            <ul className="divide-y" role="list">
              {notifications.map((n) => (
                <li
                  key={n.id}
                  className={`flex items-start gap-3 px-4 py-3 transition-colors ${
                    n.read ? "bg-background" : "bg-blue-50 dark:bg-blue-950/20"
                  }`}
                >
                  {/* Unread dot */}
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      n.read ? "bg-transparent" : "bg-blue-500"
                    }`}
                    aria-hidden="true"
                  />

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug text-foreground">
                      {n.message}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatTimestamp(n.receivedAt)}
                    </p>
                  </div>

                  {/* Dismiss button */}
                  <button
                    type="button"
                    onClick={() => dismissNotification(n.id)}
                    className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus:opacity-100 group-hover:opacity-100"
                    aria-label="Dismiss notification"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer — only shown when there are notifications */}
        {notifications.length > 0 && (
          <div className="border-t px-4 py-2 text-right">
            <Button
              variant="ghost"
              size="sm"
              className="h-auto px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setNotifications([])}
            >
              Clear all
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export default NotificationBell;
