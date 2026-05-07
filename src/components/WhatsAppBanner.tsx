import React from 'react';
import { Button } from '@/components/ui/button';
import { MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WhatsAppBannerProps {
  className?: string;
}

const WHATSAPP_GROUP_LINK = "https://chat.whatsapp.com/DCAoFdgfAP79GmT7vBEXYu";

const WhatsAppBanner: React.FC<WhatsAppBannerProps> = ({ className }) => {
  return (
    <div className={cn("bg-card border border-border rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left", className)}>
      <div className="flex items-center gap-3">
        <MessageCircle className="w-6 h-6 text-success flex-shrink-0" />
        <div>
          <p className="font-semibold text-foreground">Join our WhatsApp Group!</p>
          <p className="text-sm text-muted-foreground">Get the latest stock updates and exclusive announcements.</p>
        </div>
      </div>
      <Button asChild className="bg-success hover:bg-success/90 text-success-foreground font-bold flex-shrink-0">
        <a href={WHATSAPP_GROUP_LINK} target="_blank" rel="noopener noreferrer">
          Join Now
        </a>
      </Button>
    </div>
  );
};

export default WhatsAppBanner;