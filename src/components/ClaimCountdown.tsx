import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { addMinutes, isPast, parseISO } from 'date-fns'; // Import parseISO
import { Clock } from 'lucide-react';
import { CLAIM_DURATION_MINUTES } from '@/config';

interface ClaimCountdownProps {
  claimedAt: string; // ISO 8601 string
  onExpired: () => void;
  className?: string;
}

const ClaimCountdown: React.FC<ClaimCountdownProps> = ({ claimedAt, onExpired, className }) => {
  const [timeLeft, setTimeLeft] = useState<string | null>(null);
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    const claimedDate = parseISO(claimedAt); // Use parseISO for robust parsing

    // Check if claimedDate is a valid date object
    if (isNaN(claimedDate.getTime())) {
      console.error("ClaimCountdown received an invalid claimedAt date string:", claimedAt);
      setIsExpired(true);
      setTimeLeft("Invalid Date");
      // We don't call onExpired here, as an invalid date is not the same as an expired claim.
      // The component will simply display "Invalid Date".
      return;
    }

    const expiryDate = addMinutes(claimedDate, CLAIM_DURATION_MINUTES);

    const calculateTime = () => {
      if (isPast(expiryDate)) {
        setIsExpired(true);
        setTimeLeft("Expired");
        onExpired(); // Trigger the unclaim logic
        return;
      }

      const now = new Date();
      const difference = expiryDate.getTime() - now.getTime();

      const minutes = Math.floor((difference / (1000 * 60)) % 60);
      const seconds = Math.floor((difference / 1000) % 60);

      setTimeLeft(`${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);
    };

    calculateTime(); // Initial calculation
    const timer = setInterval(calculateTime, 1000);

    return () => clearInterval(timer);
  }, [claimedAt, onExpired]);

  if (!timeLeft) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold",
        isExpired ? "bg-destructive/20 text-destructive border border-destructive/40" : "bg-primary/15 text-primary border border-primary/30",
        className
      )}
    >
      <Clock className="w-3 h-3" />
      <span>{isExpired ? "Claim Expired" : `Expires in ${timeLeft}`}</span>
    </div>
  );
};

export default ClaimCountdown;