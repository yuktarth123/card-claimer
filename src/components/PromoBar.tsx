import React from 'react';
import { MessageCircle, Car } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PromoBarProps {
  className?: string;
}

const WHATSAPP_GROUP_LINK = "https://chat.whatsapp.com/DCAoFdgfAP79GmT7vBEXYu";
const HOT_WHEELS_SITE_URL = "https://yanks-diecast.vercel.app";

// Single-row replacement for the old stacked WhatsAppBanner + CrossPromoBanner
// cards, which together ate 250px+ of vertical space on mobile before a
// visitor ever saw a product.
const PromoBar: React.FC<PromoBarProps> = ({ className }) => {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <a
        href={WHATSAPP_GROUP_LINK}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg bg-success/15 border border-success/30 text-success text-xs sm:text-sm font-semibold hover:bg-success/25 transition"
      >
        <MessageCircle className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="truncate">WhatsApp Group</span>
      </a>
      <a
        href={HOT_WHEELS_SITE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg bg-primary/15 border border-primary/30 text-primary text-xs sm:text-sm font-semibold hover:bg-primary/25 transition"
      >
        <Car className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="truncate">Yanks Diecast</span>
      </a>
    </div>
  );
};

export default PromoBar;
