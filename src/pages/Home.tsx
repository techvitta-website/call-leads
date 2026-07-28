import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TrendingUp, ArrowRight, Loader, Eye, EyeOff, Mail, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase, signInWithEmail, signUpWithEmail } from "@/lib/supabase";
import { formatCurrencyCompact } from "@/utils/currency";

type UserRole = "owner" | "manager" | "salesman";

const Home = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [showAuthForm, setShowAuthForm] = useState(true);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [selectedRole, setSelectedRole] = useState<UserRole>("manager");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Redirect already-logged-in users to their dashboard
  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: userData } = await supabase
            .from('users')
            .select('role')
            .eq('id', user.id)
            .single();
          if (userData?.role) {
            const role = String(userData.role).toLowerCase();
            const dashboardRoute: Record<string, string> = {
              owner: '/owner',
              manager: '/manager',
              salesman: '/salesman',
            };
            navigate(dashboardRoute[role] || '/owner', { replace: true });
          }
        }
      } catch {
        // not logged in, stay on home
      } finally {
        setIsLoading(false);
      }
    };
    checkSession();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");
    setLoading(true);

    try {
      if (isSignUp) {
        // Sign up logic
        const { data, error: signUpError } = await signUpWithEmail(email, password, fullName, selectedRole);
        
        if (signUpError) {
          setError(signUpError.message);
          setLoading(false);
          return;
        }

        if (data.user) {
          // Ensure user profile exists (upsert to avoid conflicts if trigger already ran)
          const { error: profileError } = await supabase
            .from('users')
            .upsert({
              id: data.user.id,
              email,
              full_name: fullName,
              role: selectedRole,
            }, { onConflict: 'id' });

          if (profileError) {
            setError(profileError.message);
            setLoading(false);
            return;
          }

          setSuccessMessage("Account created successfully! Logging you in...");
          setTimeout(() => {
            const role = String(selectedRole || '').toLowerCase() as UserRole;
            const dashboardRoute = {
              owner: '/owner',
              manager: '/manager',
              salesman: '/salesman',
            };
            navigate(dashboardRoute[role] || '/', { replace: true });
          }, 1500);
        }
      } else {
        // Login logic
        const { data, error: loginError } = await signInWithEmail(email, password);
        
        if (loginError) {
          setError(loginError.message);
          setLoading(false);
          return;
        }

        if (data.user) {
          // Fetch user role
          const { data: userData } = await supabase
            .from('users')
            .select('role')
            .eq('id', data.user.id)
            .single();

          if (userData) {
            const role = String(userData.role || '').toLowerCase() as UserRole;
            const dashboardRoute = {
              owner: '/owner',
              manager: '/manager',
              salesman: '/salesman',
            };
            navigate(dashboardRoute[role] || '/', { replace: true });
          }
        }
      }
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
        <div className="text-center">
          <Loader className="w-12 h-12 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Navigation */}
      <nav className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-900 text-white rounded-lg flex items-center justify-center shadow-sm">
              <TrendingUp className="w-6 h-6" />
            </div>
            <span className="text-slate-900 text-2xl font-bold">SalesFlow</span>
          </div>
          <Button
            className="bg-slate-900 hover:bg-slate-800 text-white"
            onClick={() => setShowAuthForm(!showAuthForm)}
          >
            {showAuthForm ? "Back to Home" : "Get Started"}
          </Button>
        </div>
      </nav>

      {!showAuthForm ? (
        <>
          {/* Hero Section */}
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              {/* Left Content */}
              <div className="space-y-8">
                <div>
                  <h1 className="text-5xl lg:text-6xl font-bold text-slate-900 mb-6 leading-tight">
                    Your Sales,
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-blue-600">
                      {" "}Elevated.
                    </span>
                  </h1>
                  <p className="text-lg text-slate-600 mb-8 leading-relaxed">
                    Manage leads, track performance, and drive sales growth with a professional, modern workspace designed for sales teams.
                  </p>
                </div>

                {/* Feature List */}
                <div className="space-y-4">
                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0 mt-1">
                      <span className="text-sm font-bold">✓</span>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">Real-time Analytics</h3>
                      <p className="text-slate-600 text-sm">Instant visibility into pipeline health and team performance.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0 mt-1">
                      <span className="text-sm font-bold">✓</span>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">Team Collaboration</h3>
                      <p className="text-slate-600 text-sm">Coordinate handoffs, notes, and next steps in one place.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0 mt-1">
                      <span className="text-sm font-bold">✓</span>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">Automated Lead Management</h3>
                      <p className="text-slate-600 text-sm">Stay on top of every prospect with guided workflows.</p>
                    </div>
                  </div>
                </div>

                {/* CTA Buttons */}
                <div className="flex flex-col sm:flex-row gap-4 pt-4">
                  <Button
                    className="bg-slate-900 hover:bg-slate-800 text-white text-lg px-8 py-6 shadow-md"
                    onClick={() => setShowAuthForm(true)}
                  >
                    Get Started <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </div>
              </div>

              {/* Right Side - Stats Preview */}
              <div className="space-y-6">
                <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm">
                  <div className="text-4xl font-bold text-slate-900 mb-2">{formatCurrencyCompact(2400000)}</div>
                  <div className="text-slate-600">Total Pipeline Value</div>
                </div>
                <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm">
                  <div className="text-4xl font-bold text-emerald-600 mb-2">42%</div>
                  <div className="text-slate-600">Conversion Rate</div>
                </div>
                <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm">
                  <div className="text-4xl font-bold text-blue-600 mb-2">245</div>
                  <div className="text-slate-600">Active Leads</div>
                </div>
                <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm">
                  <div className="text-4xl font-bold text-purple-600 mb-2">12</div>
                  <div className="text-slate-600">Team Members</div>
                </div>
              </div>
            </div>
          </div>

          {/* Features Section */}
          <div className="border-t border-slate-200 bg-white/70 py-20">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <h2 className="text-4xl font-bold text-slate-900 text-center mb-12">Why Choose SalesFlow?</h2>
              <div className="grid md:grid-cols-3 gap-8">
                <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm hover:shadow-md transition-shadow">
                  <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center mb-4">
                    <TrendingUp className="w-6 h-6 text-blue-600" />
                  </div>
                  <h3 className="text-xl font-semibold text-slate-900 mb-3">Performance Tracking</h3>
                  <p className="text-slate-600">Monitor team performance with real-time metrics and detailed analytics</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm hover:shadow-md transition-shadow">
                  <div className="w-12 h-12 bg-indigo-50 rounded-lg flex items-center justify-center mb-4">
                    <TrendingUp className="w-6 h-6 text-indigo-600" />
                  </div>
                  <h3 className="text-xl font-semibold text-slate-900 mb-3">Lead Management</h3>
                  <p className="text-slate-600">Organize and manage all your leads in one centralized platform</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm hover:shadow-md transition-shadow">
                  <div className="w-12 h-12 bg-emerald-50 rounded-lg flex items-center justify-center mb-4">
                    <TrendingUp className="w-6 h-6 text-emerald-600" />
                  </div>
                  <h3 className="text-xl font-semibold text-slate-900 mb-3">Role-Based Access</h3>
                  <p className="text-slate-600">Different views for owners, managers, and salespeople</p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-slate-200 bg-white/70 py-8">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-slate-500">
              <p>© 2026 SalesFlow. All rights reserved.</p>
            </div>
          </div>
        </>
      ) : (
        /* Auth Form Section */
        <div className="flex items-center justify-center min-h-[calc(100vh-80px)] p-4">
          <div className="w-full max-w-md">
            <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-md">
              <h2 className="text-3xl font-bold text-slate-900 mb-2 text-center">
                {isSignUp ? "Create Account" : "Welcome back"}
              </h2>
              <p className="text-slate-600 text-center mb-8">
                {isSignUp
                  ? "Sign up with your email to get started"
                  : "Sign in to your account to continue"}
              </p>

              {/* Error Alert */}
              {error && (
                <Alert className="mb-6 border-red-200 bg-red-50">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-600">{error}</AlertDescription>
                </Alert>
              )}

              {/* Success Alert */}
              {successMessage && (
                <Alert className="mb-6 border-green-200 bg-green-50">
                  <Mail className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-600">
                    {successMessage}
                  </AlertDescription>
                </Alert>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Full Name - Only for Sign Up */}
                {isSignUp && (
                  <div>
                    <Label htmlFor="fullName" className="text-slate-800 font-medium mb-2 block">
                      Full Name
                    </Label>
                    <Input
                      id="fullName"
                      type="text"
                      placeholder="John Doe"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required={isSignUp}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>
                )}

                {/* Email */}
                <div>
                  <Label htmlFor="email" className="text-slate-800 font-medium mb-2 block">
                    Email Address
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>

                {/* Password */}
                <div>
                  <Label htmlFor="password" className="text-slate-800 font-medium mb-2 block">
                    Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? (
                        <EyeOff className="w-5 h-5" />
                      ) : (
                        <Eye className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Role Selection - Only for Sign Up */}
                {isSignUp && (
                  <div>
                    <Label className="text-slate-800 font-medium mb-3 block">
                      Select Your Role
                    </Label>
                    <div className="grid grid-cols-2 gap-3">
                      {(["owner", "manager"] as UserRole[]).map((role) => (
                        <button
                          key={role}
                          type="button"
                          onClick={() => setSelectedRole(role)}
                          className={`py-3 px-4 rounded-lg font-medium transition-all ${
                            selectedRole === role
                              ? "bg-slate-900 text-white shadow-lg"
                              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                          }`}
                        >
                          {role.charAt(0).toUpperCase() + role.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Submit Button */}
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-slate-900 text-white font-medium rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading && <Loader className="w-4 h-4 animate-spin" />}
                  {isSignUp ? "Create Account" : "Sign In"}
                </Button>
              </form>

              {/* Account creation is managed by admins — no self-registration */}
              <div className="mt-6 text-center">
                <p className="text-slate-500 text-sm">
                  Need access? Contact your team administrator.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Home;


