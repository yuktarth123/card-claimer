import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SELLER_NAME } from "@/config"; // Import SELLER_NAME
import AppLogo from "@/components/AppLogo"; // Import AppLogo

interface Props {
  open: boolean;
  initialName?: string;
  initialPhone?: string;
  onSubmit: (name: string, phone: string) => void;
  description?: string;
  title?: string;
  /** When provided, the dialog becomes dismissible (Escape/outside click/a
   * Cancel button) and calling it leaves the buyer's existing identity
   * untouched -- used for the "change" flow so backing out doesn't force a
   * fresh name+phone. Omit for the mandatory first-visit gate, which must
   * stay locked until a name+phone is entered. */
  onCancel?: () => void;
}

export function NameGate({ open, initialName, initialPhone, onSubmit, description, title, onCancel }: Props) {
  const [name, setName] = useState(initialName ?? "");
  const [phone, setPhone] = useState(initialPhone ?? "");

  // Re-sync fields whenever the dialog (re)opens, so a stale edit from a
  // previous open doesn't linger and returning buyers see their saved name.
  useEffect(() => {
    if (open) {
      setName(initialName ?? "");
      setPhone(initialPhone ?? "");
    }
  }, [open, initialName, initialPhone]);

  // Returning buyers from before phone numbers were required already have a
  // name saved but no phone -- ask only for the phone instead of retyping
  // everything. Doesn't apply once editing an already-complete profile
  // (initialPhone set), which always gets the full "update profile" copy.
  const isPhoneOnly = Boolean(initialName) && !initialPhone;

  const phoneDigits = phone.replace(/\D/g, "");
  const phoneValid = phoneDigits.length >= 10 && phoneDigits.length <= 15;
  const nameValid = name.trim().length >= 2;
  const canSubmit = nameValid && phoneValid;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel?.(); }}>
      <DialogContent
        className="sm:max-w-sm [&>button]:hidden"
        onPointerDownOutside={(e) => { if (!onCancel) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (!onCancel) e.preventDefault(); }}
      >
        <DialogHeader>
          <div className="mx-auto w-14 h-14 rounded-full gradient-gold flex items-center justify-center mb-2 shadow-glow">
            <AppLogo className="w-full h-full" alt={`${SELLER_NAME} Logo`} />
          </div>
          <DialogTitle className="text-center text-2xl">{title ?? (isPhoneOnly ? "One more thing!" : "Welcome!")}</DialogTitle>
          <DialogDescription className="text-center">
            {description ?? (isPhoneOnly
              ? "We don't have a phone number on file for you yet — add it so we can reach you about your claims and track your leaderboard XP."
              : "Enter your name and phone to start claiming cards. Your phone helps us track your XP for the monthly leaderboard.")}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) onSubmit(name.trim(), phoneDigits);
          }}
          className="space-y-3 pt-2"
        >
          <Input
            autoFocus
            placeholder="Your name (e.g. Sam)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-12 text-lg"
            maxLength={50}
          />
          <Input
            type="tel"
            inputMode="tel"
            placeholder="Phone number (e.g. 9876543210)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="h-12 text-lg"
            maxLength={20}
          />
          <div className="flex gap-2">
            {onCancel && (
              <Button type="button" variant="outline" className="flex-1 h-12 text-base" onClick={onCancel}>
                Cancel
              </Button>
            )}
            <Button
              type="submit"
              className={onCancel ? "flex-1 h-12 gradient-gold text-primary-foreground font-bold text-base" : "w-full h-12 gradient-gold text-primary-foreground font-bold text-base"}
              disabled={!canSubmit}
            >
              {onCancel ? "Save" : "Enter the Sale"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
