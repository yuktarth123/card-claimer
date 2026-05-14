import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SELLER_NAME } from "@/config"; // Import SELLER_NAME
import AppLogo from "@/components/AppLogo"; // Import AppLogo

interface Props {
  open: boolean;
  onSubmit: (name: string, phone: string) => void;
}

export function NameGate({ open, onSubmit }: Props) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  const phoneDigits = phone.replace(/\D/g, "");
  const phoneValid = phoneDigits.length >= 10 && phoneDigits.length <= 15;
  const nameValid = name.trim().length >= 2;
  const canSubmit = nameValid && phoneValid;

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-sm [&>button]:hidden" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="mx-auto w-14 h-14 rounded-full gradient-gold flex items-center justify-center mb-2 shadow-glow">
            <AppLogo className="w-full h-full" alt="Yanks TCG Logo" />
          </div>
          <DialogTitle className="text-center text-2xl">Welcome, Trainer!</DialogTitle>
          <DialogDescription className="text-center">
            Enter your name and phone to start claiming cards. Your phone helps us track your XP for the monthly leaderboard.
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
            placeholder="Your name (e.g. Ash)"
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