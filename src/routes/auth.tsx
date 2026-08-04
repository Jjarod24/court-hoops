import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, useSearch, Link } from "@tanstack/react-router";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { lovable } from "@/integrations/lovable/index";

const searchSchema = z.object({ redirect: z.string().optional() });

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Sign in — CourtQuest" },
      {
        name: "description",
        content:
          "Create your CourtQuest account to check in at courts, log shooting challenges and build your basketball card collection.",
      },
      { property: "og:title", content: "Sign in — CourtQuest" },
      {
        property: "og:description",
        content: "Join CourtQuest and start collecting basketball cards from real courts.",
      },
    ],
  }),
  component: AuthPage,
});

function safePath(value: string | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

function AuthPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/auth" });
  const redirectTo = safePath(search.redirect);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: redirectTo });
    });
  }, [navigate, redirectTo]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}${redirectTo}`,
            data: { username: username || email.split("@")[0] },
          },
        });
        if (error) throw error;
        if (!data.session) {
          setSent(true);
          return;
        }
        navigate({ to: redirectTo });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: redirectTo });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setBusy(true);
    try {
      sessionStorage.setItem("cq_redirect", redirectTo);
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        toast.error("Google sign-in failed. Try again.");
        return;
      }
      if (result.redirected) return;
      navigate({ to: redirectTo });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-5">
      <Link to="/" className="mb-6 text-center">
        <h1 className="font-display text-5xl leading-none text-primary">CourtQuest</h1>
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
          Blacktop card hunt
        </p>
      </Link>

      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-card-deep">
        {sent ? (
          <div className="space-y-3 text-center">
            <h2 className="font-display text-2xl">Check your email</h2>
            <p className="text-sm text-muted-foreground">
              We sent a confirmation link to {email}. Click it to activate your account, then come
              back and sign in.
            </p>
            <Button variant="secondary" className="w-full" onClick={() => setSent(false)}>
              Back
            </Button>
          </div>
        ) : (
          <>
            <h2 className="font-display text-2xl">
              {mode === "signin" ? "Welcome back" : "Create your player"}
            </h2>
            <form onSubmit={submit} className="mt-4 space-y-3">
              {mode === "signup" && (
                <div className="space-y-1.5">
                  <Label htmlFor="username">Player name</Label>
                  <Input
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="hoopsgod"
                    autoComplete="nickname"
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {mode === "signin" ? "Sign in" : "Sign up"}
              </Button>
            </form>

            <div className="my-4 flex items-center gap-3 text-xs uppercase tracking-widest text-muted-foreground">
              <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
            </div>

            <Button variant="secondary" className="w-full" onClick={google} disabled={busy}>
              Continue with Google
            </Button>

            <button
              type="button"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="mt-4 w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              {mode === "signin"
                ? "New here? Create an account"
                : "Already have an account? Sign in"}
            </button>
          </>
        )}
      </div>
    </main>
  );
}
