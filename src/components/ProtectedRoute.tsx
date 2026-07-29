import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader, ShieldAlert } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { normalizeRole, homeFor, ROLE_LABEL, type Role } from "@/lib/roles";

interface ProtectedRouteProps {
  children: React.ReactNode;
  /**
   * Who may see this page. Omit to mean "anyone signed in".
   *
   * This used to be omitted everywhere, which meant a salesperson could type
   * /leads or /revenue and see every lead and all revenue in the business.
   */
  allow?: Role[];
}

type State =
  | { status: "checking" }
  | { status: "ok" }
  | { status: "denied"; role: Role | null };

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allow }) => {
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ status: "checking" });

  useEffect(() => {
    let cancelled = false;

    const checkAuth = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          if (!cancelled) navigate("/", { replace: true });
          return;
        }

        if (!allow) {
          if (!cancelled) setState({ status: "ok" });
          return;
        }

        // Read the role from the database rather than the token. A JWT can
        // carry metadata from before a demotion; the row cannot.
        const { data } = await supabase
          .from("users")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();

        const role =
          normalizeRole(data?.role) ??
          normalizeRole(user.user_metadata?.role) ??
          null;

        if (cancelled) return;
        setState(
          role && allow.includes(role) ? { status: "ok" } : { status: "denied", role },
        );
      } catch (error) {
        console.error("Error checking authentication:", error);
        if (!cancelled) navigate("/", { replace: true });
      }
    };

    checkAuth();
    return () => {
      cancelled = true;
    };
    // `allow` is a literal array in every call site, so compare by content
    // rather than identity — otherwise this refetches on every render.
  }, [navigate, allow?.join(",")]);

  if (state.status === "checking") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
        <div className="text-center">
          <Loader className="w-12 h-12 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Say plainly that the page exists but isn't theirs. The old behaviour was
  // navigate("/"), which the landing page then bounced back to the dashboard,
  // producing a silent ping-pong with no explanation.
  if (state.status === "denied") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center">
          <ShieldAlert className="mx-auto mb-4 h-12 w-12 text-amber-500" />
          <h1 className="mb-2 text-xl font-semibold text-slate-900">
            You don't have access to this page
          </h1>
          <p className="mb-6 text-sm text-slate-600">
            {state.role
              ? `Your account is set up as a ${ROLE_LABEL[state.role]}. If you need this, ask an administrator to change your role.`
              : "Your account has no role assigned. Ask an administrator to set one up."}
          </p>
          <button
            onClick={() => navigate(homeFor(state.role), { replace: true })}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Back to my dashboard
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
