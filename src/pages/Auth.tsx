import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useAuth } from "@/hooks/use-auth";
import { ArrowLeft, ArrowRight, Loader2, Mail, UserX } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Wordmark } from "./Landing";

interface AuthProps {
  redirectAfterAuth?: string;
}

function resolveRedirectAfterAuth(
  returnTo: string | null,
  fallback = "/dashboard",
) {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }
  return fallback;
}

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(
    searchParams.get("returnTo"),
    redirectAfterAuth,
  );
  const [step, setStep] = useState<"signIn" | { email: string }>("signIn");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate(redirect);
    }
  }, [authLoading, isAuthenticated, navigate, redirect]);

  const handleEmailSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("email-otp", formData);
      setStep({ email: formData.get("email") as string });
      setIsLoading(false);
    } catch (err) {
      console.error("Email sign-in error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to send verification code. Please try again.",
      );
      setIsLoading(false);
    }
  };

  const handleOtpSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("email-otp", formData);
      navigate(redirect);
    } catch (err) {
      console.error("OTP verification error:", err);
      setError("The verification code you entered is incorrect.");
      setIsLoading(false);
      setOtp("");
    }
  };

  const handleGuestLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await signIn("anonymous");
      navigate(redirect);
    } catch (err) {
      console.error("Guest login error:", err);
      setError(
        `Failed to sign in as guest: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-16 items-center justify-between border-b border-border/60 px-6">
        <button type="button" onClick={() => navigate("/")} className="cursor-pointer">
          <Wordmark />
        </button>
      </header>

      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          {step === "signIn" ? (
            <>
              <h1 className="text-2xl font-bold tracking-tight">
                Get started with Dokan
              </h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Enter your email to log in or sign up. We&apos;ll send you a
                one-time code.
              </p>

              <form onSubmit={handleEmailSubmit} className="mt-8 space-y-4">
                <div className="relative">
                  <Mail className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    name="email"
                    placeholder="name@example.com"
                    type="email"
                    className="ps-10"
                    disabled={isLoading}
                    required
                  />
                </div>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <Button type="submit" className="w-full min-h-11" disabled={isLoading}>
                  {isLoading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <>
                      Continue
                      <ArrowRight className="ms-2 size-4 rtl:hidden" />
                      <ArrowLeft className="ms-2 size-4 hidden rtl:inline" />
                    </>
                  )}
                </Button>
              </form>

              <div className="my-6 flex items-center gap-4">
                <span className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">or</span>
                <span className="h-px flex-1 bg-border" />
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full min-h-11"
                onClick={handleGuestLogin}
                disabled={isLoading}
              >
                <UserX className="me-2 size-4" />
                Continue as guest
              </Button>

              <p className="mt-6 text-center text-xs text-muted-foreground">
                Guests can try the full demo without an account.
              </p>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setStep("signIn")}
                className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
              >
                <ArrowLeft className="size-4 rtl:hidden" />
                <ArrowRight className="size-4 hidden rtl:inline" />
                Change email
              </button>

              <h1 className="text-2xl font-bold tracking-tight">Check your email</h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                We&apos;ve sent a 6-digit code to{" "}
                <span className="font-medium text-foreground">{step.email}</span>
              </p>

              <form onSubmit={handleOtpSubmit} className="mt-8">
                <input type="hidden" name="email" value={step.email} />
                <input type="hidden" name="code" value={otp} />

                <div className="flex justify-center">
                  <InputOTP
                    value={otp}
                    onChange={setOtp}
                    maxLength={6}
                    disabled={isLoading}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && otp.length === 6 && !isLoading) {
                        (e.target as HTMLElement).closest("form")?.requestSubmit();
                      }
                    }}
                  >
                    <InputOTPGroup>
                      {Array.from({ length: 6 }).map((_, index) => (
                        <InputOTPSlot key={index} index={index} />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                </div>

                {error && (
                  <p className="mt-4 text-center text-sm text-red-600">{error}</p>
                )}

                <Button
                  type="submit"
                  className="mt-6 w-full min-h-11"
                  disabled={isLoading || otp.length !== 6}
                >
                  {isLoading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <>
                      Verify and continue
                      <ArrowRight className="ms-2 size-4 rtl:hidden" />
                      <ArrowLeft className="ms-2 size-4 hidden rtl:inline" />
                    </>
                  )}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>

      <footer className="border-t border-border/60 py-5 text-center text-xs text-muted-foreground">
        Secured by Dokan · POS & QR Menu for Bahrain & the Gulf
      </footer>
    </div>
  );
}

export default function AuthPage(props: AuthProps) {
  return (
    <Suspense>
      <Auth {...props} />
    </Suspense>
  );
}