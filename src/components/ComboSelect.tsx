import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { List } from "lucide-react";

const OTHER = "__other__";
const NONE = "__none__";

interface ComboSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  /** Extra values to fold in, e.g. ones already used in existing listings but not in `options`. */
  extraOptions?: readonly string[];
  placeholder?: string;
}

/** A dropdown seeded with common values, with a "type manually" escape
 * hatch for anything not in the list -- so the list never becomes a wall. */
export function ComboSelect({ value, onChange, options, extraOptions = [], placeholder }: ComboSelectProps) {
  const merged = Array.from(new Set([...options, ...extraOptions])).sort((a, b) => a.localeCompare(b));
  const [manual, setManual] = useState(value !== "" && !merged.includes(value));

  useEffect(() => {
    setManual(value !== "" && !merged.includes(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  if (manual) {
    return (
      <div className="flex gap-1">
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="flex-shrink-0"
          onClick={() => { setManual(false); onChange(""); }}
          title="Choose from list instead"
        >
          <List className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  return (
    <Select
      value={value || NONE}
      onValueChange={(v) => {
        if (v === OTHER) {
          setManual(true);
          onChange("");
        } else if (v === NONE) {
          onChange("");
        } else {
          onChange(v);
        }
      }}
    >
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        <SelectItem value={NONE}>—</SelectItem>
        {merged.map((o) => (
          <SelectItem key={o} value={o}>{o}</SelectItem>
        ))}
        <SelectItem value={OTHER}>Other (type manually)…</SelectItem>
      </SelectContent>
    </Select>
  );
}
