import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SELLER_NAME } from "@/config"; // Import SELLER_NAME
import AppLogo from "@/components/AppLogo"; // Import AppLogo

interface Props {
  open: boolean;
  initialName?: string;
  onSubmit: (name: string, phone: string) => void;
}

export function NameGate({ open, initialName, onSubmit }: Props) {
  const [name, setName] = useState(initialName ?? "");
  const [phone, setPhone] = useState("");

  // Returning buyers from before phone numbers were required already have a
  // name saved -- pre-fill it instead of asking them to type it again, and
  // only really need their phone this time.
  useEffect(() => {
    if (initialName) setName(initialName);
  }, [initialName]);
  const isPhoneOnly = Boolean(initialName);

  const phoneDigits = phone.replace(/\D/g, "");
  const phoneValid = phoneDigits.length >= 10 && phoneDigits.length <= 15;
  const nameValid = name.trim().length >= 2;
  const canSubmit = nameValid && phoneValid;

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-sm [&>button]:hidden" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="mx-auto w-14 h-14 rounded-full gradient-gold flex items-center justify-center mb-2 shadow-glow">
            <AppLogo className="w-full h-full" alt={`${SELLER_NAME} Logo`} />
          </div>
          <DialogTitle className="text-center text-2xl">{isPhoneOnly ? "One more thing!" : "Welcome!"}</DialogTitle>
          <DialogDescription className="text-center">
            {isPhoneOnly
              ? "We don't have a phone number on file for you yet — add it so we can reach you about your claims and track your leaderboard XP."
              : "Enter your name and phone to start claiming cards. Your phone helps us track your XP for the monthly leaderboard."}
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
          <Button
            type="submit"
            className="w-full h-12 gradient-gold text-primary-foreground font-bold text-base"
            disabled={!canSubmit}
          >
            Enter the Sale
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}