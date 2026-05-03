import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles } from "lucide-react";

interface Props {
  open: boolean;
  onSubmit: (name: string) => void;
}

export function NameGate({ open, onSubmit }: Props) {
  const [value, setValue] = useState("");
  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-sm" hideClose>
        <DialogHeader>
          <div className="mx-auto w-14 h-14 rounded-full gradient-gold flex items-center justify-center mb-2 shadow-glow">
            <Sparkles className="w-7 h-7 text-primary-foreground" />
          </div>
          <DialogTitle className="text-center text-2xl">Welcome, Trainer!</DialogTitle>
          <DialogDescription className="text-center">
            Enter your name to start claiming cards. First-come, first-served!
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (value.trim().length >= 2) onSubmit(value.trim());
          }}
          className="space-y-3 pt-2"
        >
          <Input
            autoFocus
            placeholder="Your name (e.g. Ash)"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="h-12 text-lg"
          />
          <Button
            type="submit"
            className="w-full h-12 gradient-gold text-primary-foreground font-bold text-base"
            disabled={value.trim().length < 2}
          >
            Enter the Sale
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}