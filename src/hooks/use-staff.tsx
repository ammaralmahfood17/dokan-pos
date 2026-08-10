import { createContext, useContext, useState } from "react";
import { api, type Id, type StaffMember } from "@/lib/api";
import { useWorkspace } from "@/hooks/use-workspace";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";

type Ctx = {
  /** The currently PIN-logged-in staff member, or null. */
  staff: StaffMember | null;
  /** Their id (useful for order creation). */
  staffId: Id<"staffMembers"> | undefined;
  /** Whether a staff member is logged in via PIN. */
  isLoggedIn: boolean;
  /** Open the PIN dialog. */
  openLogin: () => void;
  /** Log out the current PIN session. */
  logout: () => void;
};

const StaffCtx = createContext<Ctx>({
  staff: null,
  staffId: undefined,
  isLoggedIn: false,
  openLogin: () => {},
  logout: () => {},
});

export function useStaff() {
  return useContext(StaffCtx);
}

const STORAGE_KEY = "dokan-staff-id";

export function StaffProvider({ children }: { children: React.ReactNode }) {
  const workspace = useWorkspace();
  const [storedId, setStoredId] = useState<string | null>(() =>
    typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null,
  );
  const [showDialog, setShowDialog] = useState(false);
  const [pin, setPin] = useState(["", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resolve stored staff ID against workspace staff list.
  const allStaff = workspace?.staff ?? [];
  const resolvedStaff = storedId
    ? allStaff.find((s) => s._id === storedId && s.isActive) ?? null
    : null;

  const saveStaff = (id: string | null) => {
    if (id) {
      localStorage.setItem(STORAGE_KEY, id);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
    setStoredId(id);
  };

  const handleSubmitPin = async (codeOverride?: string) => {
    const code = codeOverride ?? pin.join("");
    if (code.length < 4) return;
    setLoading(true);
    setError(null);
    try {
      const staff = await api.operations.getStaffByPin({ pinCode: code });
      if (!staff) {
        setError("Invalid PIN. Try again.");
        setLoading(false);
        return;
      }
      saveStaff(staff._id);
      setShowDialog(false);
      setPin(["", "", "", ""]);
    } catch (err) {
      setError(String(err));
    }
    setLoading(false);
  };

  const logout = () => {
    saveStaff(null);
  };

  return (
    <StaffCtx.Provider
      value={{
        staff: resolvedStaff,
        staffId: resolvedStaff?._id,
        isLoggedIn: !!resolvedStaff,
        openLogin: () => setShowDialog(true),
        logout,
      }}
    >
      {children}

      {/* PIN Login Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader className="text-center">
            <DialogTitle className="flex items-center justify-center gap-2">
              <UserCheck className="size-4" />
              Cashier login
            </DialogTitle>
            <DialogDescription>
              Enter your 4-digit PIN to log in as a cashier.
            </DialogDescription>
          </DialogHeader>

          <div className="flex justify-center gap-2 py-4">
            {pin.map((digit, i) => (
              <input
                key={i}
                type="tel"
                inputMode="numeric"
                maxLength={1}
                autoFocus={i === 0}
                value={digit}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "").slice(0, 1);
                  const next = [...pin];
                  next[i] = val;
                  setPin(next);
                  // Auto-advance to the next box
                  if (val && i < 3) {
                    const nextInput = document.querySelector<HTMLInputElement>(
                      `[data-pin-idx="${i + 1}"]`,
                    );
                    nextInput?.focus();
                  }
                  // Auto-submit once the 4th digit is entered (use the local
                  // `next` value — `pin` in this closure is still stale).
                  if (val && i === 3) {
                    setTimeout(() => handleSubmitPin(next.join("")), 80);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Backspace" && !digit && i > 0) {
                    const prev = document.querySelector<HTMLInputElement>(
                      `[data-pin-idx="${i - 1}"]`,
                    );
                    prev?.focus();
                  }
                  if (e.key === "Enter" && pin.every((d) => d)) {
                    handleSubmitPin();
                  }
                }}
                data-pin-idx={i}
                className={cn(
                  "h-12 w-10 rounded-sm border border-border text-center font-mono text-lg transition-all",
                  digit ? "border-foreground" : "border-border",
                  "focus:border-foreground focus:outline-none focus:ring-1 focus:ring-foreground",
                )}
              />
            ))}
          </div>

          {error && (
            <p className="text-center text-xs text-red-600">{error}</p>
          )}

          <Button
            className="w-full min-h-11"
            disabled={pin.some((d) => !d) || loading}
            onClick={() => handleSubmitPin()}
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              "Log in"
            )}
          </Button>
        </DialogContent>
      </Dialog>
    </StaffCtx.Provider>
  );
}
